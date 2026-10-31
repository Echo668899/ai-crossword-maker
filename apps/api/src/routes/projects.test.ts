import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Lightweight contract checks for project CRUD payloads (route uses same shapes). */
const CreateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  folder: z.string().max(80).optional().nullable(),
  snapshot: z.object({
    title: z.string(),
    seed: z.number(),
    size: z.object({ rows: z.number(), cols: z.number() }),
    grid: z.array(z.string()),
    placements: z.array(z.any()),
    entries: z.array(z.any()),
  }),
});

const PatchProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  archived: z.boolean().optional(),
  expectedRevision: z.number().int().positive(),
});

describe("project CRUD schemas", () => {
  it("requires snapshot on create", () => {
    expect(CreateProjectSchema.safeParse({ title: "x" }).success).toBe(false);
    expect(
      CreateProjectSchema.safeParse({
        title: "Demo",
        snapshot: {
          title: "Demo",
          seed: 1,
          size: { rows: 5, cols: 5 },
          grid: ["#####", "#A###", "#####", "#####", "#####"],
          placements: [],
          entries: [],
        },
      }).success,
    ).toBe(true);
  });

  it("requires expectedRevision on patch for conflict detection", () => {
    expect(PatchProjectSchema.safeParse({ title: "x" }).success).toBe(false);
    expect(PatchProjectSchema.safeParse({ title: "x", expectedRevision: 2 }).success).toBe(true);
    expect(PatchProjectSchema.safeParse({ archived: true, expectedRevision: 1 }).success).toBe(true);
  });
});
