import { describe, expect, it } from "vitest";
import {
  PAGE_MARGIN_PT,
  PAPER_SIZE_PT,
  cssPageSize,
  paperPageSize,
  printContentWidth,
  resolvePaperSize,
} from "./paper.js";

describe("paper size geometry", () => {
  it("resolves unknown values to US Letter", () => {
    expect(resolvePaperSize("letter")).toBe("letter");
    expect(resolvePaperSize("a4")).toBe("a4");
    expect(resolvePaperSize("A4")).toBe("letter");
    expect(resolvePaperSize(undefined)).toBe("letter");
  });

  it("uses US Letter and ISO A4 portrait points", () => {
    expect(paperPageSize("letter")).toEqual(PAPER_SIZE_PT.letter);
    expect(paperPageSize("a4")).toEqual(PAPER_SIZE_PT.a4);
    expect(PAPER_SIZE_PT.letter.width).toBe(612);
    expect(PAPER_SIZE_PT.letter.height).toBe(792);
    expect(PAPER_SIZE_PT.a4.width).toBeCloseTo(595.28, 2);
    expect(PAPER_SIZE_PT.a4.height).toBeCloseTo(841.89, 2);
  });

  it("swaps width and height in landscape", () => {
    const letter = paperPageSize("letter", "landscape");
    expect(letter).toEqual({ width: 792, height: 612 });
    const a4 = paperPageSize("a4", "landscape");
    expect(a4.width).toBeCloseTo(841.89, 2);
    expect(a4.height).toBeCloseTo(595.28, 2);
  });

  it("gives A4 a narrower content column than Letter", () => {
    const letterW = printContentWidth("letter");
    const a4W = printContentWidth("a4");
    expect(letterW).toBe(PAPER_SIZE_PT.letter.width - PAGE_MARGIN_PT * 2);
    expect(a4W).toBeCloseTo(PAPER_SIZE_PT.a4.width - PAGE_MARGIN_PT * 2, 2);
    expect(a4W).toBeLessThan(letterW);
    expect(cssPageSize("letter")).toBe("letter");
    expect(cssPageSize("a4")).toBe("A4");
  });
});
