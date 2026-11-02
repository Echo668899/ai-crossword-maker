import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { BuildResult, WordEntry } from "@acm/crossword-engine";
import { nameLineText, resolveNameLinePreset } from "./name-line.js";
import { PAGE_MARGIN_PT, paperPageSize } from "./paper.js";
import { DEFAULT_PRINT_LAYOUT, type ClueLine, type PrintLayoutSettings } from "./types.js";

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

/** Wrap a single clue into visual lines that fit `maxWidth` at `fontSize`. */
export function wrapClueText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }
    // Hard-break an overlong token rather than silently ellipsizing the clue.
    let chunk = "";
    for (const ch of word) {
      const next = chunk + ch;
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
        chunk = next;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

type DrawnLine = { text: string; bold?: boolean; color?: ReturnType<typeof rgb> };

function drawWatermark(
  page: PDFPage,
  settings: PrintLayoutSettings,
  font: PDFFont,
  margin: number,
  showAnswers: boolean,
) {
  if (!settings.watermark || showAnswers) return;
  page.drawText(settings.watermark, {
    x: margin,
    y: 24,
    size: 8,
    font,
    color: rgb(0.55, 0.6, 0.66),
  });
}

function drawHeaderBlock(input: {
  page: PDFPage;
  settings: PrintLayoutSettings;
  font: PDFFont;
  fontBold: PDFFont;
  margin: number;
  y: number;
  showAnswers: boolean;
  nameLine: string | null;
  continuation?: boolean;
}): number {
  const { page, settings, font, fontBold, margin, showAnswers, nameLine } = input;
  let y = input.y;
  const title = input.continuation
    ? `${settings.title} (clues continued)`
    : settings.title;
  page.drawText(title, {
    x: margin,
    y: y - 18,
    size: input.continuation ? 14 : 18,
    font: fontBold,
    color: rgb(0.11, 0.14, 0.19),
  });
  y -= input.continuation ? 24 : 28;
  if (!input.continuation && settings.subtitle) {
    page.drawText(settings.subtitle, {
      x: margin,
      y: y - 12,
      size: 11,
      font,
      color: rgb(0.35, 0.4, 0.47),
    });
    y -= 20;
  }
  if (!input.continuation && nameLine) {
    page.drawText(nameLine, {
      x: margin,
      y: y - 12,
      size: 10,
      font,
      color: rgb(0.11, 0.14, 0.19),
    });
    y -= 24;
  }
  if (input.continuation) {
    page.drawText(showAnswers ? "Answer Key — continued" : "Clues — continued", {
      x: margin,
      y: y - 12,
      size: 12,
      font: fontBold,
      color: rgb(0.11, 0.14, 0.19),
    });
    y -= 20;
  }
  return y;
}

function drawGrid(input: {
  page: PDFPage;
  result: BuildResult;
  font: PDFFont;
  fontBold: PDFFont;
  originX: number;
  originY: number;
  cell: number;
  showAnswers: boolean;
}) {
  const { page, result, font, fontBold, originX, originY, cell, showAnswers } = input;
  const rows = result.size.rows;
  const cols = result.size.cols;
  const numberAt = new Map<string, number>();
  for (const p of result.placements) {
    if (p.number) numberAt.set(`${p.row},${p.col}`, p.number);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const letter = result.cells[r]![c]!.letter;
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
}

function buildWrappedColumn(
  title: string,
  lines: ClueLine[],
  font: PDFFont,
  fontBold: PDFFont,
  fontSize: number,
  maxWidth: number,
  showAnswerLengths: boolean,
): DrawnLine[] {
  const out: DrawnLine[] = [{ text: title, bold: true, color: rgb(0.18, 0.36, 0.56) }];
  for (const line of lines) {
    const suffix = showAnswerLengths ? ` (${line.length})` : "";
    const full = `${line.number}. ${line.text}${suffix}`;
    const wrapped = wrapClueText(full, font, fontSize, maxWidth);
    for (const w of wrapped) {
      out.push({ text: w });
    }
  }
  return out;
}

function paintColumnLines(input: {
  page: PDFPage;
  lines: DrawnLine[];
  startIndex: number;
  x: number;
  startY: number;
  bottom: number;
  lineHeight: number;
  font: PDFFont;
  fontBold: PDFFont;
  fontSize: number;
}): { nextIndex: number; y: number } {
  let i = input.startIndex;
  let y = input.startY;
  while (i < input.lines.length) {
    if (y < input.bottom) break;
    const line = input.lines[i]!;
    input.page.drawText(line.text, {
      x: input.x,
      y,
      size: line.bold ? 10 : input.fontSize,
      font: line.bold ? input.fontBold : input.font,
      color: line.color ?? rgb(0.11, 0.14, 0.19),
    });
    y -= line.bold ? 12 : input.lineHeight;
    i += 1;
  }
  return { nextIndex: i, y };
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
  const { width: w, height: h } = paperPageSize(settings.paper, settings.orientation);
  const margin = PAGE_MARGIN_PT;
  const clueFontSize = 8;
  const clueLineHeight = 10;

  const namePreset =
    input.settings?.nameLinePreset ??
    resolveNameLinePreset({ showNameDate: settings.showNameDate });
  const nameLine = nameLineText(namePreset);

  const page1 = doc.addPage([w, h]);
  let y = drawHeaderBlock({
    page: page1,
    settings,
    font,
    fontBold,
    margin,
    y: h - margin,
    showAnswers,
    nameLine,
  });

  const rows = input.result.size.rows;
  const cols = input.result.size.cols;
  // Reserve room for at least a short clue block under the grid on page 1.
  const maxGrid = Math.min(w - margin * 2, y - margin - 160);
  const cell = Math.min(22, Math.floor(maxGrid / Math.max(rows, cols)));
  const gridW = cols * cell;
  const gridH = rows * cell;
  const originX = margin;
  const originY = y - gridH;

  drawGrid({
    page: page1,
    result: input.result,
    font,
    fontBold,
    originX,
    originY,
    cell,
    showAnswers,
  });

  let clueY = originY - 18;
  page1.drawText(showAnswers ? "Answer Key" : "Clues", {
    x: margin,
    y: clueY,
    size: 12,
    font: fontBold,
    color: rgb(0.11, 0.14, 0.19),
  });
  clueY -= 16;

  const { across, down } = collectClues(input.result, input.entries);
  const colGap = (w - margin * 2) / 2;
  const colWidth = colGap - 8;
  const acrossLines = buildWrappedColumn(
    "Across",
    across,
    font,
    fontBold,
    clueFontSize,
    colWidth,
    settings.showAnswerLengths,
  );
  const downLines = buildWrappedColumn(
    "Down",
    down,
    font,
    fontBold,
    clueFontSize,
    colWidth,
    settings.showAnswerLengths,
  );

  const bottom = margin + 24;
  let acrossIdx = 0;
  let downIdx = 0;
  let page = page1;
  let startY = clueY;

  // Page 1 (and any continuation pages): paint both columns until both are exhausted.
  while (acrossIdx < acrossLines.length || downIdx < downLines.length) {
    const left = paintColumnLines({
      page,
      lines: acrossLines,
      startIndex: acrossIdx,
      x: margin,
      startY,
      bottom,
      lineHeight: clueLineHeight,
      font,
      fontBold,
      fontSize: clueFontSize,
    });
    const right = paintColumnLines({
      page,
      lines: downLines,
      startIndex: downIdx,
      x: margin + colGap,
      startY,
      bottom,
      lineHeight: clueLineHeight,
      font,
      fontBold,
      fontSize: clueFontSize,
    });
    acrossIdx = left.nextIndex;
    downIdx = right.nextIndex;
    drawWatermark(page, settings, font, margin, showAnswers);

    if (acrossIdx >= acrossLines.length && downIdx >= downLines.length) break;

    page = doc.addPage([w, h]);
    startY = drawHeaderBlock({
      page,
      settings,
      font,
      fontBold,
      margin,
      y: h - margin,
      showAnswers,
      nameLine,
      continuation: true,
    });
  }

  // Avoid unused var lint for gridW (kept for future centering).
  void gridW;

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
