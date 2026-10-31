import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";
import { buildExamplePuzzle } from "./build-example";

describe("examples quality", () => {
  it("ships at least 20 unique topic examples", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(20);
    const slugs = new Set(EXAMPLES.map((e) => e.slug));
    expect(slugs.size).toBe(EXAMPLES.length);
  });

  it("uses English A–Z answers and non-empty blurbs/clues", () => {
    for (const ex of EXAMPLES) {
      expect(ex.title.trim().length).toBeGreaterThan(2);
      expect(ex.topic.trim().length).toBeGreaterThan(2);
      expect(ex.blurb.trim().length).toBeGreaterThan(20);
      expect(ex.entries.length).toBeGreaterThanOrEqual(6);
      for (const entry of ex.entries) {
        expect(entry.answer).toMatch(/^[A-Z]{3,24}$/);
        expect(entry.clue.trim().length).toBeGreaterThan(3);
        expect(entry.clue.toUpperCase()).not.toContain(entry.answer);
      }
    }
  });

  it("places a majority of entries for each example seed search", () => {
    for (const ex of EXAMPLES) {
      const built = buildExamplePuzzle(ex);
      const ratio = built.result.placedEntryIds.length / ex.entries.length;
      expect(ratio).toBeGreaterThanOrEqual(0.5);
      expect(built.across.length + built.down.length).toBe(built.result.placements.length);
      expect(built.svgBlank).toContain("<svg");
      expect(built.svgAnswers).toContain("<svg");
    }
  });
});
