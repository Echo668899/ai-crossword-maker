import type { BuildResult, Cell, NumberedPuzzle, Placement } from "./types.js";

/** Assign crossword numbers from top-left reading order. Shared starts share a number. */
export function numberPlacements(cells: Cell[][], placements: Placement[]): NumberedPuzzle {
  const starts = new Map<string, number>();
  let next = 1;

  const sorted = [...placements].sort((a, b) => a.row - b.row || a.col - b.col || a.direction.localeCompare(b.direction));
  const numbered: Placement[] = [];

  for (const p of sorted) {
    const key = `${p.row},${p.col}`;
    let n = starts.get(key);
    if (n === undefined) {
      n = next++;
      starts.set(key, n);
      const cell = cells[p.row]?.[p.col];
      if (cell) {
        if (p.direction === "across") cell.acrossNumber = n;
        if (p.direction === "down") cell.downNumber = n;
      }
    } else {
      const cell = cells[p.row]?.[p.col];
      if (cell) {
        if (p.direction === "across") cell.acrossNumber = n;
        if (p.direction === "down") cell.downNumber = n;
      }
    }
    numbered.push({ ...p, number: n });
  }

  // Ensure cell numbers for starts even if only one direction.
  for (const [key, n] of starts) {
    const [rs, cs] = key.split(",");
    const r = Number(rs);
    const c = Number(cs);
    const cell = cells[r]?.[c];
    if (!cell) continue;
    const hasAcross = numbered.some((p) => p.row === r && p.col === c && p.direction === "across");
    const hasDown = numbered.some((p) => p.row === r && p.col === c && p.direction === "down");
    if (hasAcross) cell.acrossNumber = n;
    if (hasDown) cell.downNumber = n;
  }

  return {
    size: { rows: cells.length, cols: cells[0]?.length ?? 0 },
    cells,
    placements: numbered,
  };
}

export function numberBuildResult(result: BuildResult): BuildResult {
  const numbered = numberPlacements(result.cells, result.placements);
  return {
    ...result,
    cells: numbered.cells,
    placements: numbered.placements,
  };
}
