import { describe, expect, it } from "vitest";
import { checkLetters, PuzzleSnapshotSchema, toPlayPayload } from "./snapshot";

const sample = {
  title: "Solar Sample",
  seed: 1,
  reviewState: "sample",
  size: { rows: 5, cols: 5 },
  grid: ["#SUN#", "#U###", "MOON#", "#N###", "#####"],
  placements: [
    {
      entryId: "e1",
      row: 0,
      col: 1,
      direction: "across" as const,
      length: 3,
      number: 1,
    },
    {
      entryId: "e2",
      row: 2,
      col: 0,
      direction: "across" as const,
      length: 4,
      number: 2,
    },
  ],
  entries: [
    { id: "e1", answerNormalized: "SUN", clue: "Daytime star" },
    { id: "e2", answerNormalized: "MOON", clue: "Night light" },
  ],
};

describe("play snapshot", () => {
  it("parses and strips answers from play payload", () => {
    const snap = PuzzleSnapshotSchema.parse(sample);
    const play = toPlayPayload(snap, {
      token: "tok",
      title: "Solar Sample",
      allowCheck: true,
      allowReveal: false,
      expiresAt: null,
    });
    expect(play.cells[0]![1]!.isBlock).toBe(false);
    expect(play.cells[0]![1]!.number).toBe(1);
    expect(JSON.stringify(play)).not.toMatch(/SUN|MOON/);
    expect(play.clues[0]!.clue).toBe("Daytime star");
  });

  it("checks letters server-side", () => {
    const snap = PuzzleSnapshotSchema.parse(sample);
    const { results } = checkLetters(snap, [
      { row: 0, col: 1, letter: "S" },
      { row: 0, col: 2, letter: "X" },
    ]);
    expect(results[0]!.correct).toBe(true);
    expect(results[1]!.correct).toBe(false);
  });
});
