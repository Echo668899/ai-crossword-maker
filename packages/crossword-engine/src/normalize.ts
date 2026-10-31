import {
  NORMALIZATION_VERSION,
  type EntryOrigin,
  type ReviewState,
  type WordEntry,
} from "./types.js";

export interface NormalizeOptions {
  removeSpaces?: boolean;
  removeHyphens?: boolean;
  removeApostrophes?: boolean;
  minLength?: number;
  maxLength?: number;
}

export interface NormalizeIssue {
  code:
    | "empty"
    | "non_ascii_letter"
    | "too_short"
    | "too_long"
    | "duplicate"
    | "needs_transliteration";
  message: string;
  answerRaw: string;
}

export interface NormalizeResult {
  entries: WordEntry[];
  issues: NormalizeIssue[];
  normalizationVersion: string;
}

const DEFAULTS: Required<NormalizeOptions> = {
  removeSpaces: true,
  removeHyphens: true,
  removeApostrophes: true,
  minLength: 3,
  maxLength: 24,
};

/** Letters A–Z only after normalization. Non-ASCII letters require explicit confirmation. */
export function normalizeAnswer(
  raw: string,
  options: NormalizeOptions = {},
): { normalized: string; display: string; issues: NormalizeIssue[] } {
  const opts = { ...DEFAULTS, ...options };
  const issues: NormalizeIssue[] = [];
  const display = raw.trim();
  if (!display) {
    issues.push({ code: "empty", message: "Answer is empty", answerRaw: raw });
    return { normalized: "", display, issues };
  }

  // Reject silent transliteration of accented / non-Latin characters.
  if (/[^\x00-\x7F]/.test(display)) {
    issues.push({
      code: "needs_transliteration",
      message:
        "Answer contains non-ASCII characters. Confirm a Latin A–Z spelling before placing.",
      answerRaw: raw,
    });
  }

  let s = display.toUpperCase();
  if (opts.removeSpaces) s = s.replace(/\s+/g, "");
  if (opts.removeHyphens) s = s.replace(/-/g, "");
  if (opts.removeApostrophes) s = s.replace(/'/g, "");

  if (/[^A-Z]/.test(s) && !/[^\x00-\x7F]/.test(display)) {
    issues.push({
      code: "non_ascii_letter",
      message: "Answer contains digits or symbols that cannot be placed on an A–Z grid",
      answerRaw: raw,
    });
  }

  const normalized = s.replace(/[^A-Z]/g, "");

  if (normalized.length < opts.minLength) {
    issues.push({
      code: "too_short",
      message: `Normalized answer shorter than ${opts.minLength}`,
      answerRaw: raw,
    });
  }
  if (normalized.length > opts.maxLength) {
    issues.push({
      code: "too_long",
      message: `Normalized answer longer than ${opts.maxLength}`,
      answerRaw: raw,
    });
  }

  return { normalized, display, issues };
}

export function displayLengthHint(display: string): string | undefined {
  const parts = display
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p.replace(/'/g, "").length)
    .filter((n) => n > 0);
  if (parts.length <= 1) return undefined;
  return `(${parts.join(", ")})`;
}

export function makeEntry(input: {
  id: string;
  answerRaw: string;
  clue: string;
  origin: EntryOrigin;
  reviewState?: ReviewState;
  difficultyTarget?: WordEntry["difficultyTarget"];
  sourceRef?: string;
  required?: boolean;
  options?: NormalizeOptions;
}): { entry: WordEntry | null; issues: NormalizeIssue[] } {
  const { normalized, display, issues } = normalizeAnswer(input.answerRaw, input.options);
  if (!normalized || issues.some((i) => i.code === "empty" || i.code === "needs_transliteration")) {
    return { entry: null, issues };
  }
  if (issues.some((i) => i.code === "too_short" || i.code === "too_long" || i.code === "non_ascii_letter")) {
    return { entry: null, issues };
  }
  return {
    entry: {
      id: input.id,
      answerRaw: input.answerRaw,
      answerNormalized: normalized,
      displayAnswer: display,
      clue: input.clue.trim(),
      difficultyTarget: input.difficultyTarget,
      origin: input.origin,
      sourceRef: input.sourceRef,
      reviewState: input.reviewState ?? "needs_review",
      normalizationVersion: NORMALIZATION_VERSION,
      required: input.required ?? true,
    },
    issues,
  };
}

export function normalizeEntries(
  items: Array<{
    id: string;
    answerRaw: string;
    clue: string;
    origin: EntryOrigin;
    reviewState?: ReviewState;
    difficultyTarget?: WordEntry["difficultyTarget"];
    required?: boolean;
  }>,
  options?: NormalizeOptions,
): NormalizeResult {
  const entries: WordEntry[] = [];
  const issues: NormalizeIssue[] = [];
  const seen = new Map<string, string>();

  for (const item of items) {
    const { entry, issues: entryIssues } = makeEntry({ ...item, options });
    issues.push(...entryIssues);
    if (!entry) continue;
    const prior = seen.get(entry.answerNormalized);
    if (prior) {
      issues.push({
        code: "duplicate",
        message: `Duplicate normalized answer "${entry.answerNormalized}" (also ${prior})`,
        answerRaw: item.answerRaw,
      });
      continue;
    }
    seen.set(entry.answerNormalized, entry.id);
    entries.push(entry);
  }

  return { entries, issues, normalizationVersion: NORMALIZATION_VERSION };
}

/** Detect whether clue contains the full answer as a whole word (not accidental substrings). */
export function clueLeaksAnswer(clue: string, answerNormalized: string): boolean {
  if (!answerNormalized || answerNormalized.length < 3) return false;
  const clueNorm = clue.toUpperCase().replace(/[^A-Z\s]/g, " ");
  const words = clueNorm.split(/\s+/).filter(Boolean);
  if (words.includes(answerNormalized)) return true;
  // Multi-word answers often appear as concatenated form already normalized.
  const joined = words.join("");
  return joined === answerNormalized;
}
