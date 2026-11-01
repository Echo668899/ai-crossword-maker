import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ClueGenerateRequest, TopicGenerateRequest } from "@acm/contracts";
import { generateModel, maxRetries, rewriteModel, type ApiEnv } from "../env";
import {
  ClueModelOutputSchema,
  sanitizeClueOutput,
  sanitizeTopicOutput,
  TopicModelOutputSchema,
  TopicModelWordsOnlySchema,
  type SanitizeClueResult,
  type SanitizeResult,
} from "./schema";

export type TopicProviderSuccess = SanitizeResult & {
  model: string;
  requestId: string | null;
  latencyMs: number;
};

export type TopicProviderFailure = {
  code:
    | "refusal"
    | "empty_output"
    | "schema_mismatch"
    | "insufficient_entries"
    | "rate_limited"
    | "timeout"
    | "upstream";
  message: string;
  retryable: boolean;
};

export type TopicProviderResult =
  | { ok: true; value: TopicProviderSuccess }
  | { ok: false; error: TopicProviderFailure };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPrompt(req: TopicGenerateRequest): string {
  const wordsOnly = req.entryStyle === "words_only";
  return [
    wordsOnly
      ? `Create an educational English crossword vocabulary list (answers only, no clues) for the topic below.`
      : `Create an educational English crossword word list for the topic below.`,
    `Topic: ${req.topic}`,
    `Target word count: ${req.wordCount}`,
    `Difficulty: ${req.difficulty}`,
    `Audience: ${req.audience}`,
    `Output style: ${wordsOnly ? "words_only (answers only)" : "words_and_clues (answer + classroom clue)"}`,
    ``,
    `Rules:`,
    `- Answers must be single English words or short phrases using only A–Z letters once spaces/punctuation are removed.`,
    `- Prefer answers of 3–24 letters after removing spaces, hyphens, and apostrophes.`,
    wordsOnly
      ? `- Do not invent clues, definitions, citations, URLs, or “verified” claims — return answers only.`
      : `- Clues must be classroom-safe, specific, and must not contain the answer verbatim.`,
    `- Do not invent citations, URLs, or “verified” claims.`,
    `- Return exactly ${req.wordCount} distinct entries when possible.`,
    `- Never include grid coordinates, numbering, validation flags, prices, or ownership fields.`,
  ].join("\n");
}

function classifyUpstream(err: unknown): TopicProviderFailure {
  const anyErr = err as {
    status?: number;
    code?: string;
    message?: string;
    name?: string;
  };
  const status = anyErr?.status;
  const msg = typeof anyErr?.message === "string" ? anyErr.message : "Upstream AI error";

  if (status === 429) {
    return { code: "rate_limited", message: "AI provider rate limited the request.", retryable: true };
  }
  if (status === 408 || /timeout/i.test(msg) || anyErr?.name === "APIConnectionTimeoutError") {
    return { code: "timeout", message: "AI provider timed out.", retryable: true };
  }
  if (status && status >= 500) {
    return { code: "upstream", message: "AI provider is temporarily unavailable.", retryable: true };
  }
  return { code: "upstream", message: "AI provider request failed.", retryable: false };
}

export async function generateTopicEntries(
  env: ApiEnv,
  req: TopicGenerateRequest,
): Promise<TopicProviderResult> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: { code: "upstream", message: "OPENAI_API_KEY is not configured.", retryable: false },
    };
  }

  const client = new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: 45_000,
  });
  const model = generateModel(env);
  const retries = maxRetries(env);
  const started = Date.now();
  const wordsOnly = req.entryStyle === "words_only";
  const outputSchema = wordsOnly ? TopicModelWordsOnlySchema : TopicModelOutputSchema;
  const schemaName = wordsOnly ? "topic_crossword_words_only" : "topic_crossword";

  let lastError: TopicProviderFailure | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await sleep(250 * 2 ** (attempt - 1));
    }

    try {
      const response = await client.responses.parse({
        model,
        store: false,
        input: [
          {
            role: "system",
            content: wordsOnly
              ? "You propose crossword answers only (no clues). The host application owns grid layout, numbering, validation, billing, and IDs."
              : "You propose crossword answers and clues only. The host application owns grid layout, numbering, validation, billing, and IDs.",
          },
          { role: "user", content: buildPrompt(req) },
        ],
        text: {
          format: zodTextFormat(outputSchema, schemaName),
        },
      });

      const requestId =
        (response as { _request_id?: string | null })._request_id ??
        response.id ??
        null;

      if (response.error) {
        lastError = {
          code: "upstream",
          message: "AI provider returned an error payload.",
          retryable: true,
        };
        continue;
      }

      // Explicit refusal path from Responses API
      const refusal = response.output?.find(
        (item) =>
          item.type === "message" &&
          Array.isArray(item.content) &&
          item.content.some((c) => c.type === "refusal"),
      );
      if (refusal || response.output_parsed == null) {
        const hasRefusal =
          Boolean(refusal) ||
          response.output?.some(
            (item) =>
              item.type === "message" &&
              item.content?.some((c) => (c as { type?: string }).type === "refusal"),
          );
        if (hasRefusal) {
          return {
            ok: false,
            error: {
              code: "refusal",
              message: "The model refused this topic. Try a classroom-safe topic, or use manual mode.",
              retryable: false,
            },
          };
        }
        lastError = {
          code: "empty_output",
          message: "AI returned empty output.",
          retryable: true,
        };
        continue;
      }

      const parsed = outputSchema.safeParse(response.output_parsed);
      if (!parsed.success) {
        lastError = {
          code: "schema_mismatch",
          message: "AI output failed schema validation.",
          retryable: true,
        };
        continue;
      }

      const sanitized = sanitizeTopicOutput(parsed.data, req.wordCount, {
        allowEmptyClues: wordsOnly,
      });
      if (sanitized.entries.length < 5) {
        lastError = {
          code: "insufficient_entries",
          message: `AI returned too few usable answers (${sanitized.entries.length}).`,
          retryable: true,
        };
        continue;
      }

      return {
        ok: true,
        value: {
          ...sanitized,
          model,
          requestId,
          latencyMs: Date.now() - started,
        },
      };
    } catch (err) {
      lastError = classifyUpstream(err);
      if (!lastError.retryable) {
        return { ok: false, error: lastError };
      }
    }
  }

  return {
    ok: false,
    error: lastError ?? {
      code: "upstream",
      message: "AI provider failed after retries.",
      retryable: false,
    },
  };
}

export type ClueProviderSuccess = SanitizeClueResult & {
  model: string;
  requestId: string | null;
  latencyMs: number;
};

export type ClueProviderResult =
  | { ok: true; value: ClueProviderSuccess }
  | { ok: false; error: TopicProviderFailure };

function buildCluePrompt(req: ClueGenerateRequest, answers: string[]): string {
  return [
    `Write classroom-safe English crossword clues for the answers below.`,
    req.topic?.trim() ? `Topic context: ${req.topic.trim()}` : `Topic context: general vocabulary`,
    `Difficulty: ${req.difficulty}`,
    `Audience: ${req.audience}`,
    ``,
    `Answers (keep each answer exactly; only invent clues):`,
    ...answers.map((a, i) => `${i + 1}. ${a}`),
    ``,
    `Rules:`,
    `- Return one clue per listed answer. Do not add, drop, or rename answers.`,
    `- Clues must be specific, classroom-safe, and must not contain the answer verbatim.`,
    `- Do not invent citations, URLs, or “verified” claims.`,
    `- Never include grid coordinates, numbering, validation flags, prices, or ownership fields.`,
  ].join("\n");
}

/** Generate clues for a fixed answer list (does not invent new answers). */
export async function generateCluesForAnswers(
  env: ApiEnv,
  req: ClueGenerateRequest,
): Promise<ClueProviderResult> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: { code: "upstream", message: "OPENAI_API_KEY is not configured.", retryable: false },
    };
  }

  const answers = [
    ...new Set(
      req.answers
        .map((a) => a.toUpperCase().replace(/[^A-Z]/g, ""))
        .filter((a) => a.length >= 3 && a.length <= 24),
    ),
  ].slice(0, 30);

  if (answers.length < 1) {
    return {
      ok: false,
      error: {
        code: "insufficient_entries",
        message: "Need at least one valid A–Z answer (3–24 letters).",
        retryable: false,
      },
    };
  }

  const client = new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: 45_000,
  });
  const model = rewriteModel(env);
  const retries = maxRetries(env);
  const started = Date.now();

  let lastError: TopicProviderFailure | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await sleep(250 * 2 ** (attempt - 1));
    }

    try {
      const response = await client.responses.parse({
        model,
        store: false,
        input: [
          {
            role: "system",
            content:
              "You write crossword clues for provided answers only. Never change the answer list. The host application owns grid layout, numbering, validation, billing, and IDs.",
          },
          { role: "user", content: buildCluePrompt(req, answers) },
        ],
        text: {
          format: zodTextFormat(ClueModelOutputSchema, "crossword_clues"),
        },
      });

      const requestId =
        (response as { _request_id?: string | null })._request_id ??
        response.id ??
        null;

      if (response.error) {
        lastError = {
          code: "upstream",
          message: "AI provider returned an error payload.",
          retryable: true,
        };
        continue;
      }

      if (response.output_parsed == null) {
        lastError = {
          code: "empty_output",
          message: "AI returned empty clue output.",
          retryable: true,
        };
        continue;
      }

      const parsed = ClueModelOutputSchema.safeParse(response.output_parsed);
      if (!parsed.success) {
        lastError = {
          code: "schema_mismatch",
          message: "AI clue output failed schema validation.",
          retryable: true,
        };
        continue;
      }

      const sanitized = sanitizeClueOutput(parsed.data, answers);
      if (sanitized.clues.length < 1) {
        lastError = {
          code: "insufficient_entries",
          message: "AI returned no usable clues for the given answers.",
          retryable: true,
        };
        continue;
      }

      return {
        ok: true,
        value: {
          ...sanitized,
          model,
          requestId,
          latencyMs: Date.now() - started,
        },
      };
    } catch (err) {
      lastError = classifyUpstream(err);
      if (!lastError.retryable) {
        return { ok: false, error: lastError };
      }
    }
  }

  return {
    ok: false,
    error: lastError ?? {
      code: "upstream",
      message: "AI provider failed after retries.",
      retryable: false,
    },
  };
}
