import {
  buildGrid,
  cellsToAscii,
  normalizeEntries,
  numberBuildResult,
  validateBuildResult,
  VALIDATOR_VERSION,
  type WordEntry,
} from "@acm/crossword-engine";
import type { PuzzleSnapshot } from "../play/snapshot";

const VARIANT_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export type VariantLabel = (typeof VARIANT_LABELS)[number];

export function variantLabel(index: number): string {
  return VARIANT_LABELS[index] ?? `V${index + 1}`;
}

export type VariantBuildInput = {
  title: string;
  entries: Array<{
    id: string;
    answerNormalized: string;
    clue: string;
    displayAnswer?: string;
  }>;
  baseSeed: number;
  count: number;
  reviewState?: string;
};

export type BuiltVariant = {
  label: string;
  seed: number;
  snapshot: PuzzleSnapshot;
  placedCount: number;
  validationOk: boolean;
};

/**
 * Build distinct layout variants (A/B/C…) from the same word list using different seeds.
 * Deterministic for a given baseSeed + count. Never invents clues.
 */
export function buildLayoutVariants(input: VariantBuildInput): BuiltVariant[] {
  const count = Math.max(1, Math.min(input.count, VARIANT_LABELS.length));
  const { entries } = normalizeEntries(
    input.entries.map((e) => ({
      id: e.id,
      answerRaw: e.answerNormalized,
      clue: e.clue,
      origin: "manual" as const,
      reviewState: "needs_review" as const,
      displayAnswer: e.displayAnswer,
    })),
  );

  const usedSeeds = new Set<number>();
  const usedFingerprints = new Set<string>();
  const out: BuiltVariant[] = [];

  for (let i = 0; i < count; i++) {
    const built = pickDistinctLayout(entries, input.baseSeed, i, usedSeeds, usedFingerprints);
    const placed = new Set(built.result.placedEntryIds);
    const snapshot: PuzzleSnapshot = {
      title: `${input.title} (Version ${variantLabel(i)})`,
      seed: built.result.seed,
      engineVersion: built.result.engineVersion,
      validatorVersion: VALIDATOR_VERSION,
      reviewState: input.reviewState ?? "needs_review",
      size: built.result.size,
      grid: cellsToAscii(built.result.cells),
      placements: built.result.placements,
      entries: entries
        .filter((e) => placed.has(e.id))
        .map((e) => ({
          id: e.id,
          answerNormalized: e.answerNormalized,
          clue: e.clue,
          displayAnswer: e.displayAnswer,
        })),
    };
    out.push({
      label: variantLabel(i),
      seed: built.result.seed,
      snapshot,
      placedCount: built.result.placedEntryIds.length,
      validationOk: built.validationOk,
    });
  }

  return out;
}

function layoutFingerprint(grid: string[], placements: Array<{ entryId: string; row: number; col: number; direction: string }>): string {
  const placeKey = placements
    .map((p) => `${p.entryId}:${p.row},${p.col},${p.direction}`)
    .sort()
    .join("|");
  return `${grid.join("/")}\n${placeKey}`;
}

function pickDistinctLayout(
  entries: WordEntry[],
  baseSeed: number,
  variantIndex: number,
  usedSeeds: Set<number>,
  usedFingerprints: Set<string>,
) {
  let best = numberBuildResult(
    buildGrid({
      entries,
      seed: baseSeed + variantIndex * 97,
      size: "auto",
      nodeBudget: 20_000,
    }),
  );
  let bestOk = validateBuildResult(best, entries).ok;
  let bestFp = layoutFingerprint(cellsToAscii(best.cells), best.placements);

  for (let offset = 0; offset < 40; offset++) {
    const seed = baseSeed + variantIndex * 97 + offset * 13 + variantIndex;
    if (usedSeeds.has(seed)) continue;
    const candidate = numberBuildResult(
      buildGrid({ entries, seed, size: "auto", nodeBudget: 18_000 }),
    );
    const report = validateBuildResult(candidate, entries);
    const fp = layoutFingerprint(cellsToAscii(candidate.cells), candidate.placements);
    const distinct = !usedFingerprints.has(fp);
    const betterCoverage = candidate.placedEntryIds.length > best.placedEntryIds.length;
    const sameCoverageBetter =
      candidate.placedEntryIds.length === best.placedEntryIds.length &&
      distinct &&
      (candidate.status === "solved" || report.ok);
    if (
      (distinct && (betterCoverage || sameCoverageBetter || candidate.status === "solved")) ||
      (betterCoverage && !usedFingerprints.has(fp))
    ) {
      best = candidate;
      bestOk = report.ok;
      bestFp = fp;
      if (candidate.status === "solved" && distinct && report.ok) break;
    }
  }

  usedSeeds.add(best.seed);
  usedFingerprints.add(bestFp);
  return { result: best, validationOk: bestOk };
}

/** Build a sync export manifest (ZIP/R2 lands later). */
export function buildExportManifest(input: {
  packId: string;
  title: string;
  items: Array<{ label: string; versionId: string; seed: number; snapshot: PuzzleSnapshot }>;
}) {
  return {
    formatVersion: 1,
    packId: input.packId,
    title: input.title,
    generatedAt: new Date().toISOString(),
    folders: {
      students: "students/",
      answerKeys: "answer-keys/",
      instructions: "instructions/",
    },
    files: input.items.flatMap((item) => [
      {
        path: `students/version-${item.label.toLowerCase()}.json`,
        kind: "student_puzzle" as const,
        versionId: item.versionId,
        label: item.label,
        seed: item.seed,
        title: item.snapshot.title,
        size: item.snapshot.size,
        // Student file omits answer grid letters intentionally — placements + clues only.
        placements: item.snapshot.placements,
        clues: item.snapshot.entries.map((e) => ({
          id: e.id,
          clue: e.clue,
          length: e.answerNormalized.length,
        })),
      },
      {
        path: `answer-keys/version-${item.label.toLowerCase()}.json`,
        kind: "answer_key" as const,
        versionId: item.versionId,
        label: item.label,
        seed: item.seed,
        grid: item.snapshot.grid,
        entries: item.snapshot.entries.map((e) => ({
          id: e.id,
          answerNormalized: e.answerNormalized,
          clue: e.clue,
        })),
      },
    ]),
    instructions: {
      path: "instructions/readme.txt",
      text: [
        `${input.title} — classroom activity pack`,
        "Print student sheets without answer keys.",
        "Keep answer-keys/ for teacher use only.",
        "Versions A/B/C use the same clues with different layouts.",
      ].join("\n"),
    },
  };
}
