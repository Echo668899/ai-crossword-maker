import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { TopicGenerateRequest } from "@acm/contracts";
import { generateModel, maxRetries, type ApiEnv } from "../env";
import {
  sanitizeTopicOutput,
  TopicModelOutputSchema,
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
  return [
    `Create an educational English crossword word list for the topic below.`,
    `Topic: ${req.topic}`,
    `Target word count: ${req.wordCount}`,
    `Difficulty: ${req.difficulty}`,
    `Audience: ${req.audience}`,
    ``,
    `Rules:`,
    `- Answers must be single English words or short phrases using only A–Z letters once spaces/punctuation are removed.`,
    `- Prefer answers of 3–24 letters after removing spaces, hyphens, and apostrophes.`,
    `- Clues must be classroom-safe, specific, and must not contain the answer verbatim.`,
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
              "You propose crossword answers and clues only. The host application owns grid layout, numbering, validation, billing, and IDs.",
          },
          { role: "user", content: buildPrompt(req) },
        ],
        text: {
          format: zodTextFormat(TopicModelOutputSchema, "topic_crossword"),
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

      const parsed = TopicModelOutputSchema.safeParse(response.output_parsed);
      if (!parsed.success) {
        lastError = {
          code: "schema_mismatch",
          message: "AI output failed schema validation.",
          retryable: true,
        };
        continue;
      }

      const sanitized = sanitizeTopicOutput(parsed.data, req.wordCount);
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
