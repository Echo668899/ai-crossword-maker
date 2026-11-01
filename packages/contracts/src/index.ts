import { z } from "zod";

export const MakerModeSchema = z.enum(["topic", "words", "manual", "paste", "import"]);
export type MakerMode = z.infer<typeof MakerModeSchema>;

export const ManualEntrySchema = z.object({
  answer: z.string().min(1).max(64),
  clue: z.string().max(280).default(""),
});

export const BuildGridRequestSchema = z.object({
  entries: z.array(ManualEntrySchema).min(1).max(30),
  seed: z.number().int().nonnegative().default(1),
  size: z
    .union([
      z.literal("auto"),
      z.object({ rows: z.number().int().min(5).max(31), cols: z.number().int().min(5).max(31) }),
    ])
    .default("auto"),
});

export type BuildGridRequest = z.infer<typeof BuildGridRequestSchema>;

export const TopicGenerateRequestSchema = z.object({
  topic: z.string().min(2).max(120),
  wordCount: z.number().int().min(5).max(30).default(12),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  audience: z.enum(["general", "teachers", "esl", "kids"]).default("general"),
  turnstileToken: z.string().optional(),
});

export type TopicGenerateRequest = z.infer<typeof TopicGenerateRequestSchema>;

export const TopicGenerateResponseSchema = z.object({
  title: z.string(),
  themeBlurb: z.string().optional(),
  entries: z.array(
    z.object({
      answer: z.string(),
      clue: z.string(),
    }),
  ),
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

export type TopicGenerateResponse = z.infer<typeof TopicGenerateResponseSchema>;

/** Fill classroom clues for an existing answer list (Word list / per-entry AI). */
export const ClueGenerateRequestSchema = z.object({
  answers: z.array(z.string().min(1).max(64)).min(1).max(30),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  topic: z.string().max(120).optional(),
  audience: z.enum(["general", "teachers", "esl", "kids"]).default("general"),
  turnstileToken: z.string().optional(),
});

export type ClueGenerateRequest = z.infer<typeof ClueGenerateRequestSchema>;

export const ClueQuotaSchema = z.object({
  /** Pro / paid subscribers skip the free daily cap. */
  unlimited: z.boolean().optional(),
  isPro: z.boolean().optional(),
  limit: z.number().int().nullable().optional(),
  remaining: z.number().int().nullable().optional(),
  day: z.string().optional(),
});

export const ClueGenerateResponseSchema = z.object({
  clues: z.array(
    z.object({
      answer: z.string(),
      clue: z.string(),
    }),
  ),
  reviewState: z.literal("needs_review"),
  quota: ClueQuotaSchema.optional(),
  model: z.string().optional(),
  mock: z.boolean().optional(),
});

export type ClueGenerateResponse = z.infer<typeof ClueGenerateResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
