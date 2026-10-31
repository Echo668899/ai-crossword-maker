import { describe, expect, it } from "vitest";
import { buildGrid } from "./build.js";
import { numberBuildResult } from "./number.js";
import { normalizeEntries } from "./normalize.js";
import { validateBuildResult } from "./validate.js";

const WORD_BANK = [
  "SUN",
  "MOON",
  "STAR",
  "MARS",
  "EARTH",
  "ORBIT",
  "COMET",
  "SPACE",
  "SOLAR",
  "LUNAR",
  "ATLAS",
  "OCEAN",
  "RIVER",
  "CLOUD",
  "STORM",
  "PLANT",
  "LEAF",
  "ROOT",
  "SEED",
  "TREE",
  "MUSIC",
  "PIANO",
  "TEMPO",
  "SCALE",
  "NOTES",
];

function pickWords(seed: number, count: number): string[] {
  const out: string[] = [];
  let s = seed >>> 0;
  const pool = [...WORD_BANK];
  for (let i = 0; i < count && pool.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const idx = s % pool.length;
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

describe("property: many seeds produce validator-clean placements", () => {
  it("builds ≥50 reproducible layouts without ghost words on placed subset", () => {
    let checked = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const words = pickWords(seed, 6 + (seed % 5));
      const { entries } = normalizeEntries(
        words.map((w, i) => ({
          id: `w${i}`,
          answerRaw: w,
          clue: `Clue for ${w}`,
          origin: "manual" as const,
          reviewState: "reviewed_by_user" as const,
        })),
      );
      if (entries.length < 3) continue;
      let result = buildGrid({
        entries,
        seed,
        size: "auto",
        nodeBudget: 8_000,
      });
      result = numberBuildResult(result);
      if (result.placedEntryIds.length < 2) continue;
      const placedEntries = entries.filter((e) => result.placedEntryIds.includes(e.id));
      const report = validateBuildResult(
        {
          ...result,
          // Validate only declared placements against grid
        },
        placedEntries,
      );
      // Ghost words / letter mismatches are hard failures
      const hard = report.errors.filter((e) =>
        ["ghost_word", "letter_mismatch", "out_of_bounds", "orphan_letter", "placement_not_on_grid"].includes(
          e.code,
        ),
      );
      expect(hard, `seed ${seed}`).toEqual([]);
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(50);
  });
});
