import { describe, expect, it } from "vitest";
import { emptyGrid, placeWord } from "./build.js";
import { scanGridWords, validatePuzzle } from "./validate.js";
import type { Placement, WordEntry } from "./types.js";

const entry = (id: string, answer: string, clue = "c"): WordEntry => ({
  id,
  answerRaw: answer,
  answerNormalized: answer,
  displayAnswer: answer,
  clue,
  origin: "manual",
  reviewState: "reviewed_by_user",
  normalizationVersion: "0.1.0",
  required: true,
});

describe("scanGridWords", () => {
  it("finds across and down runs independently", () => {
    const cells = emptyGrid({ rows: 3, cols: 3 });
    placeWord(cells, "CAT", 0, 0, "across");
    placeWord(cells, "CAB", 0, 0, "down");
    const words = scanGridWords(cells);
    expect(words.some((w) => w.letters === "CAT" && w.direction === "across")).toBe(true);
    expect(words.some((w) => w.letters === "CAB" && w.direction === "down")).toBe(true);
  });
});

describe("validatePuzzle", () => {
  it("flags ghost word segments not in placements", () => {
    const cells = emptyGrid({ rows: 3, cols: 3 });
    placeWord(cells, "CAT", 0, 0, "across");
    placeWord(cells, "CAB", 0, 0, "down"); // creates conflict? C matches; A vs A; T vs B at (2,0) — wait CAB is down from (0,0): C,A,B
    // Actually place only CAT across, and accidentally fill down creating ghost
    const cells2 = emptyGrid({ rows: 3, cols: 3 });
    placeWord(cells2, "CAT", 0, 0, "across");
    cells2[1]![0]!.letter = "O";
    cells2[2]![0]!.letter = "W"; // forms COW down undeclared
    const placements: Placement[] = [
      { entryId: "1", row: 0, col: 0, direction: "across", length: 3, number: 1 },
    ];
    const report = validatePuzzle({
      cells: cells2,
      placements,
      entries: [entry("1", "CAT")],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.code === "ghost_word")).toBe(true);
  });

  it("flags letter mismatches", () => {
    const cells = emptyGrid({ rows: 3, cols: 3 });
    placeWord(cells, "DOG", 0, 0, "across");
    const report = validatePuzzle({
      cells,
      placements: [{ entryId: "1", row: 0, col: 0, direction: "across", length: 3, number: 1 }],
      entries: [entry("1", "CAT")],
    });
    expect(report.errors.some((e) => e.code === "letter_mismatch")).toBe(true);
  });
});
