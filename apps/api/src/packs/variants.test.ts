import { describe, expect, it } from "vitest";
import { buildExportManifest, buildLayoutVariants } from "./variants";

const sampleEntries = [
  { id: "e1", answerNormalized: "SUN", clue: "Daytime star" },
  { id: "e2", answerNormalized: "MOON", clue: "Night light" },
  { id: "e3", answerNormalized: "MARS", clue: "Red planet" },
  { id: "e4", answerNormalized: "ORBIT", clue: "Path around a star" },
  { id: "e5", answerNormalized: "COMET", clue: "Icy traveler" },
  { id: "e6", answerNormalized: "EARTH", clue: "Our home planet" },
  { id: "e7", answerNormalized: "VENUS", clue: "Hottest planet" },
  { id: "e8", answerNormalized: "SPACE", clue: "Beyond the atmosphere" },
];

describe("buildLayoutVariants", () => {
  it("builds A/B/C with distinct seeds and same clue set", () => {
    const variants = buildLayoutVariants({
      title: "Solar System",
      entries: sampleEntries,
      baseSeed: 42,
      count: 3,
    });
    expect(variants).toHaveLength(3);
    expect(variants.map((v) => v.label)).toEqual(["A", "B", "C"]);
    const seeds = new Set(variants.map((v) => v.seed));
    expect(seeds.size).toBeGreaterThanOrEqual(2);
    for (const v of variants) {
      expect(v.placedCount).toBeGreaterThanOrEqual(4);
      expect(v.snapshot.entries.length).toBe(v.placedCount);
      expect(v.snapshot.grid.length).toBe(v.snapshot.size.rows);
      expect(v.snapshot.title).toContain("Version");
    }
  });

  it("is deterministic for the same inputs", () => {
    const a = buildLayoutVariants({
      title: "Solar System",
      entries: sampleEntries,
      baseSeed: 7,
      count: 2,
    });
    const b = buildLayoutVariants({
      title: "Solar System",
      entries: sampleEntries,
      baseSeed: 7,
      count: 2,
    });
    expect(a.map((v) => v.seed)).toEqual(b.map((v) => v.seed));
    expect(a.map((v) => v.snapshot.grid.join("|"))).toEqual(
      b.map((v) => v.snapshot.grid.join("|")),
    );
  });
});

describe("buildExportManifest", () => {
  it("separates student files from answer keys", () => {
    const variants = buildLayoutVariants({
      title: "Demo",
      entries: sampleEntries,
      baseSeed: 3,
      count: 2,
    });
    const manifest = buildExportManifest({
      packId: "pack-1",
      title: "Demo",
      items: variants.map((v) => ({
        label: v.label,
        versionId: `ver-${v.label}`,
        seed: v.seed,
        snapshot: v.snapshot,
      })),
    });
    const student = manifest.files.filter((f) => f.kind === "student_puzzle");
    const keys = manifest.files.filter((f) => f.kind === "answer_key");
    expect(student).toHaveLength(2);
    expect(keys).toHaveLength(2);
    expect(JSON.stringify(student)).not.toMatch(/"grid"/);
    expect(JSON.stringify(keys)).toMatch(/"grid"/);
    expect(manifest.instructions.path).toBe("instructions/readme.txt");
  });
});
