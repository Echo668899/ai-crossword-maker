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

export type NormalizeIssueCode =
  | "empty"
  | "non_letter"
  | "too_short"
  | "too_long"
  | "duplicate"
  | "needs_transliteration";

export interface NormalizeIssue {
  code: NormalizeIssueCode;
  message: string;
  answerRaw: string;
  /** Source item id when produced by `normalizeEntries`. */
  entryId?: string;
  /** Latin A–Z spelling to try when the raw answer has accents. */
  suggestion?: string;
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
    const suggestion = suggestAsciiSpelling(display);
    issues.push({
      code: "needs_transliteration",
      message: suggestion
        ? `Contains accented or non-English letters. Try ${suggestion} (Latin A–Z only; we do not auto-convert).`
        : "Contains accented or non-English letters. Confirm a Latin A–Z spelling before placing.",
      answerRaw: raw,
      suggestion,
    });
  }

  let s = display.toUpperCase();
  if (opts.removeSpaces) s = s.replace(/\s+/g, "");
  if (opts.removeHyphens) s = s.replace(/-/g, "");
  if (opts.removeApostrophes) s = s.replace(/'/g, "");

  if (/[^A-Z]/.test(s) && !/[^\x00-\x7F]/.test(display)) {
    issues.push({
      code: "non_letter",
      message: "Digits or symbols cannot be placed on an A–Z grid",
      answerRaw: raw,
    });
  }

  const normalized = s.replace(/[^A-Z]/g, "");

  // Pure digit/symbol strings are `non_letter`, not `too_short` (empty after strip).
  const hasBlockingCharset =
    issues.some((i) => i.code === "non_letter" || i.code === "needs_transliteration") &&
    normalized.length === 0;
  if (!hasBlockingCharset && normalized.length < opts.minLength) {
    issues.push({
      code: "too_short",
      message: `Too short — need ${opts.minLength}–${opts.maxLength} letters after removing spaces and punctuation`,
      answerRaw: raw,
    });
  }
  if (normalized.length > opts.maxLength) {
    issues.push({
      code: "too_long",
      message: `Too long — max ${opts.maxLength} letters after removing spaces and punctuation`,
      answerRaw: raw,
    });
  }

  return { normalized, display, issues };
}

/** Fold accents to ASCII letters for a suggestion only — never applied silently. */
export function suggestAsciiSpelling(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const folded = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (folded === trimmed) return undefined;
  const letters = folded.toUpperCase().replace(/[^A-Z]/g, "");
  return letters.length >= 3 ? letters : undefined;
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
  if (issues.some((i) => i.code === "too_short" || i.code === "too_long" || i.code === "non_letter")) {
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
    issues.push(...entryIssues.map((issue) => ({ ...issue, entryId: item.id })));
    if (!entry) continue;
    const prior = seen.get(entry.answerNormalized);
    if (prior) {
      issues.push({
        code: "duplicate",
        message: `Duplicate of ${entry.answerNormalized}`,
        answerRaw: item.answerRaw,
        entryId: item.id,
      });
      continue;
    }
    seen.set(entry.answerNormalized, entry.id);
    entries.push(entry);
  }

  return { entries, issues, normalizationVersion: NORMALIZATION_VERSION };
}

const ISSUE_PRIORITY: NormalizeIssueCode[] = [
  "empty",
  "needs_transliteration",
  "non_letter",
  "too_long",
  "too_short",
  "duplicate",
];

/** One teacher-facing reason per dropped answer (most specific first). */
export function primaryNormalizeIssue(issues: NormalizeIssue[]): NormalizeIssue | undefined {
  for (const code of ISSUE_PRIORITY) {
    const hit = issues.find((issue) => issue.code === code);
    if (hit) return hit;
  }
  return issues[0];
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
