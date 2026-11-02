import { describe, expect, it } from "vitest";
import type { WordEntry } from "@acm/crossword-engine";
import {
  answersDriftFromBuild,
  formatSkipSummaryLine,
  gridCheckStatus,
  parsePaste,
  sourceRowsForBuild,
  summarizeSkippedEntries,
} from "./maker-feedback";

function entry(id: string, answer: string): WordEntry {
  return {
    id,
    answerRaw: answer,
    answerNormalized: answer,
    displayAnswer: answer,
    clue: "",
    origin: "manual",
    reviewState: "reviewed_by_user",
    normalizationVersion: "test",
  };
}

describe("summarizeSkippedEntries", () => {
  it("surfaces each dropped row with a teacher-facing reason and keeps 123 as digits not non_ascii_letter", () => {
    const rows = [
      { answer: "SUPERCALIFRAGILISTICEXPIALIDOCIOUSXX", clue: "" },
      { answer: "CAT", clue: "" },
      { answer: "CAT", clue: "" },
      { answer: "CAFÉ", clue: "" },
      { answer: "123", clue: "" },
      { answer: "AB", clue: "" },
      { answer: "e-mail", clue: "" },
      { answer: "ICE CREAM", clue: "" },
      { answer: "O'NEIL", clue: "" },
      { answer: "SUN", clue: "" },
    ];
    const summary = summarizeSkippedEntries(rows);
    expect(summary.usedCount).toBe(5);
    expect(summary.inputCount).toBe(10);
    expect(summary.skipped).toHaveLength(5);
    expect(summary.usedAnswers).toEqual(["CAT", "EMAIL", "ICECREAM", "ONEIL", "SUN"]);
    expect(summary.byRowIndex.get(4)?.code).toBe("non_letter");
    expect(summary.byRowIndex.get(4)?.reason).toMatch(/digits or symbols/i);
    expect(summary.byRowIndex.get(4)?.reason).not.toMatch(/non_ascii_letter/i);
    expect(summary.byRowIndex.get(3)?.reason).toMatch(/CAFE/);
    expect(summary.byRowIndex.get(0)?.code).toBe("too_long");
    expect(summary.byRowIndex.get(2)?.code).toBe("duplicate");
    expect(summary.byRowIndex.get(5)?.code).toBe("too_short");
    const line = formatSkipSummaryLine(summary, true);
    expect(line).toContain("5 of 10 words used — 5 skipped");
    expect(line).toContain("123");
    expect(line).not.toContain("non_ascii_letter");
  });
});

describe("sourceRowsForBuild + answersDriftFromBuild", () => {
  it("uses paste text in paste mode, not the Entries table (M6)", () => {
    const rows = [{ answer: "CAT", clue: "Feline" }, { answer: "DOG", clue: "Pet" }];
    const pasteText = "SUN | Star\nMOON | Night";
    expect(sourceRowsForBuild("paste", rows, pasteText).map((r) => r.answer)).toEqual([
      "SUN",
      "MOON",
    ]);
    expect(sourceRowsForBuild("words", rows, pasteText)).toEqual(rows);

    const built = [entry("local-1", "CAT"), entry("local-2", "DOG")];
    expect(answersDriftFromBuild(built, rows)).toBe(false);
    expect(answersDriftFromBuild(built, parsePaste(pasteText))).toBe(true);
    expect(answersDriftFromBuild(built, parsePaste("CAT | Feline\nDOG | Pet"))).toBe(false);
    expect(answersDriftFromBuild(built, [{ answer: "CAT", clue: "" }, { answer: "STAR", clue: "" }])).toBe(
      true,
    );
  });
});

describe("gridCheckStatus", () => {
  it("does not report green passed when placement is partial", () => {
    expect(gridCheckStatus({ validationOk: true, placed: 8, total: 15 })).toEqual({
      label: "8 of 15 placed",
      tone: "warn",
    });
    expect(gridCheckStatus({ validationOk: true, placed: 15, total: 15 })).toEqual({
      label: "Grid checks passed",
      tone: "ok",
    });
    expect(gridCheckStatus({ validationOk: false, placed: 15, total: 15 })?.label).toBe(
      "Clues / grid need review",
    );
  });
});
