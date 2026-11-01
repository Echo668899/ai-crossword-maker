import { cellsToAscii } from "@acm/crossword-engine";
import type { BuiltExample } from "./build-example";

export type ExamplePlayPayload = {
  token: string;
  title: string;
  size: { rows: number; cols: number };
  cells: Array<Array<{ row: number; col: number; isBlock: boolean; number?: number }>>;
  clues: Array<{
    entryId: string;
    number: number;
    direction: "across" | "down";
    clue: string;
    length: number;
    row: number;
    col: number;
  }>;
  allowCheck: boolean;
  allowReveal: boolean;
  expiresAt: string | null;
};

/** Build a no-answer play payload + solution grid from a built example (SSG / client demo). */
export function exampleToLocalPlay(
  example: { slug: string; title: string },
  built: BuiltExample,
): { payload: ExamplePlayPayload; solutionGrid: string[] } {
  const solutionGrid = cellsToAscii(built.result.cells);
  const placed = new Set(built.result.placedEntryIds);
  const clueById = new Map(
    built.entries.filter((e) => placed.has(e.id)).map((e) => [e.id, e.clue]),
  );

  const cells: ExamplePlayPayload["cells"] = built.result.cells.map((row, r) =>
    row.map((cell, c) => ({
      row: r,
      col: c,
      isBlock: cell.isBlock,
    })),
  );
  for (const p of built.result.placements) {
    const cell = cells[p.row]?.[p.col];
    if (cell && !cell.isBlock) cell.number = p.number;
  }

  const clues = built.result.placements
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
    payload: {
      token: `example:${example.slug}`,
      title: `${example.title} (Sample play)`,
      size: built.result.size,
      cells,
      clues,
      allowCheck: true,
      allowReveal: true,
      expiresAt: null,
    },
    solutionGrid,
  };
}
