import { describe, expect, it } from "vitest";
import { asciiGridToCells, hydrateFromSnapshot } from "./snapshot-hydrate";

describe("snapshot hydrate", () => {
  it("converts ascii grid to cells", () => {
    const cells = asciiGridToCells(["CAT#", "#DOG"]);
    expect(cells[0]![0]).toMatchObject({ letter: "C", isBlock: false });
    expect(cells[0]![3]).toMatchObject({ letter: null, isBlock: true });
    expect(cells[1]![1]).toMatchObject({ letter: "D", isBlock: false });
  });

  it("rebuilds maker result from cloud snapshot without re-solving", () => {
    const hydrated = hydrateFromSnapshot({
      title: "Demo",
      seed: 7,
      size: { rows: 3, cols: 3 },
      grid: ["CAT", "#A#", "#T#"],
      placements: [
        { entryId: "e1", row: 0, col: 0, direction: "across", length: 3, number: 1 },
        { entryId: "e2", row: 0, col: 1, direction: "down", length: 3, number: 2 },
      ],
      entries: [
        { id: "e1", answerNormalized: "CAT", clue: "Feline" },
        { id: "e2", answerNormalized: "AAT", clue: "Placeholder" },
      ],
      reviewState: "needs_review",
    });
    expect(hydrated.title).toBe("Demo");
    expect(hydrated.result.placements).toHaveLength(2);
    expect(hydrated.result.cells[0]![0]!.letter).toBe("C");
    expect(hydrated.rows[0]).toEqual({ answer: "CAT", clue: "Feline" });
  });
});
