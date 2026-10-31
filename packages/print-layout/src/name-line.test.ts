import { describe, expect, it } from "vitest";
import { buildGrid, normalizeEntries, numberBuildResult } from "@acm/crossword-engine";
import { NAME_LINE_PRESETS, nameLineText, resolveNameLinePreset } from "./name-line.js";
import { buildStudentPdf } from "./pdf.js";

describe("teacher name-line presets", () => {
  it("exposes four classroom presets with printable ASCII lines", () => {
    expect(NAME_LINE_PRESETS.map((p) => p.id)).toEqual([
      "name-date",
      "name-class-date",
      "name-period-date",
      "none",
    ]);
    expect(nameLineText("name-date")).toContain("Name:");
    expect(nameLineText("name-date")).toContain("Date:");
    expect(nameLineText("name-class-date")).toContain("Class:");
    expect(nameLineText("name-period-date")).toContain("Period:");
    expect(nameLineText("none")).toBeNull();
  });

  it("resolves legacy showNameDate when preset omitted", () => {
    expect(resolveNameLinePreset({})).toBe("name-date");
    expect(resolveNameLinePreset({ showNameDate: false })).toBe("none");
    expect(resolveNameLinePreset({ nameLinePreset: "name-class-date", showNameDate: false })).toBe(
      "name-class-date",
    );
  });

  it("builds student PDFs for each name-line preset without throwing", async () => {
    const { entries } = normalizeEntries([
      { id: "1", answerRaw: "SUN", clue: "Daytime star", origin: "manual", reviewState: "reviewed_by_user" },
      { id: "2", answerRaw: "SEA", clue: "Salty water", origin: "manual", reviewState: "reviewed_by_user" },
      { id: "3", answerRaw: "USE", clue: "Employ", origin: "manual", reviewState: "reviewed_by_user" },
    ]);
    let result = buildGrid({ entries, seed: 3, size: { rows: 9, cols: 9 }, nodeBudget: 20_000 });
    result = numberBuildResult(result);
    for (const preset of NAME_LINE_PRESETS) {
      const pdf = await buildStudentPdf({
        result,
        entries,
        settings: { title: "Class handout", nameLinePreset: preset.id },
      });
      expect(String.fromCharCode(...pdf.slice(0, 4))).toBe("%PDF");
      expect(pdf.byteLength).toBeGreaterThan(400);
    }
  });
});
