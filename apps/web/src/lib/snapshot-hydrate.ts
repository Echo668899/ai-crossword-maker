import {
  ENGINE_VERSION,
  NORMALIZATION_VERSION,
  numberBuildResult,
  type BuildResult,
  type Cell,
  type WordEntry,
} from "@acm/crossword-engine";

/** Cloud / share snapshot shape used by puzzle_versions.snapshot_json */
export type CloudSnapshot = {
  title: string;
  seed: number;
  engineVersion?: string;
  validatorVersion?: string;
  reviewState?: string;
  size: { rows: number; cols: number };
  grid: string[];
  placements: Array<{
    entryId: string;
    row: number;
    col: number;
    direction: "across" | "down";
    length: number;
    number: number;
  }>;
  entries: Array<{
    id: string;
    answerNormalized: string;
    clue: string;
    displayAnswer?: string;
  }>;
};

export function asciiGridToCells(grid: string[]): Cell[][] {
  return grid.map((row, r) =>
    [...row].map((ch, c) => {
      if (ch === "#") {
        return { row: r, col: c, letter: null, isBlock: true };
      }
      const letter = ch === "." ? null : ch.toUpperCase();
      return { row: r, col: c, letter, isBlock: false };
    }),
  );
}

/** Rebuild maker state from an immutable cloud snapshot (no re-solve). */
export function hydrateFromSnapshot(snapshot: CloudSnapshot): {
  title: string;
  seed: number;
  entries: WordEntry[];
  rows: Array<{ answer: string; clue: string }>;
  result: BuildResult;
} {
  const entries: WordEntry[] = snapshot.entries.map((e) => ({
    id: e.id,
    answerRaw: e.displayAnswer ?? e.answerNormalized,
    answerNormalized: e.answerNormalized,
    displayAnswer: e.displayAnswer ?? e.answerNormalized,
    clue: e.clue,
    origin: "manual",
    reviewState: (snapshot.reviewState as WordEntry["reviewState"]) || "needs_review",
    normalizationVersion: NORMALIZATION_VERSION,
  }));

  const cells = asciiGridToCells(snapshot.grid);
  const placedEntryIds = snapshot.placements.map((p) => p.entryId);
  const placed = new Set(placedEntryIds);
  const unplacedEntryIds = entries.filter((e) => !placed.has(e.id)).map((e) => e.id);

  let crossings = 0;
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < (cells[r]?.length ?? 0); c++) {
      const cell = cells[r]![c]!;
      if (cell.isBlock || !cell.letter) continue;
      const across = snapshot.placements.some(
        (p) =>
          p.direction === "across" &&
          p.row === r &&
          c >= p.col &&
          c < p.col + p.length,
      );
      const down = snapshot.placements.some(
        (p) =>
          p.direction === "down" &&
          p.col === c &&
          r >= p.row &&
          r < p.row + p.length,
      );
      if (across && down) crossings += 1;
    }
  }

  const base: BuildResult = {
    engineVersion: snapshot.engineVersion || ENGINE_VERSION,
    seed: snapshot.seed,
    size: snapshot.size,
    cells,
    placements: snapshot.placements.map((p) => ({ ...p })),
    placedEntryIds,
    unplacedEntryIds,
    crossings,
    nodesExplored: 0,
    status: unplacedEntryIds.length ? "partial" : "solved",
    diagnostics: ["Hydrated from cloud snapshot"],
  };

  const result = numberBuildResult(base);

  return {
    title: snapshot.title,
    seed: snapshot.seed,
    entries,
    rows: entries.map((e) => ({
      answer: e.displayAnswer || e.answerNormalized,
      clue: e.clue,
    })),
    result,
  };
}
