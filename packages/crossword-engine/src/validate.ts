import type { BuildResult, Cell, Direction, Placement, ValidationIssue, ValidationReport, WordEntry } from "./types.js";
import { VALIDATOR_VERSION } from "./types.js";

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function snapshotHash(cells: Cell[][], placements: Placement[]): string {
  const grid = cells.map((row) => row.map((c) => (c.isBlock ? "#" : c.letter ?? ".")).join("")).join("/");
  const place = placements
    .map((p) => `${p.entryId}:${p.row},${p.col},${p.direction},${p.length},${p.number}`)
    .sort()
    .join("|");
  return fnv1a(`${grid}::${place}`);
}

interface ScannedWord {
  row: number;
  col: number;
  direction: Direction;
  letters: string;
  cells: Array<{ row: number; col: number }>;
}

/** Rescan grid for contiguous letter runs (≥2). Independent of generator placements. */
export function scanGridWords(cells: Cell[][]): ScannedWord[] {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const words: ScannedWord[] = [];

  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      while (c < cols && (cells[r]![c]!.isBlock || !cells[r]![c]!.letter)) c++;
      if (c >= cols) break;
      const start = c;
      let letters = "";
      const coords: Array<{ row: number; col: number }> = [];
      while (c < cols && !cells[r]![c]!.isBlock && cells[r]![c]!.letter) {
        letters += cells[r]![c]!.letter;
        coords.push({ row: r, col: c });
        c++;
      }
      if (letters.length >= 2) {
        words.push({ row: r, col: start, direction: "across", letters, cells: coords });
      }
    }
  }

  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      while (r < rows && (cells[r]![c]!.isBlock || !cells[r]![c]!.letter)) r++;
      if (r >= rows) break;
      const start = r;
      let letters = "";
      const coords: Array<{ row: number; col: number }> = [];
      while (r < rows && !cells[r]![c]!.isBlock && cells[r]![c]!.letter) {
        letters += cells[r]![c]!.letter;
        coords.push({ row: r, col: c });
        r++;
      }
      if (letters.length >= 2) {
        words.push({ row: start, col: c, direction: "down", letters, cells: coords });
      }
    }
  }

  return words;
}

function connectedComponents(cells: Cell[][]): number {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const seen = new Set<string>();
  let components = 0;

  function key(r: number, c: number) {
    return `${r},${c}`;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!cells[r]![c]!.letter || seen.has(key(r, c))) continue;
      components += 1;
      const queue: Array<[number, number]> = [[r, c]];
      seen.add(key(r, c));
      while (queue.length) {
        const [cr, cc] = queue.pop()!;
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ] as const) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          if (!cells[nr]![nc]!.letter) continue;
          const k = key(nr, nc);
          if (seen.has(k)) continue;
          seen.add(k);
          queue.push([nr, nc]);
        }
      }
    }
  }
  return components;
}

export function validatePuzzle(input: {
  cells: Cell[][];
  placements: Placement[];
  entries: WordEntry[];
  requireAllPlaced?: boolean;
}): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const rows = input.cells.length;
  const cols = input.cells[0]?.length ?? 0;
  const entryMap = new Map(input.entries.map((e) => [e.id, e]));

  if (rows === 0 || cols === 0) {
    errors.push({ code: "empty_grid", message: "Grid has no cells" });
  }

  for (let r = 0; r < rows; r++) {
    if ((input.cells[r]?.length ?? 0) !== cols) {
      errors.push({ code: "ragged_grid", message: `Row ${r} has inconsistent width` });
    }
  }

  // Placement bounds + letter match
  for (const p of input.placements) {
    const entry = entryMap.get(p.entryId);
    if (!entry) {
      errors.push({
        code: "unknown_entry",
        message: `Placement references unknown entry ${p.entryId}`,
        entryIds: [p.entryId],
      });
      continue;
    }
    if (p.length !== entry.answerNormalized.length) {
      errors.push({
        code: "length_mismatch",
        message: `Placement length ${p.length} != answer ${entry.answerNormalized.length}`,
        entryIds: [p.entryId],
      });
    }
    const dr = p.direction === "down" ? 1 : 0;
    const dc = p.direction === "across" ? 1 : 0;
    for (let i = 0; i < entry.answerNormalized.length; i++) {
      const r = p.row + dr * i;
      const c = p.col + dc * i;
      if (r < 0 || c < 0 || r >= rows || c >= cols) {
        errors.push({
          code: "out_of_bounds",
          message: `Placement ${entry.answerNormalized} out of bounds`,
          entryIds: [p.entryId],
          coordinates: [{ row: r, col: c }],
        });
        break;
      }
      const cell = input.cells[r]![c]!;
      const expected = entry.answerNormalized[i]!;
      if (cell.letter !== expected) {
        errors.push({
          code: "letter_mismatch",
          message: `Expected ${expected} at (${r},${c}) for ${entry.answerNormalized}, found ${cell.letter ?? "."}`,
          entryIds: [p.entryId],
          coordinates: [{ row: r, col: c }],
        });
      }
    }
  }

  // Independent scan: every placement must match a scanned run; no ghost runs of length ≥2 unaccounted.
  const scanned = scanGridWords(input.cells);
  const unmatchedScanned = [...scanned];

  for (const p of input.placements) {
    const entry = entryMap.get(p.entryId);
    if (!entry) continue;
    const idx = unmatchedScanned.findIndex(
      (s) =>
        s.row === p.row &&
        s.col === p.col &&
        s.direction === p.direction &&
        s.letters === entry.answerNormalized,
    );
    if (idx === -1) {
      errors.push({
        code: "placement_not_on_grid",
        message: `Declared placement for ${entry.answerNormalized} not found by independent scan`,
        entryIds: [p.entryId],
        coordinates: [{ row: p.row, col: p.col }],
      });
    } else {
      unmatchedScanned.splice(idx, 1);
    }
  }

  for (const ghost of unmatchedScanned) {
    errors.push({
      code: "ghost_word",
      message: `Undeclared ${ghost.direction} segment "${ghost.letters}" at (${ghost.row},${ghost.col})`,
      coordinates: ghost.cells,
    });
  }

  // Single-letter islands are allowed as part of crossings but warn if fully isolated single letter with no placement covering.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = input.cells[r]![c]!;
      if (!cell.letter) continue;
      const covered = input.placements.some((p) => {
        const entry = entryMap.get(p.entryId);
        if (!entry) return false;
        const dr = p.direction === "down" ? 1 : 0;
        const dc = p.direction === "across" ? 1 : 0;
        for (let i = 0; i < entry.answerNormalized.length; i++) {
          if (p.row + dr * i === r && p.col + dc * i === c) return true;
        }
        return false;
      });
      if (!covered) {
        errors.push({
          code: "orphan_letter",
          message: `Letter ${cell.letter} at (${r},${c}) not covered by any placement`,
          coordinates: [{ row: r, col: c }],
        });
      }
    }
  }

  const components = connectedComponents(input.cells);
  if (components > 1) {
    errors.push({
      code: "disconnected",
      message: `Grid has ${components} disconnected letter components`,
    });
  }
  if (components === 0 && input.placements.length > 0) {
    errors.push({ code: "empty_letters", message: "Placements present but grid has no letters" });
  }

  // Numbering consistency: shared start cells should share numbers when numbered.
  const startNumbers = new Map<string, number>();
  for (const p of input.placements) {
    if (!p.number) continue;
    const key = `${p.row},${p.col}`;
    const existing = startNumbers.get(key);
    if (existing !== undefined && existing !== p.number) {
      errors.push({
        code: "number_conflict",
        message: `Conflicting numbers ${existing} and ${p.number} at (${p.row},${p.col})`,
        entryIds: [p.entryId],
        coordinates: [{ row: p.row, col: p.col }],
      });
    } else {
      startNumbers.set(key, p.number);
    }
  }

  const placedRequired = input.entries.filter((e) => e.required !== false);
  const placedIds = new Set(input.placements.map((p) => p.entryId));
  const missingRequired = placedRequired.filter((e) => !placedIds.has(e.id));
  if (input.requireAllPlaced && missingRequired.length) {
    errors.push({
      code: "missing_required",
      message: `Missing required entries: ${missingRequired.map((e) => e.answerNormalized).join(", ")}`,
      entryIds: missingRequired.map((e) => e.id),
    });
  } else if (missingRequired.length) {
    warnings.push({
      code: "subset_accepted",
      message: `Unplaced entries: ${missingRequired.map((e) => e.answerNormalized).join(", ")}`,
      entryIds: missingRequired.map((e) => e.id),
    });
  }

  // Clue presence warnings
  for (const p of input.placements) {
    const entry = entryMap.get(p.entryId);
    if (!entry) continue;
    if (!entry.clue.trim()) {
      warnings.push({
        code: "missing_clue",
        message: `Entry ${entry.answerNormalized} has no clue`,
        entryIds: [entry.id],
      });
    }
  }

  const coverage =
    input.entries.length === 0 ? 0 : input.placements.length / input.entries.length;

  return {
    validatorVersion: VALIDATOR_VERSION,
    snapshotHash: snapshotHash(input.cells, input.placements),
    checkedAt: new Date().toISOString(),
    ok: errors.length === 0,
    errors,
    warnings,
    placementCoverage: coverage,
    connectedComponents: components,
  };
}

export function validateBuildResult(result: BuildResult, entries: WordEntry[]): ValidationReport {
  return validatePuzzle({
    cells: result.cells,
    placements: result.placements,
    entries,
    requireAllPlaced: result.status === "solved",
  });
}
