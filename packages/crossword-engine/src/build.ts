import { mulberry32, shuffleInPlace } from "./rng.js";
import { ENGINE_VERSION, type BuildOptions, type BuildResult, type Cell, type Direction, type GridSize, type Placement, type WordEntry } from "./types.js";

const DEFAULT_AUTO_SIZES: GridSize[] = [
  { rows: 11, cols: 11 },
  { rows: 13, cols: 13 },
  { rows: 15, cols: 15 },
  { rows: 17, cols: 17 },
  { rows: 21, cols: 21 },
  { rows: 25, cols: 25 },
];

const DEFAULT_NODE_BUDGET = 50_000;

interface CandidateSlot {
  row: number;
  col: number;
  direction: Direction;
  score: number;
}

function emptyGrid(size: GridSize): Cell[][] {
  const cells: Cell[][] = [];
  for (let r = 0; r < size.rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < size.cols; c++) {
      row.push({ row: r, col: c, letter: null, isBlock: false });
    }
    cells.push(row);
  }
  return cells;
}

function cloneCells(cells: Cell[][]): Cell[][] {
  return cells.map((row) => row.map((cell) => ({ ...cell })));
}

function canPlace(
  cells: Cell[][],
  size: GridSize,
  word: string,
  row: number,
  col: number,
  direction: Direction,
  requireCrossing: boolean,
): { ok: boolean; crossings: number } {
  const dr = direction === "down" ? 1 : 0;
  const dc = direction === "across" ? 1 : 0;
  const endR = row + dr * (word.length - 1);
  const endC = col + dc * (word.length - 1);
  if (row < 0 || col < 0 || endR >= size.rows || endC >= size.cols) {
    return { ok: false, crossings: 0 };
  }

  // Before/after cells must not extend the run into another letter (ghost words).
  const beforeR = row - dr;
  const beforeC = col - dc;
  if (beforeR >= 0 && beforeC >= 0 && beforeR < size.rows && beforeC < size.cols) {
    const before = cells[beforeR]![beforeC]!;
    if (!before.isBlock && before.letter) return { ok: false, crossings: 0 };
  }
  const afterR = endR + dr;
  const afterC = endC + dc;
  if (afterR >= 0 && afterC >= 0 && afterR < size.rows && afterC < size.cols) {
    const after = cells[afterR]![afterC]!;
    if (!after.isBlock && after.letter) return { ok: false, crossings: 0 };
  }

  let crossings = 0;
  let hasLetter = false;
  const perpR = direction === "across" ? 1 : 0;
  const perpC = direction === "down" ? 1 : 0;

  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const cell = cells[r]![c]!;
    if (cell.isBlock) return { ok: false, crossings: 0 };
    const ch = word[i]!;
    if (cell.letter) {
      if (cell.letter !== ch) return { ok: false, crossings: 0 };
      crossings += 1;
      hasLetter = true;
    } else {
      // New letter cells must not touch perpendicular neighbors — that creates ghost segments.
      for (const sign of [-1, 1] as const) {
        const nr = r + perpR * sign;
        const nc = c + perpC * sign;
        if (nr < 0 || nc < 0 || nr >= size.rows || nc >= size.cols) continue;
        const neighbor = cells[nr]![nc]!;
        if (!neighbor.isBlock && neighbor.letter) return { ok: false, crossings: 0 };
      }
    }
  }

  if (requireCrossing && !hasLetter) return { ok: false, crossings: 0 };
  return { ok: true, crossings };
}

/** Mark unused cells as blocks so the printable grid only shows letter runs. */
export function finalizeBlocks(cells: Cell[][]): void {
  for (const row of cells) {
    for (const cell of row) {
      if (!cell.letter) cell.isBlock = true;
    }
  }
}

function placeWord(
  cells: Cell[][],
  word: string,
  row: number,
  col: number,
  direction: Direction,
): void {
  const dr = direction === "down" ? 1 : 0;
  const dc = direction === "across" ? 1 : 0;
  for (let i = 0; i < word.length; i++) {
    const cell = cells[row + dr * i]![col + dc * i]!;
    cell.letter = word[i]!;
  }
}

function findSlots(
  cells: Cell[][],
  size: GridSize,
  word: string,
  requireCrossing: boolean,
  rand: () => number,
): CandidateSlot[] {
  const slots: CandidateSlot[] = [];
  for (const direction of ["across", "down"] as Direction[]) {
    const maxR = direction === "down" ? size.rows - word.length : size.rows - 1;
    const maxC = direction === "across" ? size.cols - word.length : size.cols - 1;
    for (let r = 0; r <= maxR; r++) {
      for (let c = 0; c <= maxC; c++) {
        const check = canPlace(cells, size, word, r, c, direction, requireCrossing);
        if (!check.ok) continue;
        slots.push({
          row: r,
          col: c,
          direction,
          score: check.crossings * 10 + rand(),
        });
      }
    }
  }
  slots.sort((a, b) => b.score - a.score);
  return slots;
}

function letterDensity(cells: Cell[][]): number {
  let letters = 0;
  let total = 0;
  for (const row of cells) {
    for (const cell of row) {
      total += 1;
      if (cell.letter) letters += 1;
    }
  }
  return total === 0 ? 0 : letters / total;
}

function countCrossings(placements: Placement[], cells: Cell[][]): number {
  // Approximate: letters shared by ≥2 placements.
  const cover = new Map<string, number>();
  for (const p of placements) {
    const dr = p.direction === "down" ? 1 : 0;
    const dc = p.direction === "across" ? 1 : 0;
    for (let i = 0; i < p.length; i++) {
      const key = `${p.row + dr * i},${p.col + dc * i}`;
      cover.set(key, (cover.get(key) ?? 0) + 1);
    }
  }
  let crossings = 0;
  for (const n of cover.values()) if (n >= 2) crossings += 1;
  void cells;
  return crossings;
}

interface SearchState {
  cells: Cell[][];
  placements: Placement[];
  placed: Set<string>;
  nodes: number;
  bestPlaced: number;
  best: { cells: Cell[][]; placements: Placement[]; placed: Set<string> } | null;
}

function search(
  entries: WordEntry[],
  size: GridSize,
  seed: number,
  nodeBudget: number,
  locked: Placement[],
): {
  cells: Cell[][];
  placements: Placement[];
  placed: Set<string>;
  nodes: number;
  status: BuildResult["status"];
  diagnostics: string[];
} {
  const rand = mulberry32(seed);
  const diagnostics: string[] = [];
  const order = [...entries];
  // Longer words first, then shuffle lightly for diversity under seed.
  order.sort((a, b) => b.answerNormalized.length - a.answerNormalized.length);
  // Stable shuffle of equal-length bands
  shuffleInPlace(order, rand);

  const state: SearchState = {
    cells: emptyGrid(size),
    placements: [],
    placed: new Set(),
    nodes: 0,
    bestPlaced: 0,
    best: null,
  };

  // Apply locked placements first.
  for (const lock of locked) {
    const entry = entries.find((e) => e.id === lock.entryId);
    if (!entry) {
      return {
        cells: state.cells,
        placements: [],
        placed: new Set(),
        nodes: 0,
        status: "constraint_conflict",
        diagnostics: [`Locked entry ${lock.entryId} not found`],
      };
    }
    const check = canPlace(
      state.cells,
      size,
      entry.answerNormalized,
      lock.row,
      lock.col,
      lock.direction,
      false,
    );
    if (!check.ok) {
      return {
        cells: state.cells,
        placements: [],
        placed: new Set(),
        nodes: 0,
        status: "constraint_conflict",
        diagnostics: [`Locked placement conflict for ${entry.answerNormalized}`],
      };
    }
    placeWord(state.cells, entry.answerNormalized, lock.row, lock.col, lock.direction);
    state.placements.push({ ...lock, length: entry.answerNormalized.length, number: 0 });
    state.placed.add(entry.id);
  }

  function dfs(remaining: WordEntry[]): boolean {
    if (state.nodes >= nodeBudget) return false;
    state.nodes += 1;

    if (state.placed.size > state.bestPlaced) {
      state.bestPlaced = state.placed.size;
      state.best = {
        cells: cloneCells(state.cells),
        placements: state.placements.map((p) => ({ ...p })),
        placed: new Set(state.placed),
      };
    }

    if (remaining.length === 0) return true;

    // Heuristic: next word with fewest slots among longest remaining.
    let bestIdx = 0;
    let bestSlotCount = Infinity;
    const candidatesMeta: CandidateSlot[][] = [];
    for (let i = 0; i < remaining.length; i++) {
      const word = remaining[i]!.answerNormalized;
      const requireCrossing = state.placed.size > 0;
      const slots = findSlots(state.cells, size, word, requireCrossing, rand);
      candidatesMeta[i] = slots;
      const score = slots.length + (20 - word.length) * 0.01;
      if (score < bestSlotCount) {
        bestSlotCount = score;
        bestIdx = i;
      }
    }

    const entry = remaining[bestIdx]!;
    const slots = candidatesMeta[bestIdx] ?? [];
    if (slots.length === 0) {
      // Skip optional words; required words stay unplaced.
      if (entry.required === false) {
        const next = remaining.filter((_, i) => i !== bestIdx);
        return dfs(next);
      }
      // Try skipping to place others for partial result, but mark incomplete.
      const next = remaining.filter((_, i) => i !== bestIdx);
      return dfs(next);
    }

    // Cap branching for budget.
    const limited = slots.slice(0, Math.min(24, slots.length));
    for (const slot of limited) {
      if (state.nodes >= nodeBudget) break;
      const snapshotCells = cloneCells(state.cells);
      const snapshotPlacements = state.placements.length;
      placeWord(state.cells, entry.answerNormalized, slot.row, slot.col, slot.direction);
      state.placements.push({
        entryId: entry.id,
        row: slot.row,
        col: slot.col,
        direction: slot.direction,
        length: entry.answerNormalized.length,
        number: 0,
      });
      state.placed.add(entry.id);
      const next = remaining.filter((_, i) => i !== bestIdx);
      if (dfs(next)) return true;
      // backtrack
      state.cells = snapshotCells;
      state.placements.length = snapshotPlacements;
      state.placed.delete(entry.id);
    }
    return false;
  }

  const remaining = order.filter((e) => !state.placed.has(e.id));
  const solved = dfs(remaining);

  const best = state.best ?? {
    cells: state.cells,
    placements: state.placements,
    placed: state.placed,
  };

  finalizeBlocks(best.cells);

  let status: BuildResult["status"] = "partial";
  if (solved && best.placed.size === entries.length) status = "solved";
  else if (state.nodes >= nodeBudget) status = "budget_exhausted";
  else status = "partial";

  if (best.placed.size === 0) {
    diagnostics.push("No words could be placed");
  } else if (best.placed.size < entries.length) {
    diagnostics.push(`Placed ${best.placed.size}/${entries.length} words`);
  }

  return {
    cells: best.cells,
    placements: best.placements,
    placed: best.placed,
    nodes: state.nodes,
    status,
    diagnostics,
  };
}

function scoreResult(result: {
  placements: Placement[];
  cells: Cell[][];
  placed: Set<string>;
  size: GridSize;
}): number {
  const crossings = countCrossings(result.placements, result.cells);
  const density = letterDensity(result.cells);
  const placed = result.placed.size;
  const aspect = 1 - Math.abs(result.size.rows - result.size.cols) / Math.max(result.size.rows, result.size.cols);
  return placed * 1000 + crossings * 20 + density * 10 + aspect;
}

export function buildGrid(options: BuildOptions): BuildResult {
  const engineVersion = options.engineVersion ?? ENGINE_VERSION;
  const nodeBudget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const diagnostics: string[] = [];

  if (!options.entries.length) {
    return {
      engineVersion,
      seed: options.seed,
      size: { rows: 5, cols: 5 },
      cells: emptyGrid({ rows: 5, cols: 5 }),
      placements: [],
      placedEntryIds: [],
      unplacedEntryIds: [],
      crossings: 0,
      nodesExplored: 0,
      status: "invalid_input",
      diagnostics: ["No entries provided"],
    };
  }

  const invalid = options.entries.filter((e) => !/^[A-Z]{3,24}$/.test(e.answerNormalized));
  if (invalid.length) {
    return {
      engineVersion,
      seed: options.seed,
      size: { rows: 5, cols: 5 },
      cells: emptyGrid({ rows: 5, cols: 5 }),
      placements: [],
      placedEntryIds: [],
      unplacedEntryIds: options.entries.map((e) => e.id),
      crossings: 0,
      nodesExplored: 0,
      status: "invalid_input",
      diagnostics: invalid.map((e) => `Invalid normalized answer for ${e.id}: ${e.answerNormalized}`),
    };
  }

  const sizes: GridSize[] =
    options.size === undefined || options.size === "auto"
      ? options.allowedAutoSizes ?? DEFAULT_AUTO_SIZES
      : [options.size];

  // Ensure size can fit longest word.
  const maxLen = Math.max(...options.entries.map((e) => e.answerNormalized.length));
  const viable = sizes.filter((s) => s.rows >= maxLen || s.cols >= maxLen);
  if (!viable.length) {
    return {
      engineVersion,
      seed: options.seed,
      size: sizes[0] ?? { rows: 15, cols: 15 },
      cells: emptyGrid(sizes[0] ?? { rows: 15, cols: 15 }),
      placements: [],
      placedEntryIds: [],
      unplacedEntryIds: options.entries.map((e) => e.id),
      crossings: 0,
      nodesExplored: 0,
      status: "invalid_input",
      diagnostics: [`Longest word length ${maxLen} exceeds all allowed grid sizes`],
    };
  }

  let bestOverall: BuildResult | null = null;

  for (let i = 0; i < viable.length; i++) {
    const size = viable[i]!;
    const budgetShare = Math.floor(nodeBudget / viable.length);
    const result = search(options.entries, size, options.seed + i * 997, Math.max(1000, budgetShare), options.lockedPlacements ?? []);
    const placedEntryIds = [...result.placed];
    const unplacedEntryIds = options.entries.filter((e) => !result.placed.has(e.id)).map((e) => e.id);
    const crossings = countCrossings(result.placements, result.cells);
    const candidate: BuildResult = {
      engineVersion,
      seed: options.seed,
      size,
      cells: result.cells,
      placements: result.placements,
      placedEntryIds,
      unplacedEntryIds,
      crossings,
      nodesExplored: result.nodes,
      status: result.status,
      diagnostics: [...diagnostics, ...result.diagnostics],
    };
    if (
      !bestOverall ||
      scoreResult({
        placements: candidate.placements,
        cells: candidate.cells,
        placed: new Set(candidate.placedEntryIds),
        size: candidate.size,
      }) >
        scoreResult({
          placements: bestOverall.placements,
          cells: bestOverall.cells,
          placed: new Set(bestOverall.placedEntryIds),
          size: bestOverall.size,
        })
    ) {
      bestOverall = candidate;
    }
    if (candidate.status === "solved") break;
  }

  return bestOverall!;
}

export { emptyGrid, canPlace, placeWord, countCrossings };
