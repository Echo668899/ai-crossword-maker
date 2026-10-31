import type { BuildResult, Cell, Placement, WordEntry } from "./types.js";

export interface SerializedPuzzle {
  engineVersion: string;
  seed: number;
  size: { rows: number; cols: number };
  grid: string[];
  placements: Placement[];
  entries: Array<Pick<WordEntry, "id" | "answerNormalized" | "displayAnswer" | "clue" | "reviewState" | "origin">>;
  placedEntryIds: string[];
  unplacedEntryIds: string[];
  status: BuildResult["status"];
}

export function cellsToAscii(cells: Cell[][]): string[] {
  return cells.map((row) =>
    row.map((c) => (c.isBlock ? "#" : c.letter ?? ".")).join(""),
  );
}

export function serializePuzzle(result: BuildResult, entries: WordEntry[]): SerializedPuzzle {
  return {
    engineVersion: result.engineVersion,
    seed: result.seed,
    size: result.size,
    grid: cellsToAscii(result.cells),
    placements: result.placements,
    entries: entries.map((e) => ({
      id: e.id,
      answerNormalized: e.answerNormalized,
      displayAnswer: e.displayAnswer,
      clue: e.clue,
      reviewState: e.reviewState,
      origin: e.origin,
    })),
    placedEntryIds: result.placedEntryIds,
    unplacedEntryIds: result.unplacedEntryIds,
    status: result.status,
  };
}

export function puzzleToSvg(result: BuildResult, options?: { cellSize?: number; showAnswers?: boolean }): string {
  const cellSize = options?.cellSize ?? 32;
  const showAnswers = options?.showAnswers ?? false;
  const rows = result.size.rows;
  const cols = result.size.cols;
  const width = cols * cellSize;
  const height = rows * cellSize;
  const numberMap = new Map<string, number>();
  for (const p of result.placements) {
    if (p.number) numberMap.set(`${p.row},${p.col}`, p.number);
  }

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Crossword grid">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="#F5F7FA"/>`);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = result.cells[r]![c]!;
      const x = c * cellSize;
      const y = r * cellSize;
      if (!cell.letter) {
        parts.push(
          `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#1C2430"/>`,
        );
        continue;
      }
      parts.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#ffffff" stroke="#1C2430" stroke-width="1"/>`,
      );
      const n = numberMap.get(`${r},${c}`);
      if (n) {
        parts.push(
          `<text x="${x + 2}" y="${y + 10}" font-size="9" font-family="ui-sans-serif,system-ui,sans-serif" fill="#1C2430">${n}</text>`,
        );
      }
      if (showAnswers) {
        parts.push(
          `<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + 5}" text-anchor="middle" font-size="16" font-family="ui-sans-serif,system-ui,sans-serif" fill="#1C2430">${cell.letter}</text>`,
        );
      }
    }
  }
  parts.push(`</svg>`);
  return parts.join("");
}
