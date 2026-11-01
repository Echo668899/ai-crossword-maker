import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";
import { buildExamplePuzzle } from "./build-example";
import { exampleToLocalPlay } from "./example-play";

describe("exampleToLocalPlay", () => {
  it("builds a no-answer payload with matching solution grid", () => {
    const example = EXAMPLES[0]!;
    const built = buildExamplePuzzle(example);
    const { payload, solutionGrid } = exampleToLocalPlay(example, built);

    expect(payload.token).toBe(`example:${example.slug}`);
    expect(payload.allowCheck).toBe(true);
    expect(payload.allowReveal).toBe(true);
    expect(payload.cells.length).toBe(built.result.size.rows);
    expect(payload.clues.length).toBe(built.result.placements.length);
    expect(solutionGrid.length).toBe(built.result.size.rows);

    const serialized = JSON.stringify(payload.cells);
    expect(serialized).not.toMatch(/"letter"/);

    for (let r = 0; r < payload.cells.length; r++) {
      const line = solutionGrid[r]!;
      expect(line.length).toBe(payload.size.cols);
      for (let c = 0; c < payload.cells[r]!.length; c++) {
        const cell = payload.cells[r]![c]!;
        if (cell.isBlock) expect(line[c]).toBe("#");
        else expect(line[c]).toMatch(/^[A-Z]$/);
      }
    }
  });
});
