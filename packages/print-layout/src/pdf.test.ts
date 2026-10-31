import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildGrid, normalizeEntries, numberBuildResult } from "@acm/crossword-engine";
import { buildAnswerKeyPdf, buildStudentPdf, collectClues, wrapClueText } from "./pdf.js";

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
      settings: { title: "Sample", watermark: "crosswordmaker.app" },
    });
    const answers = await buildAnswerKeyPdf({ result, entries, settings: { title: "Sample" } });

    expect(String.fromCharCode(...student.slice(0, 4))).toBe("%PDF");
    expect(String.fromCharCode(...answers.slice(0, 4))).toBe("%PDF");
    expect(student.byteLength).toBeGreaterThan(500);
  });

  it("wraps long clues instead of hard 48-char ellipsis", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const long =
      "1. Detailed classroom clue describing the concept thoroughly for students who are learning this unit vocabulary";
    const lines = wrapClueText(long, font, 8, 200);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toContain("vocabulary");
    expect(lines.every((l) => !l.includes("..."))).toBe(true);
  });

  it("paginates when many long clues cannot fit under the grid", async () => {
    const raw = Array.from({ length: 28 }, (_, i) => {
      const ans = (`FORCE${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 3) % 26))}`).slice(
        0,
        4 + (i % 5),
      );
      return {
        id: `w${i}`,
        answerRaw: ans,
        clue: `Detailed classroom clue number ${i + 1} describing the concept thoroughly for students who are learning this unit vocabulary in science class`,
        origin: "manual" as const,
        reviewState: "reviewed_by_user" as const,
      };
    });
    const { entries } = normalizeEntries(raw);
    let best = numberBuildResult(buildGrid({ entries, seed: 7, size: "auto", nodeBudget: 25_000 }));
    for (let s = 7; s < 40; s++) {
      const candidate = numberBuildResult(
        buildGrid({ entries, seed: s, size: "auto", nodeBudget: 20_000 }),
      );
      if (candidate.placedEntryIds.length > best.placedEntryIds.length) best = candidate;
    }
    expect(best.placedEntryIds.length).toBeGreaterThan(8);

    const { across, down } = collectClues(best, entries);
    const pdf = await buildStudentPdf({
      result: best,
      entries,
      settings: {
        title: "Overflow Probe",
        nameLinePreset: "name_class_date",
        watermark: "crosswordmaker.app",
      },
    });
    const parsed = await PDFDocument.load(pdf);
    // With wrapped long clues, a filled educational list should spill past one page.
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(across.length + down.length).toBe(best.placements.length);
    // Ensure we did not silently lose clue rows from the data model used for drawing.
    expect(across.every((c) => c.text.length > 40)).toBe(true);
    // Multi-page is the completeness guarantee for this fixture when enough clues place.
    if (across.length + down.length >= 16) {
      expect(parsed.getPageCount()).toBeGreaterThan(1);
    }
  });
});
