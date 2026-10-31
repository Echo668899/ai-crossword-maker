export const limits = {
  minWords: 5,
  maxWords: 30,
  minAnswerLen: 3,
  maxAnswerLen: 24,
  gridSizes: [
    { rows: 15, cols: 15 },
    { rows: 21, cols: 21 },
    { rows: 25, cols: 25 },
    { rows: 31, cols: 31 },
  ],
  pdfMaxUploadMb: 5,
  pdfMaxPages: 20,
  engineNodeBudget: 50_000,
} as const;
