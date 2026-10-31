import { describe, expect, it } from "vitest";
import {
  buildGrid,
  cellsToAscii,
  normalizeEntries,
  numberBuildResult,
} from "@acm/crossword-engine";
import { buildPackExportZip } from "./pack-zip.js";
import { snapshotToPdfInputs } from "./from-snapshot.js";

describe("pack ZIP export", () => {
  it("builds a ZIP with student PDFs that do not embed answer metadata subject", async () => {
    const { entries } = normalizeEntries([
      { id: "e1", answerRaw: "SUN", clue: "Daytime star", origin: "manual", reviewState: "needs_review" },
      { id: "e2", answerRaw: "MOON", clue: "Night light", origin: "manual", reviewState: "needs_review" },
      { id: "e3", answerRaw: "MARS", clue: "Red planet", origin: "manual", reviewState: "needs_review" },
      { id: "e4", answerRaw: "ORBIT", clue: "Path around a star", origin: "manual", reviewState: "needs_review" },
      { id: "e5", answerRaw: "COMET", clue: "Icy traveler", origin: "manual", reviewState: "needs_review" },
      { id: "e6", answerRaw: "EARTH", clue: "Our home planet", origin: "manual", reviewState: "needs_review" },
    ]);
    const result = numberBuildResult(buildGrid({ entries, seed: 11, size: "auto", nodeBudget: 20_000 }));
    const placed = new Set(result.placedEntryIds);
    const snapshot = {
      title: "Solar Demo",
      seed: result.seed,
      engineVersion: result.engineVersion,
      size: result.size,
      grid: cellsToAscii(result.cells),
      placements: result.placements,
      entries: entries
        .filter((e) => placed.has(e.id))
        .map((e) => ({
          id: e.id,
          answerNormalized: e.answerNormalized,
          clue: e.clue,
        })),
    };

    const inputs = snapshotToPdfInputs(snapshot);
    expect(inputs.result.placements.length).toBeGreaterThan(0);

    const { bytes, manifest, sha256Hex } = await buildPackExportZip({
      packId: "pack-1",
      title: "Solar Demo",
      items: [
        { label: "A", versionId: "v1", seed: snapshot.seed, snapshot },
        { label: "B", versionId: "v2", seed: snapshot.seed + 1, snapshot },
      ],
    });

    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    expect(sha256Hex).toHaveLength(64);
    expect(manifest.files.some((f) => f.kind === "student_pdf")).toBe(true);
    expect(manifest.files.some((f) => f.kind === "answer_key_pdf")).toBe(true);
    const studentJson = manifest.files.filter((f) => f.kind === "student_puzzle");
    expect(studentJson.length).toBe(2);
  });
});
