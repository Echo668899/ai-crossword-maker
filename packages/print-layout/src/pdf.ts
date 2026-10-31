import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { BuildResult, WordEntry } from "@acm/crossword-engine";
import { nameLineText, resolveNameLinePreset } from "./name-line.js";
import { DEFAULT_PRINT_LAYOUT, type ClueLine, type PrintLayoutSettings } from "./types.js";

function paperPoints(paper: PrintLayoutSettings["paper"], orientation: PrintLayoutSettings["orientation"]) {
  const letter = { w: 612, h: 792 };
  const a4 = { w: 595.28, h: 841.89 };
  const base = paper === "a4" ? a4 : letter;
  if (orientation === "landscape") return { w: base.h, h: base.w };
  return base;
}

export function collectClues(result: BuildResult, entries: WordEntry[]): { across: ClueLine[]; down: ClueLine[] } {
  const map = new Map(entries.map((e) => [e.id, e]));
  const across: ClueLine[] = [];
  const down: ClueLine[] = [];
  for (const p of result.placements) {
    const e = map.get(p.entryId);
    if (!e || !p.number) continue;
    const line: ClueLine = {
      number: p.number,
      direction: p.direction,
      text: e.clue || "(no clue)",
      length: e.answerNormalized.length,
    };
    if (p.direction === "across") across.push(line);
    else down.push(line);
  }
  across.sort((a, b) => a.number - b.number);
  down.sort((a, b) => a.number - b.number);
  return { across, down };
}

export async function buildStudentPdf(input: {
  result: BuildResult;
  entries: WordEntry[];
  settings?: Partial<PrintLayoutSettings>;
  showAnswers?: boolean;
}): Promise<Uint8Array> {
  const settings: PrintLayoutSettings = { ...DEFAULT_PRINT_LAYOUT, ...input.settings };
  const showAnswers = input.showAnswers ?? false;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { w, h } = paperPoints(settings.paper, settings.orientation);
  const page = doc.addPage([w, h]);
  const margin = 48;
  let y = h - margin;

  page.drawText(settings.title, {
    x: margin,
    y: y - 18,
    size: 18,
    font: fontBold,
    color: rgb(0.11, 0.14, 0.19),
  });
  y -= 28;
  if (settings.subtitle) {
    page.drawText(settings.subtitle, {
      x: margin,
      y: y - 12,
      size: 11,
      font,
      color: rgb(0.35, 0.4, 0.47),
    });
    y -= 20;
  }
  // Prefer an explicit caller preset; otherwise honor legacy showNameDate
  // (answer keys pass showNameDate: false without setting nameLinePreset).
  const namePreset =
    input.settings?.nameLinePreset ??
    resolveNameLinePreset({ showNameDate: settings.showNameDate });
  const nameLine = nameLineText(namePreset);
  if (nameLine) {
    page.drawText(nameLine, {
      x: margin,
      y: y - 12,
      size: 10,
      font,
      color: rgb(0.11, 0.14, 0.19),
    });
    y -= 24;
  }

  const rows = input.result.size.rows;
  const cols = input.result.size.cols;
  const maxGrid = Math.min(w - margin * 2, y - margin - 180);
  const cell = Math.min(22, Math.floor(maxGrid / Math.max(rows, cols)));
  const gridW = cols * cell;
  const gridH = rows * cell;
  const originX = margin;
  const originY = y - gridH;

  const numberAt = new Map<string, number>();
  for (const p of input.result.placements) {
    if (p.number) numberAt.set(`${p.row},${p.col}`, p.number);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const letter = input.result.cells[r]![c]!.letter;
      const x = originX + c * cell;
      const yy = originY + (rows - 1 - r) * cell;
      if (!letter) {
        page.drawRectangle({
          x,
          y: yy,
          width: cell,
          height: cell,
          color: rgb(0.11, 0.14, 0.19),
        });
        continue;
      }
      page.drawRectangle({
        x,
        y: yy,
        width: cell,
        height: cell,
        borderColor: rgb(0.11, 0.14, 0.19),
        borderWidth: 0.8,
      });
      const n = numberAt.get(`${r},${c}`);
      if (n) {
        page.drawText(String(n), {
          x: x + 1.5,
          y: yy + cell - 7,
          size: Math.max(6, cell * 0.28),
          font,
          color: rgb(0.11, 0.14, 0.19),
        });
      }
      if (showAnswers) {
        page.drawText(letter, {
          x: x + cell * 0.32,
          y: yy + cell * 0.28,
          size: cell * 0.45,
          font: fontBold,
          color: rgb(0.11, 0.14, 0.19),
        });
      }
    }
  }

  let clueY = originY - 18;
  page.drawText(showAnswers ? "Answer Key" : "Clues", {
    x: margin,
    y: clueY,
    size: 12,
    font: fontBold,
    color: rgb(0.11, 0.14, 0.19),
  });
  clueY -= 16;

  const { across, down } = collectClues(input.result, input.entries);
  const drawList = (title: string, lines: ClueLine[], x: number) => {
    let cy = clueY;
    page.drawText(title, { x, y: cy, size: 10, font: fontBold, color: rgb(0.18, 0.36, 0.56) });
    cy -= 12;
    for (const line of lines) {
      if (cy < margin + 24) break;
      const suffix = settings.showAnswerLengths ? ` (${line.length})` : "";
      const text = `${line.number}. ${line.text}${suffix}`;
      const clipped = text.length > 48 ? `${text.slice(0, 45)}...` : text;
      page.drawText(clipped, {
        x,
        y: cy,
        size: 8,
        font,
        color: rgb(0.11, 0.14, 0.19),
      });
      cy -= 10;
    }
  };

  const colGap = (w - margin * 2) / 2;
  drawList("Across", across, margin);
  drawList("Down", down, margin + colGap);

  if (settings.watermark && !showAnswers) {
    page.drawText(settings.watermark, {
      x: margin,
      y: 24,
      size: 8,
      font,
      color: rgb(0.55, 0.6, 0.66),
    });
  }

  // Student PDF must not embed answers in metadata when showAnswers is false.
  doc.setTitle(showAnswers ? `${settings.title} — Answer Key` : settings.title);
  doc.setProducer("AI Crossword Maker");
  if (!showAnswers) {
    doc.setSubject("Student puzzle (answers not included)");
  }

  return doc.save();
}

export async function buildAnswerKeyPdf(input: {
  result: BuildResult;
  entries: WordEntry[];
  settings?: Partial<PrintLayoutSettings>;
}): Promise<Uint8Array> {
  return buildStudentPdf({ ...input, showAnswers: true, settings: { ...input.settings, watermark: null } });
}
