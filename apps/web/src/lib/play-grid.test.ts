import { describe, expect, it } from "vitest";
import { playCellPx, playLetterFontPx, playNumberFontPx } from "./play-grid";

describe("playCellPx", () => {
  it("enlarges typical desktop sample grids past the old 36px cap", () => {
    expect(playCellPx(13, 13, 1280)).toBeGreaterThanOrEqual(48);
    expect(playCellPx(15, 15, 1280)).toBeGreaterThanOrEqual(40);
    expect(playCellPx(13, 13, 1280)).toBeLessThanOrEqual(56);
  });

  it("keeps small puzzles at the desktop max instead of tiny cells", () => {
    expect(playCellPx(7, 7, 1400)).toBe(56);
  });

  it("does not force a 21×21 desktop grid past the 680px cap", () => {
    const cell = playCellPx(21, 21, 1440);
    expect(cell).toBeGreaterThanOrEqual(32);
    expect(cell * 21).toBeLessThanOrEqual(680);
  });

  it("stays tap-friendly on a phone without blowing past the viewport", () => {
    const cell = playCellPx(13, 13, 390);
    expect(cell).toBeGreaterThanOrEqual(30);
    expect(cell).toBeLessThanOrEqual(40);
    expect(cell * 13).toBeLessThanOrEqual(390);
  });

  it("scrolls rather than shrinking a 15×15 phone grid below 30px", () => {
    expect(playCellPx(15, 15, 360)).toBe(30);
  });
});

describe("play letter metrics", () => {
  it("sizes the letter larger than the clue number inside the same cell", () => {
    const cell = 48;
    expect(playLetterFontPx(cell)).toBeGreaterThan(playNumberFontPx(cell));
    expect(playLetterFontPx(cell)).toBeGreaterThanOrEqual(16);
  });
});
