import { describe, expect, it } from "vitest";
import {
  PLAY_ZOOM_MAX,
  PLAY_ZOOM_MIN,
  playCellPx,
  playContentWidth,
  playGridPixelWidth,
  playLetterFontPx,
  playNumberFontPx,
  stepPlayZoom,
} from "./play-grid";

describe("playContentWidth", () => {
  it("matches the 1120px container cap on a wide desktop", () => {
    expect(playContentWidth(1440)).toBe(1120);
    expect(playContentWidth(1280)).toBe(1120);
  });

  it("uses viewport minus the 2rem container gutter on a phone", () => {
    expect(playContentWidth(390)).toBe(358);
  });
});

describe("playCellPx", () => {
  it("fills a desktop content column for a typical 13×13 (not a 56px island)", () => {
    const available = playContentWidth(1280);
    const cell = playCellPx(13, 13, available);
    const width = playGridPixelWidth(13, cell);
    expect(cell).toBeGreaterThan(56);
    expect(width).toBeGreaterThan(available * 0.95);
    expect(width).toBeLessThanOrEqual(available);
  });

  it("lets a small 7×7 use the full column instead of the old 56px cap", () => {
    const available = playContentWidth(1400);
    const cell = playCellPx(7, 7, available);
    expect(playGridPixelWidth(7, cell)).toBeGreaterThan(available * 0.95);
  });

  it("fits a 13×13 on a phone viewport instead of overflowing at a 30px floor", () => {
    const available = playContentWidth(390);
    const cell = playCellPx(13, 13, available);
    expect(playGridPixelWidth(13, cell)).toBeLessThanOrEqual(available);
  });

  it("fits a 15×15 on a 360px-wide phone", () => {
    const available = playContentWidth(360);
    const cell = playCellPx(15, 15, available);
    expect(playGridPixelWidth(15, cell)).toBeLessThanOrEqual(available);
  });

  it("enlarges past the column when zoomed so the scroller can pan", () => {
    const available = playContentWidth(390);
    const fit = playCellPx(13, 13, available, 1);
    const zoomed = playCellPx(13, 13, available, 2);
    expect(zoomed).toBeGreaterThan(fit);
    expect(playGridPixelWidth(13, zoomed)).toBeGreaterThan(available);
  });
});

describe("play letter metrics", () => {
  it("sizes the letter larger than the clue number inside the same cell", () => {
    const cell = 84;
    expect(playLetterFontPx(cell)).toBeGreaterThan(playNumberFontPx(cell));
    expect(playLetterFontPx(cell)).toBeGreaterThanOrEqual(40);
  });

  it("still keeps the letter larger than the number on a tiny fitted phone cell", () => {
    const cell = playCellPx(15, 15, playContentWidth(360));
    expect(playLetterFontPx(cell)).toBeGreaterThan(playNumberFontPx(cell));
  });
});

describe("stepPlayZoom", () => {
  it("steps up then wraps back to fit", () => {
    expect(stepPlayZoom(PLAY_ZOOM_MIN, 1)).toBe(1.5);
    expect(stepPlayZoom(PLAY_ZOOM_MAX, 1)).toBe(PLAY_ZOOM_MIN);
    expect(stepPlayZoom(1.5, -1)).toBe(1);
  });
});
