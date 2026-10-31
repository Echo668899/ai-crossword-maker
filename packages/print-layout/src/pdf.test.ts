import { describe, expect, it } from "vitest";
import { buildGrid, normalizeEntries, numberBuildResult } from "@acm/crossword-engine";
import { buildAnswerKeyPdf, buildStudentPdf } from "./pdf.js";

describe("pdf export", () => {
  it("creates student and answer PDFs with %PDF header", async () => {
    const { entries } = normalizeEntries([
      { id: "1", answerRaw: "SUN", clue: "Daytime star", origin: "manual", reviewState: "reviewed_by_user" },
      { id: "2", answerRaw: "SEA", clue: "Salty water", origin: "manual", reviewState: "reviewed_by_user" },
      { id: "3", answerRaw: "USE", clue: "Employ", origin: "manual", reviewState: "reviewed_by_user" },
    ]);
    let result = buildGrid({ entries, seed: 3, size: { rows: 9, cols: 9 }, nodeBudget: 20_000 });
    result = numberBuildResult(result);
    expect(result.placedEntryIds.length).toBeGreaterThan(0);

    const student = await buildStudentPdf({
      result,
      entries,
      settings: { title: "Sample", watermark: "aicrosswordmaker.com" },
    });
    const answers = await buildAnswerKeyPdf({ result, entries, settings: { title: "Sample" } });

    expect(String.fromCharCode(...student.slice(0, 4))).toBe("%PDF");
    expect(String.fromCharCode(...answers.slice(0, 4))).toBe("%PDF");
    expect(student.byteLength).toBeGreaterThan(500);
  });
});
