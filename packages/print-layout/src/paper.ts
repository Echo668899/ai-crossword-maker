import type { PageOrientation, PaperSize } from "./types.js";

/** PDF points (1/72 in). ISO A4 and US Letter portrait. */
export const PAPER_SIZE_PT: Record<PaperSize, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

/** Shared inset for student/answer PDFs (~0.67 in). */
export const PAGE_MARGIN_PT = 48;

export function resolvePaperSize(value: unknown): PaperSize {
  return value === "a4" ? "a4" : "letter";
}

export function paperPageSize(
  paper: PaperSize,
  orientation: PageOrientation = "portrait",
): { width: number; height: number } {
  const base = PAPER_SIZE_PT[paper] ?? PAPER_SIZE_PT.letter;
  if (orientation === "landscape") return { width: base.height, height: base.width };
  return { width: base.width, height: base.height };
}

export function printContentWidth(
  paper: PaperSize,
  orientation: PageOrientation = "portrait",
): number {
  return paperPageSize(paper, orientation).width - PAGE_MARGIN_PT * 2;
}

/** CSS `@page size` token for browser print. */
export function cssPageSize(paper: PaperSize): "letter" | "A4" {
  return paper === "a4" ? "A4" : "letter";
}
