import { describe, expect, it } from "vitest";
import { CEFR_PRESETS, cefrMakerHref } from "./cefr-presets";
import { getExample } from "./examples";

describe("CEFR presets", () => {
  it("covers A1–C1 with maker deep links and real example slugs", () => {
    expect(CEFR_PRESETS.map((p) => p.level)).toEqual(["A1", "A2", "B1", "B2", "C1"]);
    for (const preset of CEFR_PRESETS) {
      expect(preset.topic.length).toBeGreaterThan(10);
      expect(["easy", "medium", "hard"]).toContain(preset.difficulty);
      expect(preset.exampleSlugs.length).toBeGreaterThanOrEqual(2);
      for (const slug of preset.exampleSlugs) {
        expect(getExample(slug), `missing example ${slug}`).toBeTruthy();
      }
      const href = cefrMakerHref("/esl-crossword-generator/", preset);
      expect(href).toContain("/esl-crossword-generator/?");
      expect(href).toContain("difficulty=");
      expect(href).toContain("#maker");
    }
  });
});
