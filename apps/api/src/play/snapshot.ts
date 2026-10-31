import { z } from "zod";

/** Immutable puzzle snapshot stored on puzzle_versions.snapshot_json */
export const PuzzleSnapshotSchema = z.object({
  title: z.string().min(1).max(200),
  seed: z.number().int().nonnegative(),
  engineVersion: z.string().optional(),
  validatorVersion: z.string().optional(),
  reviewState: z.string().default("needs_review"),
  size: z.object({
    rows: z.number().int().min(3).max(31),
    cols: z.number().int().min(3).max(31),
  }),
  /** ASCII rows: letters A–Z, `#` block, `.` empty (should not appear when solved). */
  grid: z.array(z.string().min(1)).min(3),
  placements: z.array(
    z.object({
      entryId: z.string(),
      row: z.number().int().nonnegative(),
      col: z.number().int().nonnegative(),
      direction: z.enum(["across", "down"]),
      length: z.number().int().positive(),
      number: z.number().int().positive(),
    }),
  ),
  entries: z.array(
    z.object({
      id: z.string(),
      answerNormalized: z.string().regex(/^[A-Z]{3,24}$/),
      clue: z.string().max(280),
      displayAnswer: z.string().optional(),
    }),
  ),
});

export type PuzzleSnapshot = z.infer<typeof PuzzleSnapshotSchema>;

export type PlayCell = {
  row: number;
  col: number;
  isBlock: boolean;
  number?: number;
};

export type PlayClue = {
  entryId: string;
  number: number;
  direction: "across" | "down";
  clue: string;
  length: number;
  row: number;
  col: number;
};

/** Public play payload — never includes answer letters. */
export function toPlayPayload(
  snapshot: PuzzleSnapshot,
  meta: {
    token: string;
    title: string;
    allowCheck: boolean;
    allowReveal: boolean;
    expiresAt: string | null;
  },
) {
  const cells: PlayCell[][] = [];
  for (let r = 0; r < snapshot.size.rows; r++) {
    const rowChars = snapshot.grid[r] ?? "";
    const row: PlayCell[] = [];
    for (let c = 0; c < snapshot.size.cols; c++) {
      const ch = rowChars[c] ?? "#";
      row.push({
        row: r,
        col: c,
        isBlock: ch === "#",
      });
    }
    cells.push(row);
  }

  for (const p of snapshot.placements) {
    const cell = cells[p.row]?.[p.col];
    if (cell && !cell.isBlock) {
      cell.number = p.number;
    }
  }

  const clueById = new Map(snapshot.entries.map((e) => [e.id, e.clue]));
  const clues: PlayClue[] = snapshot.placements
    .map((p) => ({
      entryId: p.entryId,
      number: p.number,
      direction: p.direction,
      clue: clueById.get(p.entryId) ?? "",
      length: p.length,
      row: p.row,
      col: p.col,
    }))
    .sort((a, b) => a.number - b.number || a.direction.localeCompare(b.direction));

  return {
    token: meta.token,
    title: meta.title || snapshot.title,
    size: snapshot.size,
    cells,
    clues,
    allowCheck: meta.allowCheck,
    allowReveal: meta.allowReveal,
    expiresAt: meta.expiresAt,
  };
}

export function checkLetters(
  snapshot: PuzzleSnapshot,
  guesses: Array<{ row: number; col: number; letter: string }>,
): { results: Array<{ row: number; col: number; correct: boolean }>; checked: number } {
  const results: Array<{ row: number; col: number; correct: boolean }> = [];
  for (const g of guesses) {
    const expected = snapshot.grid[g.row]?.[g.col];
    if (!expected || expected === "#") {
      results.push({ row: g.row, col: g.col, correct: false });
      continue;
    }
    const letter = g.letter.trim().toUpperCase().slice(0, 1);
    results.push({
      row: g.row,
      col: g.col,
      correct: letter === expected,
    });
  }
  return { results, checked: results.length };
}

/** Reveal answers only when share allows it — still never embed in play GET. */
export function revealGrid(snapshot: PuzzleSnapshot): {
  grid: string[];
} {
  return { grid: snapshot.grid };
}
