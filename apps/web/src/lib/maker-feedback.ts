import {
  normalizeEntries,
  primaryNormalizeIssue,
  type NormalizeIssue,
  type WordEntry,
} from "@acm/crossword-engine";

export interface MakerEntryRow {
  answer: string;
  clue: string;
}

export type MakerBuildMode = "topic" | "words" | "manual" | "paste" | "import";

export interface SkippedEntryNote {
  rowIndex: number;
  entryId: string;
  answerRaw: string;
  reason: string;
  code: NormalizeIssue["code"] | "rejected";
}

export interface EntrySkipSummary {
  inputCount: number;
  usedCount: number;
  skipped: SkippedEntryNote[];
  usedIds: Set<string>;
  byRowIndex: Map<number, SkippedEntryNote>;
  usedAnswers: string[];
}

export const STALE_GRID_MESSAGE =
  "Answers changed since the last build — click Build grid to refresh the preview and exports.";

export function parsePaste(text: string): MakerEntryRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes("|")) {
        const [answer, ...rest] = line.split("|");
        return { answer: (answer ?? "").trim(), clue: rest.join("|").trim() };
      }
      if (line.includes("\t")) {
        const [answer, ...rest] = line.split("\t");
        return { answer: (answer ?? "").trim(), clue: rest.join("\t").trim() };
      }
      return { answer: line, clue: "" };
    });
}

/** Same source `runBuild` uses: paste/import text when present, otherwise the Entries table. */
export function sourceRowsForBuild(
  mode: MakerBuildMode,
  rows: MakerEntryRow[],
  pasteText: string,
): MakerEntryRow[] {
  if ((mode === "paste" || mode === "import") && pasteText.trim()) {
    return parsePaste(pasteText);
  }
  return rows;
}

export function formatSkipReason(issue: NormalizeIssue): string {
  return issue.message;
}

export function summarizeSkippedEntries(rows: MakerEntryRow[]): EntrySkipSummary {
  const indexed = rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row }) => row.answer.trim());
  const items = indexed.map(({ row, rowIndex }, i) => ({
    id: `local-${i + 1}`,
    answerRaw: row.answer,
    clue: row.clue,
    origin: "manual" as const,
    rowIndex,
  }));
  const { entries, issues } = normalizeEntries(items);
  const usedIds = new Set(entries.map((entry) => entry.id));
  const issuesById = new Map<string, NormalizeIssue[]>();
  for (const issue of issues) {
    if (!issue.entryId) continue;
    const list = issuesById.get(issue.entryId) ?? [];
    list.push(issue);
    issuesById.set(issue.entryId, list);
  }
  const skipped: SkippedEntryNote[] = items
    .filter((item) => !usedIds.has(item.id))
    .map((item) => {
      const primary = primaryNormalizeIssue(issuesById.get(item.id) ?? []);
      return {
        rowIndex: item.rowIndex,
        entryId: item.id,
        answerRaw: item.answerRaw,
        reason: primary ? formatSkipReason(primary) : "Could not be used on an A–Z grid",
        code: primary?.code ?? "rejected",
      };
    });
  return {
    inputCount: items.length,
    usedCount: entries.length,
    skipped,
    usedIds,
    byRowIndex: new Map(skipped.map((note) => [note.rowIndex, note])),
    usedAnswers: entries.map((entry) => entry.answerNormalized),
  };
}

export function formatSkipSummaryLine(summary: EntrySkipSummary, used: boolean): string {
  if (summary.inputCount === 0) return "";
  if (summary.skipped.length === 0) {
    return used
      ? `${summary.usedCount} of ${summary.inputCount} words used`
      : `${summary.usedCount} of ${summary.inputCount} words valid`;
  }
  const verb = used ? "used" : "valid";
  const reasons = summary.skipped
    .map((note) => `${note.answerRaw.trim() || "(blank)"} (${note.reason})`)
    .join("; ");
  return `${summary.usedCount} of ${summary.inputCount} words ${verb} — ${summary.skipped.length} skipped: ${reasons}`;
}

/** True when the next build source would not reuse the same placed answers. */
export function answersDriftFromBuild(
  builtEntries: WordEntry[],
  sourceRows: MakerEntryRow[],
): boolean {
  if (!builtEntries.length) return false;
  const next = summarizeSkippedEntries(sourceRows);
  if (next.usedAnswers.length !== builtEntries.length) return true;
  return builtEntries.some((entry, index) => next.usedAnswers[index] !== entry.answerNormalized);
}

export function gridCheckStatus(opts: {
  validationOk: boolean | undefined;
  placed: number;
  total: number;
}): { label: string; tone: "ok" | "warn" | "danger" | "neutral" } | null {
  if (!opts.total) return null;
  const placedAll = opts.placed === opts.total;
  if (opts.validationOk && placedAll) {
    return { label: "Grid checks passed", tone: "ok" };
  }
  if (!placedAll) {
    return { label: `${opts.placed} of ${opts.total} placed`, tone: "warn" };
  }
  if (opts.validationOk === false) {
    return { label: "Clues / grid need review", tone: "warn" };
  }
  return null;
}

export function formatBuildStatusLine(opts: {
  placed: number;
  total: number;
  status: string;
  validationOk: boolean;
  validationMessage?: string;
  leaks: number;
  skipLine?: string;
  titleHint?: string;
}): string {
  const placedAll = opts.placed === opts.total && opts.total > 0;
  const check =
    opts.validationOk && placedAll
      ? "Grid checks passed."
      : opts.validationOk && !placedAll
        ? `${opts.placed} of ${opts.total} placed — remaining words did not fit.`
        : `Validator: ${opts.validationMessage ?? "issues found"}.`;
  return [
    opts.titleHint ? `${opts.titleHint}` : "",
    `Placed ${opts.placed}/${opts.total} (${opts.status}).`,
    check,
    opts.leaks ? `Clue leak warning on ${opts.leaks} entr${opts.leaks === 1 ? "y" : "ies"}.` : "",
    opts.skipLine ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}
