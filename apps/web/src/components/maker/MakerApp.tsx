import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import {
  buildGrid,
  cellsToAscii,
  clueLeaksAnswer,
  normalizeEntries,
  numberBuildResult,
  puzzleToSvg,
  validateBuildResult,
  type BuildResult,
  type WordEntry,
} from "@acm/crossword-engine";
import { Button } from "@acm/ui";
import { StatusPill } from "@acm/ui";
import { loadDraft, saveDraft } from "../../lib/maker-storage";
import { SAMPLE_MANUAL_ENTRIES, TEACHER_CLASSROOM_ENTRIES } from "../../lib/sample-entries";
import { getExample } from "../../lib/examples";
import { apiFetch } from "../../lib/api";
import { hydrateFromSnapshot, type CloudSnapshot } from "../../lib/snapshot-hydrate";
import TurnstileField, { turnstileConfigured } from "../security/TurnstileField";
import { GridView } from "./GridView";

export type MakerMode = "topic" | "words" | "manual" | "paste" | "import";

export type NameLinePresetId = "name-date" | "name-class-date" | "name-period-date" | "none";

export interface MakerAppProps {
  initialMode?: MakerMode;
  initialTopic?: string;
  initialDifficulty?: "easy" | "medium" | "hard";
  initialEntries?: Array<{ answer: string; clue: string }>;
  /** Teacher worksheet header blanks for student PDF export. */
  initialNameLinePreset?: NameLinePresetId;
  heading?: string;
  showModeTabs?: boolean;
  compact?: boolean;
}

const NAME_LINE_OPTIONS: Array<{ id: NameLinePresetId; label: string }> = [
  { id: "name-date", label: "Name + Date" },
  { id: "name-class-date", label: "Name + Class + Date" },
  { id: "name-period-date", label: "Name + Period + Date" },
  { id: "none", label: "No name line" },
];

/** Classroom long-tail chips — fill Topic without spending AI until Generate. */
const TOPIC_QUICK_PICKS = [
  "Electricity for grade 4",
  "Westward Expansion for grade 5",
  "Root Words for grade 3",
  "Multiplication for grade 3",
  "Fossils for grade 4",
] as const;

const EXAMPLE_SEED_SLUGS = [
  "electricity",
  "westward-expansion",
  "root-words",
  "multiplication",
  "fossils",
] as const;

/** Free Generate clues exhausted — steer to Pro unlimited. */
const CLUE_QUOTA_BLOCKED =
  "You've used today's free Generate clues. Upgrade to Pro for unlimited AI clues — or keep typing clues yourself.";
const CLUE_QUOTA_STATUS =
  "Free Generate clues used up for today. Upgrade to Pro for unlimited clues, or type them manually.";
const CLUE_QUOTA_PRO_NOTE = " Pro: Generate clues is unlimited.";
const CLUE_QUOTA_REMAINING = (remaining: number, limit: number) =>
  ` Free Generate clues left today: ${remaining}/${limit}. Pro unlocks unlimited.`;

interface EntryRow {
  answer: string;
  clue: string;
}

interface State {
  mode: MakerMode;
  topic: string;
  wordCount: number;
  difficulty: "easy" | "medium" | "hard";
  title: string;
  rows: EntryRow[];
  pasteText: string;
  seed: number;
  result: BuildResult | null;
  entries: WordEntry[];
  selectedEntryId: string | null;
  statusMessage: string;
  aiBlockedReason: string | null;
}

type Action =
  | { type: "hydrate"; payload: Partial<State> }
  | { type: "setMode"; mode: MakerMode }
  | { type: "setTopic"; topic: string }
  | { type: "setWordCount"; wordCount: number }
  | { type: "setDifficulty"; difficulty: State["difficulty"] }
  | { type: "setTitle"; title: string }
  | { type: "setPaste"; pasteText: string }
  | { type: "setRows"; rows: EntryRow[] }
  | { type: "updateRow"; index: number; row: Partial<EntryRow> }
  | { type: "addRow" }
  | { type: "removeRow"; index: number }
  | { type: "setSeed"; seed: number }
  | { type: "setBuild"; result: BuildResult; entries: WordEntry[]; statusMessage: string }
  | { type: "selectEntry"; id: string | null }
  | { type: "setStatus"; statusMessage: string }
  | { type: "setAiBlocked"; reason: string | null };

/** Keep Across/Down + PDF source clues in sync while editing Entries. */
function syncEntryClues(entries: WordEntry[], rows: EntryRow[]): WordEntry[] {
  if (!entries.length) return entries;
  return entries.map((entry) => {
    const match = /^local-(\d+)$/.exec(entry.id);
    const rowIndex = match ? Number(match[1]) - 1 : -1;
    const row = rowIndex >= 0 ? rows[rowIndex] : undefined;
    if (!row || row.clue === entry.clue) return entry;
    return { ...entry, clue: row.clue };
  });
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate": {
      // IndexedDB restore may omit rows; never write `undefined` over live state.
      const payload = Object.fromEntries(
        Object.entries(action.payload).filter(([, value]) => value !== undefined),
      ) as Partial<State>;
      return { ...state, ...payload };
    }
    case "setMode":
      return { ...state, mode: action.mode };
    case "setTopic":
      return { ...state, topic: action.topic };
    case "setWordCount":
      return { ...state, wordCount: action.wordCount };
    case "setDifficulty":
      return { ...state, difficulty: action.difficulty };
    case "setTitle":
      return { ...state, title: action.title };
    case "setPaste":
      return { ...state, pasteText: action.pasteText };
    case "setRows":
      return {
        ...state,
        rows: action.rows,
        entries: syncEntryClues(state.entries, action.rows),
      };
    case "updateRow": {
      const rows = state.rows.map((r, i) => (i === action.index ? { ...r, ...action.row } : r));
      return { ...state, rows, entries: syncEntryClues(state.entries, rows) };
    }
    case "addRow":
      return { ...state, rows: [...state.rows, { answer: "", clue: "" }] };
    case "removeRow":
      return { ...state, rows: state.rows.filter((_, i) => i !== action.index) };
    case "setSeed":
      return { ...state, seed: action.seed };
    case "setBuild":
      return {
        ...state,
        result: action.result,
        entries: action.entries,
        statusMessage: action.statusMessage,
        selectedEntryId: action.result.placements[0]?.entryId ?? null,
      };
    case "selectEntry":
      return { ...state, selectedEntryId: action.id };
    case "setStatus":
      return { ...state, statusMessage: action.statusMessage };
    case "setAiBlocked":
      return { ...state, aiBlockedReason: action.reason };
    default:
      return state;
  }
}

function parsePaste(text: string): EntryRow[] {
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

function downloadBlob(filename: string, data: Uint8Array | Blob, mime: string) {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([Uint8Array.from(data)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const modes: Array<{ id: MakerMode; label: string }> = [
  { id: "topic", label: "Topic (AI)" },
  { id: "words", label: "Word list" },
  { id: "manual", label: "Words + clues" },
  { id: "paste", label: "Paste text" },
  { id: "import", label: "Import" },
];

export default function MakerApp({
  initialMode = "topic",
  initialTopic = "",
  initialDifficulty = "medium",
  initialEntries,
  initialNameLinePreset = "name-date",
  heading = "Create your crossword",
  showModeTabs = true,
}: MakerAppProps) {
  const [state, dispatch] = useReducer(reducer, {
    mode: initialMode,
    topic: initialTopic,
    wordCount: 12,
    difficulty: initialDifficulty,
    title: "Untitled crossword",
    rows: initialEntries?.length
      ? initialEntries
      : initialMode === "topic"
        ? []
        : SAMPLE_MANUAL_ENTRIES,
    pasteText: "",
    seed: 42,
    result: null,
    entries: [],
    selectedEntryId: null,
    statusMessage:
      initialMode === "topic"
        ? "Enter a topic, then Generate with AI — preview builds automatically."
        : "Add answers and clues, then Build grid. Switch to Topic (AI) anytime.",
    aiBlockedReason: null,
  });
  const [mobileTab, setMobileTab] = useState<"input" | "clues" | "grid" | "export">("input");
  const [history, setHistory] = useState<EntryRow[][]>([]);
  const [future, setFuture] = useState<EntryRow[][]>([]);
  const [draftReady, setDraftReady] = useState(Boolean(initialEntries?.length));
  const [aiLoading, setAiLoading] = useState(false);
  const [clueAiBusyIndex, setClueAiBusyIndex] = useState<number | "all" | null>(null);
  const entriesListRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRowRef = useRef<number | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [packBusy, setPackBusy] = useState(false);
  const [packUrl, setPackUrl] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudPath, setCloudPath] = useState<string | null>(null);
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [cloudRevision, setCloudRevision] = useState<number | null>(null);
  const [cloudVersionId, setCloudVersionId] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [quota, setQuota] = useState<{
    remaining: number | null;
    limit: number | null;
    unlimited?: boolean;
    isPro?: boolean;
  } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [cloudProjects, setCloudProjects] = useState<
    Array<{ id: string; title: string; revision: number }>
  >([]);
  const [loadProjectId, setLoadProjectId] = useState("");
  const [cloudLoadBusy, setCloudLoadBusy] = useState(false);
  const [nameLinePreset, setNameLinePreset] = useState<NameLinePresetId>(initialNameLinePreset);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");
    const versionId = params.get("version");
    const urlTopic = params.get("topic")?.trim() ?? "";
    const urlDifficultyRaw = params.get("difficulty")?.trim().toLowerCase() ?? "";
    const urlDifficulty =
      urlDifficultyRaw === "easy" || urlDifficultyRaw === "medium" || urlDifficultyRaw === "hard"
        ? urlDifficultyRaw
        : null;

    // Page presets and deep-link query params win over stale IndexedDB drafts.
    if (initialEntries?.length || initialTopic || urlTopic || urlDifficulty) {
      if (urlTopic || urlDifficulty) {
        dispatch({
          type: "hydrate",
          payload: {
            mode: "topic",
            ...(urlTopic ? { topic: urlTopic } : {}),
            ...(urlDifficulty ? { difficulty: urlDifficulty } : {}),
            statusMessage: "Loaded level preset from this page — review clues before you print.",
          },
        });
      }
      setDraftReady(true);
      return;
    }

    async function hydrateCloud() {
      if (!projectId) return false;
      try {
        if (versionId) {
          const res = await apiFetch(`/api/v1/projects/${projectId}/versions/${versionId}`);
          const data = await res.json();
          if (!res.ok || !data.snapshot) return false;
          applyCloudSnapshot(data.snapshot as CloudSnapshot, {
            projectId,
            versionId: data.id ?? versionId,
            revision: null,
          });
          return true;
        }
        const res = await apiFetch(`/api/v1/projects/${projectId}`);
        const data = await res.json();
        if (!res.ok || !data.headVersion?.snapshot) return false;
        applyCloudSnapshot(data.headVersion.snapshot as CloudSnapshot, {
          projectId,
          versionId: data.headVersion.id,
          revision: data.revision ?? 1,
        });
        return true;
      } catch {
        return false;
      }
    }

    function applyCloudSnapshot(
      snapshot: CloudSnapshot,
      meta: { projectId: string; versionId: string; revision: number | null },
    ) {
      if (cancelled) return;
      const hydrated = hydrateFromSnapshot(snapshot);
      setCloudProjectId(meta.projectId);
      setCloudVersionId(meta.versionId);
      setCloudRevision(meta.revision);
      setCloudPath(`/app/puzzles/${meta.projectId}/edit/`);
      dispatch({
        type: "hydrate",
        payload: {
          mode: "manual",
          title: hydrated.title,
          seed: hydrated.seed,
          rows: hydrated.rows,
          statusMessage: `Loaded cloud version ${meta.versionId.slice(0, 8)}…`,
        },
      });
      dispatch({
        type: "setBuild",
        result: hydrated.result,
        entries: hydrated.entries,
        statusMessage: `Loaded cloud puzzle “${hydrated.title}” (edit & Save new version).`,
      });
    }

    void (async () => {
      const fromCloud = await hydrateCloud();
      if (cancelled) return;
      if (fromCloud) {
        setDraftReady(true);
        return;
      }
      loadDraft()
        .then((draft) => {
          if (!draft || cancelled) return;
          const usable = (draft.rawEntries ?? []).filter((r) => r.answer?.trim());
          if (usable.length < 2 && !draft.topic.trim()) return;
          dispatch({
            type: "hydrate",
            payload: {
              mode: draft.mode,
              topic: draft.topic,
              wordCount: draft.wordCount,
              difficulty: draft.difficulty,
              title: draft.title,
              ...(usable.length >= 2 ? { rows: draft.rawEntries } : {}),
              seed: draft.seed,
              statusMessage: "Restored local draft from this browser.",
            },
          });
        })
        .finally(() => {
          if (!cancelled) setDraftReady(true);
        });
    })();

    return () => {
      cancelled = true;
    };
  }, [initialEntries, initialTopic]);

  useEffect(() => {
    if (!draftReady) return;
    const handle = window.setTimeout(() => {
      void saveDraft({
        version: 1,
        mode: state.mode,
        topic: state.topic,
        wordCount: state.wordCount,
        difficulty: state.difficulty,
        rawEntries: state.rows,
        seed: state.seed,
        title: state.title,
        updatedAt: new Date().toISOString(),
      });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [
    draftReady,
    state.mode,
    state.topic,
    state.wordCount,
    state.difficulty,
    state.rows,
    state.seed,
    state.title,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [quotaRes, meRes] = await Promise.all([
          apiFetch("/api/v1/ai/quota"),
          apiFetch("/api/v1/auth/me"),
        ]);
        if (cancelled) return;
        if (quotaRes.ok) {
          const q = (await quotaRes.json()) as {
            remaining?: number | null;
            limit?: number | null;
            unlimited?: boolean;
            isPro?: boolean;
          };
          if (q.unlimited || q.isPro) {
            setQuota({
              remaining: typeof q.remaining === "number" ? q.remaining : null,
              limit: typeof q.limit === "number" ? q.limit : null,
              unlimited: true,
              isPro: true,
            });
          } else if (typeof q.remaining === "number" && typeof q.limit === "number") {
            setQuota({
              remaining: q.remaining,
              limit: q.limit,
              unlimited: false,
              isPro: false,
            });
          }
        }
        if (meRes.ok) {
          const me = (await meRes.json()) as { authenticated?: boolean };
          const ok = Boolean(me.authenticated);
          setSignedIn(ok);
          if (ok) {
            const projectsRes = await apiFetch("/api/v1/projects");
            if (!cancelled && projectsRes.ok) {
              const data = (await projectsRes.json()) as {
                projects?: Array<{ id: string; title: string; revision: number }>;
              };
              setCloudProjects(data.projects ?? []);
            }
          }
        }
      } catch {
        /* API optional on static marketing pages */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const validation = useMemo(() => {
    if (!state.result || !state.entries.length) return null;
    return validateBuildResult(state.result, state.entries);
  }, [state.result, state.entries]);

  function pushHistory(nextRows: EntryRow[]) {
    setHistory((h) => [...h.slice(-30), state.rows]);
    setFuture([]);
    dispatch({ type: "setRows", rows: nextRows });
  }

  function addEntryRow() {
    const nextIndex = state.rows.length;
    pendingFocusRowRef.current = nextIndex;
    pushHistory([...state.rows, { answer: "", clue: "" }]);
    dispatch({
      type: "setStatus",
      statusMessage: `Added empty row ${nextIndex + 1}. Type an answer, then Build grid.`,
    });
  }

  useEffect(() => {
    const index = pendingFocusRowRef.current;
    if (index == null) return;
    pendingFocusRowRef.current = null;
    const root = entriesListRef.current;
    if (!root) return;
    const answerInput = root.querySelector<HTMLInputElement>(
      `input[aria-label="Answer ${index + 1}"]`,
    );
    answerInput?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    answerInput?.focus();
  }, [state.rows.length]);

  function undo() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [state.rows, ...f]);
    dispatch({ type: "setRows", rows: prev });
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, state.rows]);
    dispatch({ type: "setRows", rows: next });
  }

  function applyPaste() {
    const parsed = parsePaste(state.pasteText);
    if (!parsed.length) {
      dispatch({ type: "setStatus", statusMessage: "Paste at least one line (ANSWER | clue)." });
      return;
    }
    pushHistory(parsed);
    // Stay in Words mode when the page/user started from a vocabulary list.
    dispatch({ type: "setMode", mode: state.mode === "words" || state.mode === "paste" ? "words" : "manual" });
    dispatch({ type: "setStatus", statusMessage: `Imported ${parsed.length} rows from paste.` });
  }

  function runBuild(seedOverride?: number) {
    try {
      const seed = seedOverride ?? state.seed;
      dispatch({ type: "setStatus", statusMessage: "Building grid…" });
      const sourceRows =
        state.mode === "paste" && state.pasteText.trim() ? parsePaste(state.pasteText) : state.rows;
      const cleaned = sourceRows.filter((r) => r.answer.trim());
      const { entries, issues } = normalizeEntries(
        cleaned.map((r, i) => ({
          id: `local-${i + 1}`,
          answerRaw: r.answer,
          clue: r.clue,
          origin: "manual" as const,
          reviewState: "reviewed_by_user" as const,
        })),
      );
      if (entries.length < 2) {
        dispatch({
          type: "setStatus",
          statusMessage: `Need at least 2 valid A–Z answers (3–24 letters). Got ${cleaned.length} rows, ${entries.length} valid. Issues: ${issues.map((i) => i.code).join(", ") || "none"}`,
        });
        return;
      }
      const leaks = entries.filter((e) => clueLeaksAnswer(e.clue, e.answerNormalized));
      let result = buildGrid({
        entries,
        seed,
        size: "auto",
        nodeBudget: 25_000,
      });
      result = numberBuildResult(result);
      const report = validateBuildResult(result, entries);
      const msg = [
        `Placed ${result.placedEntryIds.length}/${entries.length} (${result.status}).`,
        report.ok ? "Grid checks passed." : `Validator: ${report.errors[0]?.message ?? "issues found"}.`,
        leaks.length ? `Clue leak warning on ${leaks.length} entr${leaks.length === 1 ? "y" : "ies"}.` : "",
        issues.length ? `Normalize notes: ${issues.length}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      dispatch({ type: "setBuild", result, entries, statusMessage: msg });
      setMobileTab("grid");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "setStatus", statusMessage: `Build failed: ${message}` });
      console.error(err);
    }
  }

  async function exportPdf(kind: "student" | "answers") {
    if (!state.result || !state.entries.length) return;
    if (validation && !validation.ok && kind === "student") {
      dispatch({
        type: "setStatus",
        statusMessage: "Grid has validation errors — you can still export a draft, but fix issues before sharing.",
      });
    }
    try {
      const { buildAnswerKeyPdf, buildStudentPdf } = await import("@acm/print-layout");
      const bytes =
        kind === "student"
          ? await buildStudentPdf({
              result: state.result,
              entries: state.entries,
              settings: {
                title: state.title,
                nameLinePreset,
                showNameDate: nameLinePreset !== "none",
                watermark: "crosswordmaker.app",
              },
            })
          : await buildAnswerKeyPdf({
              result: state.result,
              entries: state.entries,
              settings: {
                title: `${state.title} — Answer Key`,
                nameLinePreset: "none",
                showNameDate: false,
              },
            });
      downloadBlob(
        kind === "student" ? `${slugify(state.title)}.pdf` : `${slugify(state.title)}-answers.pdf`,
        bytes,
        "application/pdf",
      );
      dispatch({ type: "setStatus", statusMessage: `Downloaded ${kind} PDF.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "setStatus", statusMessage: `PDF export failed: ${message}` });
      console.error(err);
    }
  }

  function exportSvg(showAnswers: boolean) {
    if (!state.result) return;
    const svg = puzzleToSvg(state.result, { showAnswers, cellSize: 28 });
    downloadBlob(
      `${slugify(state.title)}${showAnswers ? "-answers" : ""}.svg`,
      new Blob([svg], { type: "image/svg+xml" }),
      "image/svg+xml",
    );
  }

  function apiUrl(path: string): string {
    const base = (import.meta.env.PUBLIC_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "";
    return `${base}${path}`;
  }

  async function createShareLink() {
    if (!state.result || !state.entries.length) return;
    setShareBusy(true);
    setShareUrl(null);
    try {
      const me = await apiFetch("/api/v1/auth/me");
      const meData = await me.json();
      if (!meData.authenticated) {
        dispatch({
          type: "setStatus",
          statusMessage: "Sign in to create a share link (share pages are noindex).",
        });
        window.location.href = "/login/";
        return;
      }
      const placed = new Set(state.result.placedEntryIds);
      const snapshot = {
        title: state.title,
        seed: state.result.seed,
        engineVersion: state.result.engineVersion,
        reviewState: "needs_review",
        size: state.result.size,
        grid: cellsToAscii(state.result.cells),
        placements: state.result.placements,
        entries: state.entries
          .filter((e) => placed.has(e.id))
          .map((e) => ({
            id: e.id,
            answerNormalized: e.answerNormalized,
            clue: e.clue,
            displayAnswer: e.displayAnswer,
          })),
      };
      const res = await apiFetch("/api/v1/shares", {
        method: "POST",
        body: JSON.stringify({
          title: state.title,
          allowCheck: true,
          allowReveal: false,
          snapshot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        dispatch({
          type: "setStatus",
          statusMessage: data?.error?.message ?? "Could not create share link.",
        });
        return;
      }
      const path = typeof data.path === "string" ? data.path : `/p/${data.token}/`;
      const absolute = `${window.location.origin}${path}`;
      setShareUrl(absolute);
      dispatch({
        type: "setStatus",
        statusMessage: `Share link ready (noindex): ${path}`,
      });
    } catch {
      dispatch({ type: "setStatus", statusMessage: "Share failed — is the API running?" });
    } finally {
      setShareBusy(false);
    }
  }

  async function createActivityPack() {
    if (!state.result || !state.entries.length) return;
    setPackBusy(true);
    setPackUrl(null);
    try {
      const me = await apiFetch("/api/v1/auth/me");
      const meData = await me.json();
      if (!meData.authenticated) {
        dispatch({
          type: "setStatus",
          statusMessage: "Sign in to create an Activity Pack (A/B/C layouts).",
        });
        window.location.href = "/login/";
        return;
      }
      const placed = new Set(state.result.placedEntryIds);
      const entries = state.entries
        .filter((e) => placed.has(e.id))
        .map((e) => ({
          id: e.id,
          answerNormalized: e.answerNormalized,
          clue: e.clue,
          displayAnswer: e.displayAnswer,
        }));
      if (entries.length < 3) {
        dispatch({
          type: "setStatus",
          statusMessage: "Need at least 3 placed words to create an activity pack.",
        });
        return;
      }
      const res = await apiFetch("/api/v1/packs", {
        method: "POST",
        body: JSON.stringify({
          title: state.title || "Classroom pack",
          baseSeed: state.result.seed,
          entries,
          reviewState: "needs_review",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        dispatch({
          type: "setStatus",
          statusMessage: data?.error?.message ?? "Could not create activity pack.",
        });
        return;
      }
      const path = typeof data.path === "string" ? data.path : `/app/packs/${data.packId}/`;
      setPackUrl(`${window.location.origin}${path}`);
      dispatch({
        type: "setStatus",
        statusMessage: `Activity pack ready with ${data.variants?.length ?? 0} layout versions.`,
      });
    } catch {
      dispatch({ type: "setStatus", statusMessage: "Pack create failed — is the API running?" });
    } finally {
      setPackBusy(false);
    }
  }

  function buildFromRows(rows: EntryRow[], titleHint?: string) {
    try {
      dispatch({ type: "setStatus", statusMessage: "Building grid…" });
      const cleaned = rows.filter((r) => r.answer.trim());
      const { entries, issues } = normalizeEntries(
        cleaned.map((r, i) => ({
          id: `local-${i + 1}`,
          answerRaw: r.answer,
          clue: r.clue,
          origin: "topic_ai" as const,
          reviewState: "needs_review" as const,
        })),
      );
      if (entries.length < 2) {
        dispatch({
          type: "setStatus",
          statusMessage: `Need at least 2 valid A–Z answers. Got ${entries.length} valid.`,
        });
        return;
      }
      let result = buildGrid({
        entries,
        seed: state.seed,
        size: "auto",
        nodeBudget: 25_000,
      });
      result = numberBuildResult(result);
      const report = validateBuildResult(result, entries);
      const msg = [
        titleHint ? `${titleHint} ` : "",
        `Placed ${result.placedEntryIds.length}/${entries.length} (${result.status}).`,
        report.ok ? "Grid checks passed." : `Validator: ${report.errors[0]?.message ?? "issues found"}.`,
        "Clues need review before you treat them as final.",
        issues.length ? `Normalize notes: ${issues.length}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      dispatch({ type: "setBuild", result, entries, statusMessage: msg });
      setMobileTab("grid");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "setStatus", statusMessage: `Build failed: ${message}` });
    }
  }

  function currentSnapshot() {
    if (!state.result || !state.entries.length) return null;
    const placed = new Set(state.result.placedEntryIds);
    return {
      title: state.title,
      seed: state.result.seed,
      engineVersion: state.result.engineVersion,
      reviewState: "needs_review",
      size: state.result.size,
      grid: cellsToAscii(state.result.cells),
      placements: state.result.placements,
      entries: state.entries
        .filter((e) => placed.has(e.id))
        .map((e) => ({
          id: e.id,
          answerNormalized: e.answerNormalized,
          clue: e.clue,
          displayAnswer: e.displayAnswer,
        })),
    };
  }

  async function loadCloudProject(projectId: string) {
    if (!projectId) return;
    setCloudLoadBusy(true);
    try {
      const res = await apiFetch(`/api/v1/projects/${projectId}`);
      const data = await res.json();
      if (!res.ok || !data.headVersion?.snapshot) {
        dispatch({
          type: "setStatus",
          statusMessage: data?.error?.message ?? "Could not load cloud puzzle.",
        });
        return;
      }
      const hydrated = hydrateFromSnapshot(data.headVersion.snapshot as CloudSnapshot);
      setCloudProjectId(projectId);
      setCloudVersionId(data.headVersion.id);
      setCloudRevision(data.revision ?? 1);
      setCloudPath(`/app/puzzles/${projectId}/edit/`);
      pushHistory(hydrated.rows);
      dispatch({
        type: "hydrate",
        payload: {
          mode: "manual",
          title: hydrated.title,
          seed: hydrated.seed,
          rows: hydrated.rows,
        },
      });
      dispatch({
        type: "setBuild",
        result: hydrated.result,
        entries: hydrated.entries,
        statusMessage: `Loaded “${hydrated.title}” from cloud. Edit, then Save new cloud version.`,
      });
      setMobileTab("grid");
    } catch {
      dispatch({ type: "setStatus", statusMessage: "Cloud load failed — is the API running?" });
    } finally {
      setCloudLoadBusy(false);
    }
  }

  async function saveToCloud() {
    const snapshot = currentSnapshot();
    if (!snapshot) return;
    setCloudBusy(true);
    try {
      const me = await apiFetch("/api/v1/auth/me");
      const meData = await me.json();
      if (!meData.authenticated) {
        setSignedIn(false);
        dispatch({
          type: "setStatus",
          statusMessage: "Sign in to save a cloud puzzle — local draft still autosaves here.",
        });
        const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
        window.location.href = `/login/?next=${next}`;
        return;
      }
      setSignedIn(true);

      if (cloudProjectId && cloudRevision != null) {
        const res = await apiFetch(`/api/v1/projects/${cloudProjectId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: state.title,
            expectedRevision: cloudRevision,
            snapshot,
          }),
        });
        const data = await res.json();
        if (res.status === 409) {
          dispatch({
            type: "setStatus",
            statusMessage: `Conflict (server revision ${data?.currentRevision ?? "?"}). Reload from cloud and retry.`,
          });
          return;
        }
        if (!res.ok) {
          dispatch({
            type: "setStatus",
            statusMessage: data?.error?.message ?? "Cloud version save failed.",
          });
          return;
        }
        setCloudRevision(data.revision);
        if (data.versionId) setCloudVersionId(data.versionId);
        const path = `/app/puzzles/${cloudProjectId}/edit/`;
        setCloudPath(path);
        dispatch({
          type: "setStatus",
          statusMessage: `Saved new cloud version (revision ${data.revision}).`,
        });
        return;
      }

      const res = await apiFetch("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({ title: state.title, snapshot }),
      });
      const data = await res.json();
      if (!res.ok) {
        dispatch({
          type: "setStatus",
          statusMessage: data?.error?.message ?? "Cloud save failed.",
        });
        return;
      }
      const path = typeof data.path === "string" ? data.path : `/app/puzzles/${data.id}/edit/`;
      setCloudProjectId(data.id);
      setCloudRevision(data.revision ?? 1);
      setCloudVersionId(data.versionId ?? null);
      setCloudPath(path);
      const url = new URL(window.location.href);
      url.searchParams.set("project", data.id);
      window.history.replaceState({}, "", url.toString());
      dispatch({
        type: "setStatus",
        statusMessage: `Saved to cloud (revision ${data.revision ?? 1}).`,
      });
    } catch {
      dispatch({ type: "setStatus", statusMessage: "Cloud save failed — is the API running?" });
    } finally {
      setCloudBusy(false);
    }
  }

  function normalizeAnswerKey(answer: string): string {
    return answer.trim().toUpperCase().replace(/[^A-Z]/g, "");
  }

  async function runClueAi(targets: "empty" | number) {
    dispatch({ type: "setAiBlocked", reason: null });
    const rowsNeedingClues =
      typeof targets === "number"
        ? state.rows
            .map((row, index) => ({ row, index }))
            .filter(({ row, index }) => index === targets && normalizeAnswerKey(row.answer).length >= 3)
        : state.rows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => normalizeAnswerKey(row.answer).length >= 3 && !row.clue.trim());

    if (!rowsNeedingClues.length) {
      dispatch({
        type: "setStatus",
        statusMessage:
          typeof targets === "number"
            ? "Enter a valid answer (3+ letters) before generating a clue."
            : "No empty clues to fill — every answered row already has a clue.",
      });
      return;
    }

    if (turnstileConfigured() && !turnstileToken) {
      dispatch({
        type: "setStatus",
        statusMessage: "Complete the bot check before generating clues with AI.",
      });
      return;
    }

    const answers = rowsNeedingClues.map(({ row }) => normalizeAnswerKey(row.answer));
    setClueAiBusyIndex(typeof targets === "number" ? targets : "all");
    dispatch({
      type: "setStatus",
      statusMessage:
        typeof targets === "number"
          ? `Generating AI clue for ${answers[0]}…`
          : `Generating AI clues for ${answers.length} entr${answers.length === 1 ? "y" : "ies"}…`,
    });

    try {
      const res = await fetch(apiUrl("/api/v1/ai/clues"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers,
          difficulty: state.difficulty,
          topic: state.topic.trim() || state.title.trim() || undefined,
          audience: "general",
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const body = await res.json().catch(() => null);

      if (res.status === 403 && String(body?.error?.code || "").startsWith("turnstile")) {
        setTurnstileToken(null);
        dispatch({
          type: "setAiBlocked",
          reason: body?.error?.message || "Bot check failed. Refresh the check and retry.",
        });
        dispatch({ type: "setStatus", statusMessage: "Bot check required for AI clues." });
        return;
      }

      if (res.status === 404 || res.status === 501 || res.status === 503) {
        dispatch({
          type: "setAiBlocked",
          reason:
            body?.error?.message ||
            "AI clue generation is not connected yet. Enter clues manually.",
        });
        dispatch({
          type: "setStatus",
          statusMessage: "AI clues unavailable — type clues manually for now.",
        });
        return;
      }

      if (res.status === 429) {
        const exhausted = body?.quota as {
          remaining?: number | null;
          limit?: number | null;
          unlimited?: boolean;
          isPro?: boolean;
        } | undefined;
        if (!(exhausted?.unlimited || exhausted?.isPro)) {
          setQuota({
            remaining: 0,
            limit: typeof exhausted?.limit === "number" ? exhausted.limit : quota?.limit ?? 3,
            unlimited: false,
            isPro: false,
          });
        }
        dispatch({
          type: "setAiBlocked",
          reason: body?.error?.message || CLUE_QUOTA_BLOCKED,
        });
        dispatch({
          type: "setStatus",
          statusMessage: CLUE_QUOTA_STATUS,
        });
        return;
      }

      if (!res.ok) {
        throw new Error(body?.error?.message || `AI clue request failed (${res.status})`);
      }

      const data = body as {
        clues?: Array<{ answer: string; clue: string }>;
        quota?: {
          remaining?: number | null;
          limit?: number | null;
          unlimited?: boolean;
          isPro?: boolean;
        };
        mock?: boolean;
      };
      const clueMap = new Map(
        (data.clues ?? []).map((c) => [normalizeAnswerKey(c.answer), c.clue.trim()] as const),
      );
      if (!clueMap.size) {
        throw new Error("AI returned no clues.");
      }

      if (data.quota?.unlimited || data.quota?.isPro) {
        setQuota((prev) => ({
          remaining: prev?.remaining ?? null,
          limit: prev?.limit ?? null,
          unlimited: true,
          isPro: true,
        }));
      } else if (
        data.quota &&
        typeof data.quota.remaining === "number" &&
        typeof data.quota.limit === "number"
      ) {
        setQuota({
          remaining: data.quota.remaining,
          limit: data.quota.limit,
          unlimited: false,
          isPro: false,
        });
      }

      let applied = 0;
      const nextRows = state.rows.map((row, index) => {
        const shouldFill =
          typeof targets === "number"
            ? index === targets
            : Boolean(normalizeAnswerKey(row.answer) && !row.clue.trim());
        if (!shouldFill) return row;
        const clue = clueMap.get(normalizeAnswerKey(row.answer));
        if (!clue) return row;
        applied += 1;
        return { ...row, clue };
      });

      if (!applied) {
        throw new Error("AI clues did not match any entries.");
      }

      pushHistory(nextRows);
      const mockNote = data.mock ? " (mock)" : "";
      const quotaNote =
        data.quota?.unlimited || data.quota?.isPro
          ? CLUE_QUOTA_PRO_NOTE
          : data.quota &&
              typeof data.quota.remaining === "number" &&
              typeof data.quota.limit === "number"
            ? CLUE_QUOTA_REMAINING(data.quota.remaining, data.quota.limit)
            : "";
      dispatch({
        type: "setStatus",
        statusMessage: `Filled ${applied} AI clue${applied === 1 ? "" : "s"}${mockNote}. Review before printing.${quotaNote}`,
      });
    } catch (err) {
      dispatch({
        type: "setAiBlocked",
        reason: err instanceof Error ? err.message : "AI clue request failed",
      });
      dispatch({
        type: "setStatus",
        statusMessage: "AI clue generation failed — you can still type clues manually.",
      });
    } finally {
      setClueAiBusyIndex(null);
    }
  }

  async function runTopicAi() {
    dispatch({ type: "setAiBlocked", reason: null });
    if (turnstileConfigured() && !turnstileToken) {
      dispatch({
        type: "setStatus",
        statusMessage: "Complete the bot check before generating with AI.",
      });
      return;
    }
    dispatch({ type: "setStatus", statusMessage: "Requesting AI Topic demo…" });
    setAiLoading(true);
    try {
      const res = await fetch(apiUrl("/api/v1/ai/topic"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: state.topic,
          wordCount: state.wordCount,
          difficulty: state.difficulty,
          audience: "general",
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const body = await res.json().catch(() => null);

      if (res.status === 403 && String(body?.error?.code || "").startsWith("turnstile")) {
        setTurnstileToken(null);
        dispatch({
          type: "setAiBlocked",
          reason: body?.error?.message || "Bot check failed. Refresh the check and retry.",
        });
        dispatch({ type: "setStatus", statusMessage: "Bot check required for AI Topic." });
        return;
      }

      if (res.status === 404 || res.status === 501 || res.status === 503) {
        dispatch({
          type: "setAiBlocked",
          reason:
            body?.error?.message ||
            "AI API is not connected in this environment yet. Use Words + clues / sample list, or open Examples.",
        });
        dispatch({
          type: "setStatus",
          statusMessage: "AI Topic unavailable — use Load sample words, manual entries, or Examples.",
        });
        return;
      }

      if (res.status === 429) {
        const exhausted = body?.quota as { remaining?: number; limit?: number } | undefined;
        setQuota({
          remaining: 0,
          limit:
            typeof exhausted?.limit === "number"
              ? exhausted.limit
              : typeof quota?.limit === "number"
                ? quota.limit
                : 3,
          unlimited: quota?.unlimited,
          isPro: quota?.isPro,
        });
        dispatch({
          type: "setAiBlocked",
          reason:
            body?.error?.message ||
            "Daily free AI demo limit reached. Upgrade for more Topic generations, or keep editing manually.",
        });
        dispatch({
          type: "setStatus",
          statusMessage: "AI quota exhausted for today — Build grid / Examples still work. See Pricing for Pro.",
        });
        return;
      }

      if (!res.ok) {
        throw new Error(body?.error?.message || `AI request failed (${res.status})`);
      }

      const data = body as {
        title?: string;
        entries: Array<{ answer: string; clue: string }>;
        quota?: { remaining: number; limit: number };
        mock?: boolean;
      };
      if (!data?.entries?.length) {
        throw new Error("AI returned no entries.");
      }

      if (data.quota) {
        setQuota((prev) => ({
          remaining: data.quota!.remaining,
          limit: data.quota!.limit,
          unlimited: prev?.unlimited,
          isPro: prev?.isPro,
        }));
      }
      pushHistory(data.entries);
      if (data.title) dispatch({ type: "setTitle", title: data.title });
      // Stay on Topic path mentally: keep editing in place, then jump to grid preview.
      dispatch({ type: "setMode", mode: "manual" });
      const quotaNote =
        data.quota != null
          ? ` Demo remaining today: ${data.quota.remaining}/${data.quota.limit}.`
          : "";
      const mockNote = data.mock ? " (mock payload)" : "";
      dispatch({
        type: "setStatus",
        statusMessage: `AI suggestions loaded${mockNote}.${quotaNote} Building preview grid…`,
      });
      // First-visit demo: generate + preview without an extra click.
      buildFromRows(data.entries, "AI preview ready — edit clues, then print or Save to cloud.");
      setMobileTab("grid");
    } catch (err) {
      dispatch({
        type: "setAiBlocked",
        reason: err instanceof Error ? err.message : "AI request failed",
      });
      dispatch({
        type: "setStatus",
        statusMessage: "AI Topic failed. You can still build manually from a word list or open Examples.",
      });
    } finally {
      setAiLoading(false);
    }
  }

  const across = state.result?.placements.filter((p) => p.direction === "across") ?? [];
  const down = state.result?.placements.filter((p) => p.direction === "down") ?? [];
  const entryMap = new Map(state.entries.map((e) => [e.id, e]));
  const emptyClueCount = state.rows.filter((r) => r.answer.trim() && !r.clue.trim()).length;
  const cluesUnlimited = Boolean(quota?.unlimited || quota?.isPro);
  const freeAiExhausted =
    !cluesUnlimited &&
    quota != null &&
    typeof quota.remaining === "number" &&
    quota.remaining <= 0;
  const topicAiExhausted =
    quota != null && typeof quota.remaining === "number" && quota.remaining <= 0;
  const duplicateAnswers = (() => {
    const counts = new Map<string, number>();
    for (const row of state.rows) {
      const key = row.answer.trim().toUpperCase().replace(/[^A-Z]/g, "");
      if (key.length < 3) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  })();
  const placedCount = state.result?.placedEntryIds.length ?? 0;
  const totalForResult = state.result ? state.entries.length : 0;

  return (
    <section
      id="maker"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "12px",
        background: "rgba(255,255,255,0.82)",
        boxShadow: "var(--shadow-soft)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          padding: "1rem 1.1rem",
          borderBottom: "1px solid var(--color-border)",
          background:
            "linear-gradient(90deg, rgba(47,92,143,0.08), rgba(255,255,255,0) 55%)",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.35rem" }}>{heading}</h2>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.92rem" }}>
            Program builds the grid. AI only suggests words and clues when enabled.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {validation?.ok ? <StatusPill label="Grid checks passed" tone="ok" /> : null}
          {validation && !validation.ok ? <StatusPill label="Clues / grid need review" tone="warn" /> : null}
          {quota?.unlimited || quota?.isPro ? (
            <StatusPill label="Pro · unlimited clues" tone="ok" />
          ) : quota && typeof quota.remaining === "number" && typeof quota.limit === "number" ? (
            <StatusPill
              label={
                quota.remaining > 0
                  ? `Free AI ${quota.remaining}/${quota.limit} today`
                  : `Free AI used up · Pro unlimited`
              }
              tone={quota.remaining > 0 ? "neutral" : "warn"}
            />
          ) : null}
          <StatusPill
            label={signedIn ? "Signed in · cloud ready" : "Local draft autosave"}
            tone="neutral"
          />
        </div>
      </div>

      {showModeTabs ? (
        <div
          role="tablist"
          aria-label="Input mode"
          style={{
            display: "flex",
            gap: "0.35rem",
            flexWrap: "wrap",
            padding: "0.75rem 1.1rem",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={state.mode === m.id}
              onClick={() => dispatch({ type: "setMode", mode: m.id })}
              style={{
                border: "1px solid var(--color-border)",
                background: state.mode === m.id ? "var(--color-primary)" : "#fff",
                color: state.mode === m.id ? "#fff" : "var(--color-ink)",
                borderRadius: "999px",
                padding: "0.35rem 0.8rem",
                fontWeight: 650,
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="maker-mobile-tabs" style={{ display: "none", gap: "0.35rem", padding: "0.75rem 1.1rem" }}>
        {(["input", "clues", "grid", "export"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMobileTab(t)}
            style={{
              flex: 1,
              border: "1px solid var(--color-border)",
              background: mobileTab === t ? "var(--color-primary)" : "#fff",
              color: mobileTab === t ? "#fff" : "var(--color-ink)",
              borderRadius: "var(--radius-md)",
              padding: "0.45rem",
              fontWeight: 650,
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div
        className="maker-workspace"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1.05fr) minmax(280px, 0.95fr)",
          gap: 0,
          minHeight: 520,
        }}
      >
        <div
          className="maker-pane-input"
          data-active={mobileTab === "input" || mobileTab === "clues"}
          style={{ padding: "1rem 1.1rem", borderRight: "1px solid var(--color-border)" }}
        >
          <label style={{ display: "grid", gap: "0.35rem", marginBottom: "0.85rem" }}>
            <span style={{ fontWeight: 650 }}>Title</span>
            <input
              value={state.title}
              onChange={(e) => dispatch({ type: "setTitle", title: e.target.value })}
              style={inputStyle}
            />
          </label>

          {state.mode === "topic" ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
                1) Type a classroom topic → 2) Generate with AI → 3) Edit clues &amp; print. Grid layout never spends AI credits.
              </p>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ fontWeight: 650 }}>Topic</span>
                <input
                  value={state.topic}
                  onChange={(e) => dispatch({ type: "setTopic", topic: e.target.value })}
                  placeholder="e.g. Solar System for grade 5"
                  style={inputStyle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && state.topic.trim() && !aiLoading) {
                      e.preventDefault();
                      void runTopicAi();
                    }
                  }}
                />
              </label>
              <div
                role="group"
                aria-label="Quick classroom topics"
                style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}
              >
                {TOPIC_QUICK_PICKS.map((topic) => {
                  const active = state.topic === topic;
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => {
                        dispatch({ type: "setTopic", topic });
                        dispatch({
                          type: "setStatus",
                          statusMessage: `Topic set to “${topic}”. Press Generate with AI (or Enter).`,
                        });
                      }}
                      style={{
                        border: "1px solid var(--color-border)",
                        background: active ? "rgba(47,92,143,0.12)" : "#fff",
                        color: "var(--color-ink)",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.28rem 0.55rem",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      {topic.replace(/ for (grade|ESL).*$/i, "").replace(/ geography$/i, "")}
                    </button>
                  );
                })}
              </div>
              <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                Prefer a ready printable?
                {" "}
                <a href="/examples/electricity/">Electricity</a>
                {" · "}
                <a href="/examples/westward-expansion/">Westward Expansion</a>
                {" · "}
                <a href="/examples/">All examples</a>
                {" · "}
                <a href="/blog/how-to-make-a-geography-vocabulary-crossword/">Geography how-to</a>
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 650 }}>Words</span>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={state.wordCount}
                    onChange={(e) => dispatch({ type: "setWordCount", wordCount: Number(e.target.value) })}
                    style={{ ...inputStyle, width: 90 }}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 650 }}>Difficulty</span>
                  <select
                    value={state.difficulty}
                    onChange={(e) =>
                      dispatch({
                        type: "setDifficulty",
                        difficulty: e.target.value as State["difficulty"],
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
              </div>
              <TurnstileField onToken={setTurnstileToken} action="ai-topic" />
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <Button
                  onClick={() => void runTopicAi()}
                  disabled={
                    !state.topic.trim() ||
                    aiLoading ||
                    topicAiExhausted ||
                    (turnstileConfigured() && !turnstileToken)
                  }
                >
                  {aiLoading
                    ? "Generating…"
                    : topicAiExhausted
                      ? "Daily AI limit reached"
                      : "Generate with AI"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    pushHistory(SAMPLE_MANUAL_ENTRIES);
                    dispatch({ type: "setMode", mode: "manual" });
                    dispatch({ type: "setTitle", title: "Solar System (Sample)" });
                    dispatch({
                      type: "setStatus",
                      statusMessage: "Loaded sample words — click Build grid (no AI).",
                    });
                  }}
                >
                  Load sample words
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const slug =
                      EXAMPLE_SEED_SLUGS[Math.floor(Math.random() * EXAMPLE_SEED_SLUGS.length)] ??
                      "force-and-motion";
                    const ex = getExample(slug);
                    if (!ex) return;
                    pushHistory(ex.entries.map((e) => ({ answer: e.answer, clue: e.clue })));
                    dispatch({ type: "setMode", mode: "manual" });
                    dispatch({ type: "setTitle", title: `${ex.title} (Example seed)` });
                    dispatch({ type: "setTopic", topic: ex.topic });
                    dispatch({
                      type: "setStatus",
                      statusMessage: `Loaded “${ex.title}” example seed — edit clues, then Build grid (no AI).`,
                    });
                  }}
                >
                  Load example seed
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    dispatch({ type: "setMode", mode: "manual" });
                    dispatch({
                      type: "setStatus",
                      statusMessage: "Switched to manual Words + clues — no AI required.",
                    });
                  }}
                >
                  Use manual instead
                </Button>
              </div>
              {state.aiBlockedReason ? (
                <div
                  role="alert"
                  style={{
                    margin: 0,
                    padding: "0.7rem 0.85rem",
                    borderRadius: 8,
                    border: "1px solid #e6d4a8",
                    background: "#fff8e8",
                    color: "var(--color-warn)",
                    fontSize: "0.92rem",
                  }}
                >
                  <div>{state.aiBlockedReason}</div>
                  <div style={{ marginTop: "0.35rem" }}>
                    <a href="/pricing/">Upgrade to Pro — unlimited clues</a>
                    {" · "}
                    <a href="/examples/">Browse examples</a>
                    {" · "}
                    <a href="/crossword-maker-from-word-list/">Word list maker</a>
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                  {quota?.unlimited || quota?.isPro
                    ? "Pro: Generate clues is unlimited. Topic demo may still use the free daily pool."
                    : quota &&
                        typeof quota.remaining === "number" &&
                        typeof quota.limit === "number"
                      ? quota.remaining > 0
                        ? `Free plan: ${quota.remaining} of ${quota.limit} AI ops left today (includes Generate clues). Upgrade to Pro for unlimited clues. Layout reshuffles stay free.`
                        : "Free Generate clues is used up for today. Upgrade to Pro for unlimited AI clues — or type clues yourself. Layout reshuffles stay free."
                      : "Free plan includes a daily AI limit. Upgrade to Pro for unlimited Generate clues. Layout never spends AI credits."}
                </p>
              )}
            </div>
          ) : null}

          {state.mode === "paste" || state.mode === "import" ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
                Paste a spelling or vocabulary list, then Parse into editor. Layout never spends AI credits.
                {" "}
                <a href="/blog/how-to-make-a-crossword-from-a-word-list/">Word-list how-to</a>
              </p>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span style={{ fontWeight: 650 }}>
                  {state.mode === "import" ? "CSV / TSV / TXT paste" : "Paste answers"}
                </span>
                <textarea
                  value={state.pasteText}
                  onChange={(e) => dispatch({ type: "setPaste", pasteText: e.target.value })}
                  rows={8}
                  placeholder={"MARS | The red planet\nEARTH\tOur home planet\nVENUS"}
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)", resize: "vertical" }}
                />
              </label>
              <Button onClick={applyPaste}>Parse into editor</Button>
              <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                Supports one answer per line, tab-separated columns, or <code>ANSWER | clue</code>. PDF import
                confirmation lands in a later API pass — paste extracted text here for now.
              </p>
            </div>
          ) : null}

          {state.mode === "words" || state.mode === "manual" || state.mode === "topic" ? (
            <div style={{ marginTop: state.mode === "topic" ? "1rem" : 0 }}>
              {state.mode === "words" || state.mode === "manual" ? (
                <div style={{ display: "grid", gap: "0.55rem", marginBottom: "0.85rem" }}>
                  <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
                    {state.mode === "words" ? (
                      <>
                        Keep your answers. Add clues manually (or leave blank for later).{" "}
                        <a href="/blog/how-to-make-a-crossword-from-a-word-list/">
                          How to make a crossword from a word list
                        </a>
                      </>
                    ) : (
                      <>
                        Manual Words + clues — layout never spends AI credits.{" "}
                        <a href="/examples/">Browse printable examples</a>
                        {" · "}
                        <a href="/vs/">Compare makers</a>
                      </>
                    )}
                  </p>
                  <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        pushHistory([...TEACHER_CLASSROOM_ENTRIES]);
                        dispatch({ type: "setTitle", title: "Classroom Objects (Sample)" });
                        dispatch({
                          type: "setStatus",
                          statusMessage: "Loaded classroom sample — edit clues, then Build grid (no AI).",
                        });
                      }}
                    >
                      Load classroom sample
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        pushHistory([...SAMPLE_MANUAL_ENTRIES]);
                        dispatch({ type: "setTitle", title: "Solar System (Sample)" });
                        dispatch({
                          type: "setStatus",
                          statusMessage: "Loaded solar sample — click Build grid (no AI).",
                        });
                      }}
                    >
                      Load solar sample
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        const slug =
                          EXAMPLE_SEED_SLUGS[Math.floor(Math.random() * EXAMPLE_SEED_SLUGS.length)] ??
                          "force-and-motion";
                        const ex = getExample(slug);
                        if (!ex) return;
                        pushHistory(ex.entries.map((e) => ({ answer: e.answer, clue: e.clue })));
                        dispatch({ type: "setTitle", title: `${ex.title} (Example seed)` });
                        dispatch({
                          type: "setStatus",
                          statusMessage: `Loaded “${ex.title}” example seed — edit, then Build grid.`,
                        });
                      }}
                    >
                      Load example seed
                    </Button>
                    {state.mode === "words" ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          dispatch({ type: "setMode", mode: "paste" });
                          dispatch({
                            type: "setStatus",
                            statusMessage: "Paste mode — one answer per line, then Parse into editor.",
                          });
                        }}
                      >
                        Paste a list
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                <strong>Entries{state.rows.length ? ` (${state.rows.length})` : ""}</strong>
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  <Button variant="ghost" onClick={undo} disabled={!history.length}>
                    Undo
                  </Button>
                  <Button variant="ghost" onClick={redo} disabled={!future.length}>
                    Redo
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={addEntryRow}
                    disabled={Boolean(aiLoading) || clueAiBusyIndex != null}
                  >
                    Add row
                  </Button>
                  {state.rows.some((r) => r.answer.trim().replace(/[^A-Za-z]/g, "").length >= 3) ? (
                    <Button
                      variant="secondary"
                      onClick={() => void runClueAi("empty")}
                      disabled={
                        emptyClueCount === 0 ||
                        Boolean(aiLoading) ||
                        clueAiBusyIndex != null ||
                        (turnstileConfigured() && !turnstileToken) ||
                        freeAiExhausted
                      }
                      title={
                        emptyClueCount === 0
                          ? "All answers already have clues"
                          : freeAiExhausted
                            ? "Free daily limit reached — upgrade to Pro for unlimited clues"
                            : cluesUnlimited
                              ? "Fill empty clues with AI (Pro · unlimited)"
                              : "Fill empty clues with AI (free daily limit; Pro is unlimited)"
                      }
                    >
                      {clueAiBusyIndex === "all" ? "Generating clues…" : "Generate clues"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {state.mode !== "topic" &&
              turnstileConfigured() &&
              state.rows.some((r) => r.answer.trim().replace(/[^A-Za-z]/g, "").length >= 3) ? (
                <div style={{ marginBottom: "0.65rem" }}>
                  <TurnstileField onToken={setTurnstileToken} action="ai-topic" />
                </div>
              ) : null}
              {state.mode === "topic" && state.rows.length === 0 ? (
                <p className="muted" style={{ margin: "0 0 0.65rem", fontSize: "0.9rem" }}>
                  Entries appear here after Generate with AI — or Add row to draft manually.
                </p>
              ) : null}
              {(state.mode === "words" || state.mode === "manual") && state.rows.length === 0 ? (
                <p className="muted" style={{ margin: "0 0 0.65rem", fontSize: "0.9rem" }}>
                  {state.mode === "words"
                    ? "Add rows, load a sample, or Paste a list — then Build grid. No AI required for layout."
                    : "Add rows or Load example seed — then Build grid. No AI required for layout."}
                </p>
              ) : null}
              {duplicateAnswers.length ? (
                <p
                  role="status"
                  style={{
                    margin: "0 0 0.55rem",
                    fontSize: "0.88rem",
                    color: "var(--color-warn)",
                  }}
                >
                  Duplicate answers: {duplicateAnswers.join(", ")}. Keep one of each before you print.
                </p>
              ) : null}
              {emptyClueCount > 0 ? (
                <p className="muted" style={{ margin: "0 0 0.55rem", fontSize: "0.88rem" }}>
                  {emptyClueCount} entr{emptyClueCount === 1 ? "y needs" : "ies need"} a clue — highlighted
                  below.{" "}
                  {freeAiExhausted ? (
                    <>
                      Free Generate clues is used up today —{" "}
                      <a href="/pricing/">upgrade to Pro for unlimited clues</a>, or type them
                      manually.
                    </>
                  ) : (
                    <>
                      Use Generate clues / per-row AI
                      {cluesUnlimited ? " (Pro · unlimited)" : " (free daily limit)"}, or type
                      manually before handouts.
                    </>
                  )}
                </p>
              ) : null}
              <div
                ref={entriesListRef}
                style={{ display: "grid", gap: "0.45rem", maxHeight: 320, overflow: "auto" }}
              >
                {state.rows.map((row, index) => {
                  const normalized = row.answer.trim().toUpperCase().replace(/[^A-Z]/g, "");
                  const isDup = normalized.length >= 3 && duplicateAnswers.includes(normalized);
                  const needsClue = Boolean(row.answer.trim() && !row.clue.trim());
                  const canAiClue = normalized.length >= 3;
                  const rowAiBusy = clueAiBusyIndex === index;
                  return (
                    <div
                      key={index}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "0.85fr 1.15fr auto auto",
                        gap: "0.35rem",
                        alignItems: "center",
                      }}
                    >
                      <input
                        aria-label={`Answer ${index + 1}`}
                        value={row.answer}
                        onChange={(e) =>
                          pushHistory(
                            state.rows.map((r, i) =>
                              i === index ? { ...r, answer: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="ANSWER"
                        style={{
                          ...inputStyle,
                          borderColor: isDup ? "var(--color-warn)" : undefined,
                          background: isDup ? "#fff8e8" : undefined,
                        }}
                      />
                      <input
                        aria-label={`Clue ${index + 1}`}
                        value={row.clue}
                        onChange={(e) =>
                          pushHistory(
                            state.rows.map((r, i) =>
                              i === index ? { ...r, clue: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder={
                          state.mode === "words" ? "Clue (optional — AI can fill)" : "Clue"
                        }
                        style={{
                          ...inputStyle,
                          borderColor: needsClue ? "#c4a574" : undefined,
                          background: needsClue ? "#fffaf0" : undefined,
                        }}
                      />
                      <Button
                        variant="ghost"
                        aria-label={`Generate AI clue for row ${index + 1}`}
                        title="Generate AI clue"
                        disabled={
                          !canAiClue ||
                          Boolean(aiLoading) ||
                          clueAiBusyIndex != null ||
                          (turnstileConfigured() && !turnstileToken) ||
                          freeAiExhausted
                        }
                        onClick={() => void runClueAi(index)}
                        style={{ padding: "0.45rem 0.55rem", minWidth: 44 }}
                      >
                        {rowAiBusy ? "…" : "AI"}
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Remove row ${index + 1}`}
                        onClick={() => pushHistory(state.rows.filter((_, i) => i !== index))}
                      >
                        ×
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: "0.9rem" }}>
                Seed
              </span>
              <input
                type="number"
                value={state.seed}
                onChange={(e) => dispatch({ type: "setSeed", seed: Number(e.target.value) })}
                style={{ ...inputStyle, width: 88 }}
              />
            </label>
            <Button onClick={() => runBuild()}>Build grid</Button>
            <Button
              variant="secondary"
              onClick={() => {
                // Pass next seed explicitly — setTimeout(runBuild) would rebuild with a stale
                // closure seed, so the first Shuffle after Build looked like a no-op.
                const nextSeed = state.seed + 1;
                dispatch({ type: "setSeed", seed: nextSeed });
                runBuild(nextSeed);
              }}
            >
              Shuffle layout
            </Button>
          </div>
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.92rem" }} aria-live="polite">
            {state.statusMessage}
          </p>
        </div>

        <div
          className="maker-pane-grid"
          data-active={mobileTab === "grid" || mobileTab === "export"}
          style={{ padding: "1rem 1.1rem", background: "rgba(245,247,250,0.65)" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
              <strong>Grid & print preview</strong>
              {state.result ? (
                <StatusPill
                  label={`Placed ${placedCount}/${totalForResult}`}
                  tone={
                    placedCount === totalForResult && totalForResult > 0
                      ? "ok"
                      : placedCount > 0
                        ? "warn"
                        : "neutral"
                  }
                />
              ) : null}
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", fontSize: "0.9rem" }}>
                <span className="muted">Name line</span>
                <select
                  value={nameLinePreset}
                  onChange={(e) => setNameLinePreset(e.target.value as NameLinePresetId)}
                  aria-label="Student PDF name line preset"
                  style={{ ...inputStyle, width: "auto", minWidth: 160 }}
                >
                  {NAME_LINE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="secondary" disabled={!state.result} onClick={() => void exportPdf("student")}>
                Export PDF
              </Button>
              <Button variant="secondary" disabled={!state.result} onClick={() => void exportPdf("answers")}>
                Answer key PDF
              </Button>
              <Button variant="ghost" disabled={!state.result} onClick={() => exportSvg(false)}>
                SVG
              </Button>
              <Button
                variant="secondary"
                disabled={!state.result || shareBusy}
                onClick={() => void createShareLink()}
              >
                {shareBusy ? "Sharing…" : "Share play link"}
              </Button>
              <Button
                variant="secondary"
                disabled={!state.result || packBusy}
                onClick={() => void createActivityPack()}
              >
                {packBusy ? "Creating pack…" : "Activity pack (A/B/C)"}
              </Button>
              <Button
                variant="secondary"
                disabled={!state.result || cloudBusy}
                onClick={() => void saveToCloud()}
              >
                {cloudBusy
                  ? "Saving…"
                  : !signedIn
                    ? "Sign in to save"
                    : cloudProjectId
                      ? "Save new cloud version"
                      : "Save to cloud"}
              </Button>
            </div>
          </div>
          {signedIn && cloudProjects.length > 0 ? (
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: "0.75rem",
              }}
            >
              <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", flex: "1 1 220px" }}>
                <span className="muted" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>
                  Load cloud
                </span>
                <select
                  value={loadProjectId}
                  onChange={(e) => setLoadProjectId(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                  aria-label="Load cloud puzzle"
                >
                  <option value="">Select a saved puzzle…</option>
                  {cloudProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (rev {p.revision})
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                disabled={!loadProjectId || cloudLoadBusy}
                onClick={() => void loadCloudProject(loadProjectId)}
              >
                {cloudLoadBusy ? "Loading…" : "Load"}
              </Button>
              <a href="/app/" style={{ fontSize: "0.9rem" }}>
                My puzzles
              </a>
            </div>
          ) : signedIn ? (
            <p className="muted" style={{ margin: "0.65rem 0 0", fontSize: "0.9rem" }}>
              No cloud puzzles yet — Save to cloud after you build a grid.{" "}
              <a href="/app/">Open library</a>
            </p>
          ) : (
            <p className="muted" style={{ margin: "0.65rem 0 0", fontSize: "0.9rem" }}>
              Local drafts autosave in this browser. <a href="/login/?next=/app/">Sign in</a> to
              save/load cloud puzzles across devices.
            </p>
          )}
          {shareUrl ? (
            <p style={{ margin: "0.65rem 0 0", fontSize: "0.92rem" }}>
              Share (noindex): <a href={shareUrl}>{shareUrl}</a>
            </p>
          ) : null}
          {packUrl ? (
            <p style={{ margin: "0.65rem 0 0", fontSize: "0.92rem" }}>
              Pack: <a href={packUrl}>{packUrl}</a>
            </p>
          ) : null}
          {cloudPath ? (
            <p style={{ margin: "0.65rem 0 0", fontSize: "0.92rem" }}>
              Cloud puzzle: <a href={cloudPath}>{cloudPath}</a>
              {cloudRevision != null ? ` · revision ${cloudRevision}` : ""}
              {cloudVersionId ? ` · version ${cloudVersionId.slice(0, 8)}…` : ""}
            </p>
          ) : null}

          <div style={{ marginTop: "0.85rem" }}>
            <GridView
              result={state.result}
              selectedEntryId={state.selectedEntryId}
              onSelectEntry={(id) => dispatch({ type: "selectEntry", id })}
              emptyHint={
                state.mode === "topic" && !state.rows.length
                  ? "Pick a topic chip (or type one), Generate with AI, then preview here — or Load sample words."
                  : state.mode === "words" && !state.rows.length
                    ? "Load a classroom sample or Paste a list, then Build grid — layout never spends AI credits."
                    : state.rows.some((r) => r.answer.trim())
                      ? "Click Build grid to place your entries. Shuffle layout is free and never spends AI credits."
                      : "Add answers and clues, then Build grid — or switch to Topic (AI) for a free demo."
              }
            />
          </div>
          {state.result && emptyClueCount > 0 ? (
            <p
              role="status"
              style={{
                margin: "0.75rem 0 0",
                fontSize: "0.9rem",
                color: "var(--color-warn)",
              }}
            >
              Preview is ready, but {emptyClueCount} clue
              {emptyClueCount === 1 ? " is" : "s are"} still empty — edit before printing for class.
            </p>
          ) : null}

          {state.result ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                marginTop: "1rem",
              }}
            >
              <ClueColumn
                title="Across"
                items={across}
                entryMap={entryMap}
                selectedEntryId={state.selectedEntryId}
                onSelect={(id) => dispatch({ type: "selectEntry", id })}
              />
              <ClueColumn
                title="Down"
                items={down}
                entryMap={entryMap}
                selectedEntryId={state.selectedEntryId}
                onSelect={(id) => dispatch({ type: "selectEntry", id })}
              />
            </div>
          ) : null}

          {state.result?.unplacedEntryIds.length ? (
            <p className="muted" style={{ marginTop: "0.85rem", fontSize: "0.9rem" }}>
              Unplaced:{" "}
              {state.result.unplacedEntryIds
                .map((id) => entryMap.get(id)?.answerNormalized)
                .filter(Boolean)
                .join(", ")}
              . Expand grid size, edit the list, or accept this subset as a new version later.
            </p>
          ) : null}
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .maker-mobile-tabs { display: flex !important; }
          .maker-workspace { grid-template-columns: 1fr !important; }
          .maker-pane-input, .maker-pane-grid { border-right: none !important; }
          .maker-pane-input { display: none; }
          .maker-pane-grid { display: none; }
          .maker-pane-input[data-active="true"],
          .maker-pane-grid[data-active="true"] { display: block !important; }
        }
      `}</style>
    </section>
  );
}

function ClueColumn({
  title,
  items,
  entryMap,
  selectedEntryId,
  onSelect,
}: {
  title: string;
  items: BuildResult["placements"];
  entryMap: Map<string, WordEntry>;
  selectedEntryId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h3 style={{ margin: "0 0 0.4rem", fontSize: "1rem", color: "var(--color-primary)" }}>{title}</h3>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.35rem" }}>
        {items
          .slice()
          .sort((a, b) => a.number - b.number)
          .map((p) => {
            const e = entryMap.get(p.entryId);
            const active = p.entryId === selectedEntryId;
            return (
              <li key={`${p.entryId}-${p.direction}`}>
                <button
                  type="button"
                  onClick={() => onSelect(p.entryId)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "1px solid var(--color-border)",
                    background: active ? "#DCE8F5" : "#fff",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.4rem 0.55rem",
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    fontSize: "0.9rem",
                  }}
                >
                  <strong>{p.number}.</strong> {e?.clue || "(no clue)"}{" "}
                  <span className="muted">({e?.answerNormalized.length})</span>
                </button>
              </li>
            );
          })}
      </ol>
    </div>
  );
}

const inputStyle: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "0.5rem 0.65rem",
  fontFamily: "var(--font-body)",
  fontSize: "0.95rem",
  background: "#fff",
  color: "var(--color-ink)",
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "crossword";
}
