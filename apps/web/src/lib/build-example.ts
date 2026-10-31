import {
  buildGrid,
  normalizeEntries,
  numberBuildResult,
  puzzleToSvg,
  validateBuildResult,
  type BuildResult,
  type WordEntry,
} from "@acm/crossword-engine";
import type { ExamplePuzzle } from "./examples";

export interface BuiltExample {
  entries: WordEntry[];
  result: BuildResult;
  svgBlank: string;
  svgAnswers: string;
  across: Array<{ number: number; clue: string; length: number }>;
  down: Array<{ number: number; clue: string; length: number }>;
  validationOk: boolean;
}

export function buildExamplePuzzle(example: ExamplePuzzle, seed = 11): BuiltExample {
  const { entries } = normalizeEntries(
    example.entries.map((e, i) => ({
      id: `${example.slug}-${i + 1}`,
      answerRaw: e.answer,
      clue: e.clue,
      origin: "example" as const,
      reviewState: example.reviewState === "human_reviewed" ? "human_reviewed" : "sample",
    })),
  );
  let best = numberBuildResult(
    buildGrid({ entries, seed, size: "auto", nodeBudget: 25_000 }),
  );
  for (let s = seed; s < seed + 25; s++) {
    const candidate = numberBuildResult(
      buildGrid({ entries, seed: s, size: "auto", nodeBudget: 20_000 }),
    );
    if (candidate.placedEntryIds.length > best.placedEntryIds.length) best = candidate;
    if (candidate.status === "solved") {
      best = candidate;
      break;
    }
  }
  const report = validateBuildResult(best, entries);
  const map = new Map(entries.map((e) => [e.id, e]));
  const across = best.placements
    .filter((p) => p.direction === "across")
    .sort((a, b) => a.number - b.number)
    .map((p) => ({
      number: p.number,
      clue: map.get(p.entryId)?.clue ?? "",
      length: map.get(p.entryId)?.answerNormalized.length ?? p.length,
    }));
  const down = best.placements
    .filter((p) => p.direction === "down")
    .sort((a, b) => a.number - b.number)
    .map((p) => ({
      number: p.number,
      clue: map.get(p.entryId)?.clue ?? "",
      length: map.get(p.entryId)?.answerNormalized.length ?? p.length,
    }));
  return {
    entries,
    result: best,
    svgBlank: puzzleToSvg(best, { showAnswers: false, cellSize: 28 }),
    svgAnswers: puzzleToSvg(best, { showAnswers: true, cellSize: 28 }),
    across,
    down,
    validationOk: report.ok,
  };
}
