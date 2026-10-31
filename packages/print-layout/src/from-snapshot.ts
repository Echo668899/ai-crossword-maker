import {
  ENGINE_VERSION,
  type BuildResult,
  type Cell,
  type WordEntry,
} from "@acm/crossword-engine";

/** Minimal snapshot shape needed to rebuild PDF inputs (matches API PuzzleSnapshot). */
export type PackSnapshot = {
  title: string;
  seed: number;
  engineVersion?: string;
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

/**
 * Reconstruct a BuildResult + WordEntry[] from a stored puzzle snapshot.
 * Used for pack ZIP PDF generation — does not re-run the solver.
 */
export function snapshotToPdfInputs(snapshot: PackSnapshot): {
  result: BuildResult;
  entries: WordEntry[];
} {
  const cells: Cell[][] = [];
  for (let r = 0; r < snapshot.size.rows; r++) {
    const rowChars = snapshot.grid[r] ?? "";
    const row: Cell[] = [];
    for (let c = 0; c < snapshot.size.cols; c++) {
      const ch = rowChars[c] ?? "#";
      const isBlock = ch === "#";
      row.push({
        row: r,
        col: c,
        letter: isBlock ? null : ch,
        isBlock,
      });
    }
    cells.push(row);
  }

  for (const p of snapshot.placements) {
    const cell = cells[p.row]?.[p.col];
    if (!cell || cell.isBlock) continue;
    if (p.direction === "across") cell.acrossNumber = p.number;
    else cell.downNumber = p.number;
  }

  const placed = new Set(snapshot.placements.map((p) => p.entryId));
  const entries: WordEntry[] = snapshot.entries.map((e) => ({
    id: e.id,
    answerRaw: e.displayAnswer ?? e.answerNormalized,
    answerNormalized: e.answerNormalized,
    displayAnswer: e.displayAnswer ?? e.answerNormalized,
    clue: e.clue,
    origin: "manual",
    reviewState: "needs_review",
    normalizationVersion: "1",
  }));

  const result: BuildResult = {
    engineVersion: snapshot.engineVersion ?? ENGINE_VERSION,
    seed: snapshot.seed,
    size: snapshot.size,
    cells,
    placements: snapshot.placements,
    placedEntryIds: [...placed],
    unplacedEntryIds: entries.filter((e) => !placed.has(e.id)).map((e) => e.id),
    crossings: 0,
    nodesExplored: 0,
    status: "solved",
    diagnostics: [],
  };

  return { result, entries };
}
