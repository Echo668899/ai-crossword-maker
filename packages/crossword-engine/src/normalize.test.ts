import { describe, expect, it } from "vitest";
import { clueLeaksAnswer, displayLengthHint, normalizeAnswer, normalizeEntries } from "./normalize.js";

describe("normalizeAnswer", () => {
  it("uppercases and strips spaces/hyphens/apostrophes by default", () => {
    const r = normalizeAnswer("don't know-it");
    expect(r.normalized).toBe("DONTKNOWIT");
    expect(r.display).toBe("don't know-it");
  });

  it("rejects non-ASCII without silent transliteration", () => {
    const r = normalizeAnswer("café");
    expect(r.issues.some((i) => i.code === "needs_transliteration")).toBe(true);
  });

  it("flags too-short answers", () => {
    const r = normalizeAnswer("OK");
    expect(r.issues.some((i) => i.code === "too_short")).toBe(true);
  });
});

describe("normalizeEntries", () => {
  it("detects duplicate normalized answers without merging", () => {
    const r = normalizeEntries([
      { id: "1", answerRaw: "New York", clue: "City", origin: "manual" },
      { id: "2", answerRaw: "new-york", clue: "Also city", origin: "manual" },
    ]);
    expect(r.entries).toHaveLength(1);
    expect(r.issues.some((i) => i.code === "duplicate")).toBe(true);
  });
});

describe("displayLengthHint", () => {
  it("returns multi-part lengths", () => {
    expect(displayLengthHint("New York")).toBe("(3, 4)");
  });
});

describe("clueLeaksAnswer", () => {
  it("flags whole-word leaks but not accidental substrings", () => {
    expect(clueLeaksAnswer("The planet MARS is red", "MARS")).toBe(true);
    expect(clueLeaksAnswer("Smart animal", "ART")).toBe(false);
  });
});
