import { zipSync, strToU8 } from "fflate";
import { buildAnswerKeyPdf, buildStudentPdf } from "./pdf.js";
import { snapshotToPdfInputs, type PackSnapshot } from "./from-snapshot.js";

export type PackZipVariant = {
  label: string;
  versionId: string;
  seed: number;
  snapshot: PackSnapshot;
};

export type PackZipManifest = {
  formatVersion: 1;
  packId: string;
  title: string;
  generatedAt: string;
  folders: {
    students: string;
    answerKeys: string;
    instructions: string;
  };
  files: Array<{
    path: string;
    kind: "student_pdf" | "answer_key_pdf" | "student_puzzle" | "answer_key" | "instructions";
    versionId?: string;
    label?: string;
    seed?: number;
    byteHint?: string;
  }>;
  instructions: { path: string; text: string };
};

function slugLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * Build a private classroom pack ZIP:
 * students/*.pdf (no answers), answer-keys/*.pdf, instructions/readme.txt, manifest.json.
 */
export async function buildPackExportZip(input: {
  packId: string;
  title: string;
  items: PackZipVariant[];
}): Promise<{ bytes: Uint8Array; manifest: PackZipManifest; sha256Hex: string }> {
  const generatedAt = new Date().toISOString();
  const files: Record<string, Uint8Array> = {};
  const manifestFiles: PackZipManifest["files"] = [];

  for (const item of input.items) {
    const { result, entries } = snapshotToPdfInputs(item.snapshot);
    const base = `version-${slugLabel(item.label)}`;
    const studentPath = `students/${base}.pdf`;
    const keyPath = `answer-keys/${base}.pdf`;
    const studentJsonPath = `students/${base}.json`;
    const keyJsonPath = `answer-keys/${base}.json`;

    const studentPdf = await buildStudentPdf({
      result,
      entries,
      settings: {
        title: item.snapshot.title,
        subtitle: `Version ${item.label}`,
        showNameDate: true,
        watermark: null,
      },
      showAnswers: false,
    });
    const answerPdf = await buildAnswerKeyPdf({
      result,
      entries,
      settings: {
        title: item.snapshot.title,
        subtitle: `Answer key — Version ${item.label}`,
        showNameDate: false,
      },
    });

    files[studentPath] = studentPdf;
    files[keyPath] = answerPdf;

    const studentJson = {
      versionId: item.versionId,
      label: item.label,
      seed: item.seed,
      title: item.snapshot.title,
      size: item.snapshot.size,
      placements: item.snapshot.placements,
      clues: item.snapshot.entries.map((e) => ({
        id: e.id,
        clue: e.clue,
        length: e.answerNormalized.length,
      })),
    };
    const keyJson = {
      versionId: item.versionId,
      label: item.label,
      seed: item.seed,
      grid: item.snapshot.grid,
      entries: item.snapshot.entries.map((e) => ({
        id: e.id,
        answerNormalized: e.answerNormalized,
        clue: e.clue,
      })),
    };
    files[studentJsonPath] = strToU8(JSON.stringify(studentJson, null, 2));
    files[keyJsonPath] = strToU8(JSON.stringify(keyJson, null, 2));

    manifestFiles.push(
      {
        path: studentPath,
        kind: "student_pdf",
        versionId: item.versionId,
        label: item.label,
        seed: item.seed,
      },
      {
        path: keyPath,
        kind: "answer_key_pdf",
        versionId: item.versionId,
        label: item.label,
        seed: item.seed,
      },
      {
        path: studentJsonPath,
        kind: "student_puzzle",
        versionId: item.versionId,
        label: item.label,
        seed: item.seed,
      },
      {
        path: keyJsonPath,
        kind: "answer_key",
        versionId: item.versionId,
        label: item.label,
        seed: item.seed,
      },
    );
  }

  const instructionsText = [
    `${input.title} — classroom activity pack`,
    "Print student sheets without answer keys.",
    "Keep answer-keys/ for teacher use only.",
    "Versions A/B/C use the same clues with different layouts.",
    `Generated: ${generatedAt}`,
  ].join("\n");
  const instructionsPath = "instructions/readme.txt";
  files[instructionsPath] = strToU8(instructionsText);
  manifestFiles.push({ path: instructionsPath, kind: "instructions" });

  const manifest: PackZipManifest = {
    formatVersion: 1,
    packId: input.packId,
    title: input.title,
    generatedAt,
    folders: {
      students: "students/",
      answerKeys: "answer-keys/",
      instructions: "instructions/",
    },
    files: manifestFiles,
    instructions: { path: instructionsPath, text: instructionsText },
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));

  const bytes = zipSync(files, { level: 6 });
  const sha256Hex = await sha256HexOf(bytes);
  return { bytes, manifest, sha256Hex };
}

async function sha256HexOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
