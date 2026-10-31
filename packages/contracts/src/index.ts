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

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
