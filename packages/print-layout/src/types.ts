import type { NameLinePreset } from "./name-line.js";

export type PaperSize = "letter" | "a4";
export type PageOrientation = "portrait" | "landscape";
export type { NameLinePreset } from "./name-line.js";

export interface PrintLayoutSettings {
  title: string;
  subtitle?: string;
  paper: PaperSize;
  orientation: PageOrientation;
  /** @deprecated Prefer nameLinePreset; kept for pack/export callers. */
  showNameDate: boolean;
  /** Teacher worksheet header blanks (Name/Date/Class/Period). */
  nameLinePreset: NameLinePreset;
  showWordBank: boolean;
  showAnswerLengths: boolean;
  clueColumns: 1 | 2;
  watermark?: string | null;
  largePrint?: boolean;
}

export const DEFAULT_PRINT_LAYOUT: PrintLayoutSettings = {
  title: "Crossword Puzzle",
  subtitle: undefined,
  paper: "letter",
  orientation: "portrait",
  showNameDate: true,
  nameLinePreset: "name-date",
  showWordBank: false,
  showAnswerLengths: false,
  clueColumns: 2,
  watermark: "aicrosswordmaker.com",
  largePrint: false,
};

export interface ClueLine {
  number: number;
  direction: "across" | "down";
  text: string;
  length: number;
}
