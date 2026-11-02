import { describe, expect, it } from "vitest";
import {
  clueLeaksAnswer,
  displayLengthHint,
  normalizeAnswer,
  normalizeEntries,
  primaryNormalizeIssue,
  suggestAsciiSpelling,
} from "./normalize.js";

describe("normalizeAnswer", () => {
  it("uppercases and strips spaces/hyphens/apostrophes by default", () => {
    const r = normalizeAnswer("don't know-it");
    expect(r.normalized).toBe("DONTKNOWIT");
    expect(r.display).toBe("don't know-it");
  });

  it("rejects non-ASCII without silent transliteration and suggests a Latin spelling", () => {
    const r = normalizeAnswer("café");
    expect(r.issues.some((i) => i.code === "needs_transliteration")).toBe(true);
    expect(r.issues.some((i) => i.code === "non_letter")).toBe(false);
    expect(r.issues.find((i) => i.code === "needs_transliteration")?.suggestion).toBe("CAFE");
    expect(suggestAsciiSpelling("CAFÉ")).toBe("CAFE");
  });

  it("flags too-short answers", () => {
    const r = normalizeAnswer("OK");
    expect(r.issues.some((i) => i.code === "too_short")).toBe(true);
  });

  it("labels digit-only answers as non_letter, not non_ascii_letter or too_short", () => {
    const r = normalizeAnswer("123");
    const codes = r.issues.map((i) => i.code);
    expect(codes).toEqual(["non_letter"]);
    expect(codes).not.toContain("too_short");
    expect(JSON.stringify(r.issues)).not.toContain("non_ascii_letter");
    expect(primaryNormalizeIssue(r.issues)?.code).toBe("non_letter");
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
    expect(r.issues.find((i) => i.code === "duplicate")?.entryId).toBe("2");
  });

  it("keeps the review repro list honest: 5 used, 5 skipped with the right reasons", () => {
    const raw = [
      "SUPERCALIFRAGILISTICEXPIALIDOCIOUSXX",
      "CAT",
      "CAT",
      "CAFÉ",
      "123",
      "AB",
      "e-mail",
      "ICE CREAM",
      "O'NEIL",
      "SUN",
    ];
    const r = normalizeEntries(
      raw.map((answerRaw, i) => ({
        id: `local-${i + 1}`,
        answerRaw,
        clue: "",
        origin: "manual" as const,
      })),
    );
    expect(r.entries.map((e) => e.answerNormalized)).toEqual([
      "CAT",
      "EMAIL",
      "ICECREAM",
      "ONEIL",
      "SUN",
    ]);
    const byId = new Map<string, string[]>();
    for (const issue of r.issues) {
      const id = issue.entryId ?? "";
      byId.set(id, [...(byId.get(id) ?? []), issue.code]);
    }
    expect(byId.get("local-1")).toEqual(["too_long"]);
    expect(byId.get("local-3")).toEqual(["duplicate"]);
    expect(byId.get("local-4")).toEqual(["needs_transliteration"]);
    expect(byId.get("local-5")).toEqual(["non_letter"]);
    expect(byId.get("local-6")).toEqual(["too_short"]);
    expect([...byId.values()].flat()).not.toContain("non_ascii_letter");
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
