import { z } from "zod";
import { limits } from "@acm/config";

/** Model-facing Structured Outputs schema. Forbidden fields (grid, coords, etc.) are never included. */
export const TopicModelOutputSchema = z.object({
  title: z.string().min(1).max(120),
  theme_blurb: z.string().min(1).max(280),
  entries: z
    .array(
      z.object({
        answer: z.string().min(1).max(64),
        clue: z.string().min(1).max(280),
      }),
    )
    .min(limits.minWords)
    .max(limits.maxWords),
});

export type TopicModelOutput = z.infer<typeof TopicModelOutputSchema>;

export const TopicApiEntrySchema = z.object({
  answer: z.string(),
  clue: z.string(),
});

export const TopicApiResponseSchema = z.object({
  title: z.string(),
  themeBlurb: z.string().optional(),
  entries: z.array(TopicApiEntrySchema),
  reviewState: z.literal("needs_review"),
  quota: z
    .object({
      limit: z.number().int(),
      remaining: z.number().int(),
      day: z.string(),
    })
    .optional(),
  model: z.string().optional(),
  mock: z.boolean().optional(),
});

export type TopicApiResponse = z.infer<typeof TopicApiResponseSchema>;

const ANSWER_RE = /^[A-Z]+$/;

export type SanitizedEntry = { answer: string; clue: string };

export type SanitizeResult = {
  title: string;
  themeBlurb: string;
  entries: SanitizedEntry[];
  dropped: number;
};

/** Server-side business validation after Structured Outputs parse. */
export function sanitizeTopicOutput(
  raw: TopicModelOutput,
  wordCount: number,
): SanitizeResult {
  const seen = new Set<string>();
  const entries: SanitizedEntry[] = [];
  let dropped = 0;

  for (const row of raw.entries) {
    const answer = row.answer
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, limits.maxAnswerLen);
    const clue = row.clue.trim().replace(/\s+/g, " ").slice(0, 280);
    if (
      answer.length < limits.minAnswerLen ||
      answer.length > limits.maxAnswerLen ||
      !ANSWER_RE.test(answer) ||
      !clue ||
      seen.has(answer)
    ) {
      dropped += 1;
      continue;
    }
    seen.add(answer);
    entries.push({ answer, clue });
    if (entries.length >= wordCount) break;
  }

  const title = raw.title.trim().slice(0, 120) || "Crossword";
  const themeBlurb = raw.theme_blurb.trim().slice(0, 280);

  return { title, themeBlurb, entries, dropped };
}
