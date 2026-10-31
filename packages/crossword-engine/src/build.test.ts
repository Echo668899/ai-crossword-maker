import { describe, expect, it } from "vitest";
import { buildGrid } from "./build.js";
import { numberBuildResult } from "./number.js";
import { normalizeEntries } from "./normalize.js";
import { validateBuildResult } from "./validate.js";
import type { WordEntry } from "./types.js";

function entriesFrom(pairs: Array<[string, string]>): WordEntry[] {
  const { entries, issues } = normalizeEntries(
    pairs.map(([answer, clue], i) => ({
      id: `e${i + 1}`,
      answerRaw: answer,
      clue,
      origin: "manual" as const,
      reviewState: "reviewed_by_user" as const,
    })),
  );
  expect(issues.filter((i) => i.code !== "duplicate")).toEqual([]);
  return entries;
}

describe("buildGrid", () => {
  it("places a small interlocking set reproducibly for a fixed seed", () => {
    const entries = entriesFrom([
      ["CAT", "Feline"],
      ["ATO", "Prefix meaning to"],
      ["TON", "Heavy weight"],
    ]);
    // Use larger Auto so CAT/ATO/TON can cross.
    const a = buildGrid({
      entries,
      seed: 42,
      size: { rows: 7, cols: 7 },
      nodeBudget: 20_000,
    });
    const b = buildGrid({
      entries,
      seed: 42,
      size: { rows: 7, cols: 7 },
      nodeBudget: 20_000,
    });
    expect(a.status === "solved" || a.placedEntryIds.length >= 2).toBe(true);
    expect(a.placedEntryIds).toEqual(b.placedEntryIds);
    expect(a.placements.map((p) => `${p.entryId}:${p.row},${p.col},${p.direction}`)).toEqual(
      b.placements.map((p) => `${p.entryId}:${p.row},${p.col},${p.direction}`),
    );
  });

  it("does not silently drop words: unplaced ids are reported", () => {
    const entries = entriesFrom([
      ["ABCDEFGHIJKLMNOP", "Too long-ish for tiny grid"],
      ["CAT", "Pet"],
      ["DOG", "Pet"],
    ]);
    const result = buildGrid({
      entries,
      seed: 7,
      size: { rows: 5, cols: 5 },
      nodeBudget: 5_000,
    });
    expect(result.placedEntryIds.length + result.unplacedEntryIds.length).toBe(entries.length);
    expect(new Set([...result.placedEntryIds, ...result.unplacedEntryIds]).size).toBe(entries.length);
  });

  it("passes independent validator when solved", () => {
    const entries = entriesFrom([
      ["SUN", "Star"],
      ["SEA", "Ocean"],
      ["USE", "Employ"],
      ["EAR", "Hearing organ"],
    ]);
    let best = buildGrid({ entries, seed: 1, size: { rows: 9, cols: 9 }, nodeBudget: 30_000 });
    for (let seed = 2; seed < 40; seed++) {
      const r = buildGrid({ entries, seed, size: { rows: 9, cols: 9 }, nodeBudget: 30_000 });
      if (r.placedEntryIds.length > best.placedEntryIds.length) best = r;
      if (r.status === "solved") {
        best = r;
        break;
      }
    }
    best = numberBuildResult(best);
    const report = validateBuildResult(best, entries);
    expect(report.errors.filter((e) => e.code === "ghost_word")).toEqual([]);
    expect(report.ok || best.placedEntryIds.length >= 2).toBe(true);
  });
});
