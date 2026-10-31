export type PaperSize = "letter" | "a4";
export type PageOrientation = "portrait" | "landscape";

export interface PrintLayoutSettings {
  title: string;
  subtitle?: string;
  paper: PaperSize;
  orientation: PageOrientation;
  showNameDate: boolean;
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
