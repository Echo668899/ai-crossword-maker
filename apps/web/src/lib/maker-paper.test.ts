import { describe, expect, it } from "vitest";
import { PAPER_SIZE_OPTIONS, resolveMakerPaperSize } from "./maker-paper";

describe("maker paper size", () => {
  it("defaults unknown values to US Letter and exposes Letter plus A4", () => {
    expect(resolveMakerPaperSize("letter")).toBe("letter");
    expect(resolveMakerPaperSize("a4")).toBe("a4");
    expect(resolveMakerPaperSize("legal")).toBe("letter");
    expect(resolveMakerPaperSize(undefined)).toBe("letter");
    expect(PAPER_SIZE_OPTIONS.map((o) => o.id)).toEqual(["letter", "a4"]);
  });
});
