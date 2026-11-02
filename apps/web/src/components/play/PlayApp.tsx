import { useEffect, useMemo, useState } from "react";
import { Button, ContentEnter } from "@acm/ui";
import { PlayPageSkeleton } from "../ui/AsyncSkeletons";
import { apiFetch } from "../../lib/api";
import { playCellPx, playLetterFontPx, playNumberFontPx } from "../../lib/play-grid";

type PlayCell = { row: number; col: number; isBlock: boolean; number?: number };
type PlayClue = {
  entryId: string;
  number: number;
  direction: "across" | "down";
  clue: string;
  length: number;
  row: number;
  col: number;
};

type PlayPayload = {
  token: string;
  title: string;
  size: { rows: number; cols: number };
  cells: PlayCell[][];
  clues: PlayClue[];
  allowCheck: boolean;
  allowReveal: boolean;
  expiresAt: string | null;
};

export type LocalPlayDemo = {
  payload: PlayPayload;
  solutionGrid: string[];
};

function tokenFromLocation(fallback = ""): string {
  if (typeof window === "undefined") return fallback;
  const m = window.location.pathname.match(/\/p\/([^/]+)/);
  const raw = m?.[1] ? decodeURIComponent(m[1]) : fallback;
  return raw === "_" ? "" : raw;
}

function keyOf(r: number, c: number) {
  return `${r},${c}`;
}

function countFillable(cells: PlayCell[][]): number {
  let n = 0;
  for (const row of cells) {
    for (const cell of row) {
      if (!cell.isBlock) n += 1;
    }
  }
  return n;
}

function lettersMatchSolution(
  letters: Record<string, string>,
  cells: PlayCell[][],
  solutionGrid: string[],
): boolean {
  for (let r = 0; r < cells.length; r++) {
    const row = cells[r]!;
    const line = solutionGrid[r] ?? "";
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      if (cell.isBlock) continue;
      const expected = (line[c] ?? "").toUpperCase();
      if (!expected || expected === "#") continue;
      if ((letters[keyOf(r, c)] ?? "") !== expected) return false;
    }
  }
  return true;
}

export default function PlayApp({
  initialToken = "",
  localDemo,
}: {
  initialToken?: string;
  localDemo?: LocalPlayDemo;
}) {
  const isLocal = Boolean(localDemo);
  const [token, setToken] = useState(localDemo?.payload.token ?? initialToken);
  const [payload, setPayload] = useState<PlayPayload | null>(localDemo?.payload ?? null);
  const [solutionGrid, setSolutionGrid] = useState<string[] | null>(localDemo?.solutionGrid ?? null);
  const [error, setError] = useState<string | null>(null);
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Record<string, boolean | undefined>>({});
  const [active, setActive] = useState<{ row: number; col: number } | null>(null);
  const [direction, setDirection] = useState<"across" | "down">("across");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1280);

  useEffect(() => {
    const read = () => setViewportWidth(window.innerWidth);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  useEffect(() => {
    if (localDemo) {
      setToken(localDemo.payload.token);
      setPayload(localDemo.payload);
      setSolutionGrid(localDemo.solutionGrid);
      return;
    }
    setToken(tokenFromLocation(initialToken));
  }, [initialToken, localDemo]);

  useEffect(() => {
    if (localDemo) {
      const storageKey = `acm-play:${localDemo.payload.token}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          setLetters(JSON.parse(saved) as Record<string, string>);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (!token) {
      setError("Missing share token in the URL.");
      return;
    }
    let cancelled = false;
    setError(null);
    setPayload(null);
    void apiFetch(`/api/v1/play/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error?.message ?? "Puzzle not found.");
          return;
        }
        setPayload(data as PlayPayload);
        const saved = localStorage.getItem(`acm-play:${token}`);
        if (saved) {
          try {
            setLetters(JSON.parse(saved) as Record<string, string>);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load puzzle. Is the API running?");
      });
    return () => {
      cancelled = true;
    };
  }, [token, localDemo]);

  useEffect(() => {
    if (!token) return;
    const handle = window.setTimeout(() => {
      localStorage.setItem(`acm-play:${token}`, JSON.stringify(letters));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [letters, token]);

  const fillableCount = useMemo(
    () => (payload ? countFillable(payload.cells) : 0),
    [payload],
  );
  const filledCount = useMemo(() => Object.keys(letters).filter((k) => letters[k]).length, [letters]);

  const solved = useMemo(() => {
    if (!payload) return false;
    if (solutionGrid) {
      return filledCount === fillableCount && lettersMatchSolution(letters, payload.cells, solutionGrid);
    }
    if (fillableCount === 0 || filledCount < fillableCount) return false;
    let correct = 0;
    for (const cellRow of payload.cells) {
      for (const cell of cellRow) {
        if (cell.isBlock) continue;
        if (marks[keyOf(cell.row, cell.col)] === true) correct += 1;
      }
    }
    return correct === fillableCount;
  }, [payload, solutionGrid, letters, filledCount, fillableCount, marks]);

  const activeClue = useMemo(() => {
    if (!payload || !active) return null;
    const candidates = payload.clues.filter((c) => {
      if (c.direction !== direction) return false;
      if (direction === "across") {
        return c.row === active.row && active.col >= c.col && active.col < c.col + c.length;
      }
      return c.col === active.col && active.row >= c.row && active.row < c.row + c.length;
    });
    return candidates[0] ?? null;
  }, [payload, active, direction]);

  function move(row: number, col: number, dir: "across" | "down", delta: number) {
    if (!payload) return;
    let r = row;
    let c = col;
    for (let i = 0; i < 64; i++) {
      if (dir === "across") c += delta;
      else r += delta;
      const cell = payload.cells[r]?.[c];
      if (!cell || cell.isBlock) return;
      setActive({ row: r, col: c });
      return;
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (!payload || !active) return;
    const { row, col } = active;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setDirection("across");
      move(row, col, "across", 1);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setDirection("across");
      move(row, col, "across", -1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDirection("down");
      move(row, col, "down", 1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setDirection("down");
      move(row, col, "down", -1);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const list = payload.clues.filter((c) => c.direction === direction);
      if (!list.length) return;
      const idx = Math.max(
        0,
        list.findIndex((c) => c.entryId === activeClue?.entryId),
      );
      const next = list[(idx + (e.shiftKey ? -1 : 1) + list.length) % list.length]!;
      setActive({ row: next.row, col: next.col });
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      setLetters((prev) => {
        const next = { ...prev };
        delete next[keyOf(row, col)];
        return next;
      });
      setMarks((m) => ({ ...m, [keyOf(row, col)]: undefined }));
      if (e.key === "Backspace") move(row, col, direction, -1);
      return;
    }
    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      const letter = e.key.toUpperCase();
      setLetters((prev) => ({ ...prev, [keyOf(row, col)]: letter }));
      setMarks((m) => ({ ...m, [keyOf(row, col)]: undefined }));
      move(row, col, direction, 1);
    }
  }

  async function runCheck() {
    if (!payload || !payload.allowCheck) return;
    setBusy(true);
    try {
      const guesses = Object.entries(letters).map(([k, letter]) => {
        const [r, c] = k.split(",").map(Number);
        return { row: r!, col: c!, letter };
      });
      if (!guesses.length) {
        setError("Fill at least one letter before checking.");
        return;
      }

      if (solutionGrid) {
        const next: Record<string, boolean | undefined> = {};
        for (const g of guesses) {
          const expected = (solutionGrid[g.row]?.[g.col] ?? "").toUpperCase();
          next[keyOf(g.row, g.col)] = Boolean(expected && expected !== "#" && g.letter === expected);
        }
        setError(null);
        setMarks(next);
        return;
      }

      const res = await apiFetch(`/api/v1/play/${encodeURIComponent(payload.token)}/check`, {
        method: "POST",
        body: JSON.stringify({ guesses }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Check failed.");
        return;
      }
      setError(null);
      const next: Record<string, boolean | undefined> = {};
      for (const r of data.results as Array<{ row: number; col: number; correct: boolean }>) {
        next[keyOf(r.row, r.col)] = r.correct;
      }
      setMarks(next);
    } finally {
      setBusy(false);
    }
  }

  async function runReveal() {
    if (!payload || !payload.allowReveal) return;
    setBusy(true);
    try {
      if (solutionGrid) {
        const next: Record<string, string> = {};
        for (let r = 0; r < solutionGrid.length; r++) {
          const line = solutionGrid[r] ?? "";
          for (let c = 0; c < line.length; c++) {
            const ch = line[c]!;
            if (ch !== "#") next[keyOf(r, c)] = ch.toUpperCase();
          }
        }
        setLetters(next);
        setMarks({});
        setError(null);
        return;
      }

      const res = await apiFetch(`/api/v1/play/${encodeURIComponent(payload.token)}/reveal`, {
        method: "POST",
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Reveal disabled.");
        return;
      }
      const grid = data.grid as string[];
      const next: Record<string, string> = {};
      for (let r = 0; r < grid.length; r++) {
        const line = grid[r] ?? "";
        for (let c = 0; c < line.length; c++) {
          const ch = line[c]!;
          if (ch !== "#") next[keyOf(r, c)] = ch;
        }
      }
      setLetters(next);
      setMarks({});
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setLetters({});
    setMarks({});
    setError(null);
    if (token) localStorage.removeItem(`acm-play:${token}`);
  }

  async function copyPageLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy link — copy from the address bar.");
    }
  }

  if (error && !payload) {
    return (
      <section className="container section" style={{ paddingTop: "1.5rem" }}>
        <h1>Shared crossword</h1>
        <p role="alert">{error}</p>
        <p>
          <a href="/">Make your own</a>
        </p>
      </section>
    );
  }

  if (!payload) {
    return <PlayPageSkeleton />;
  }

  const cellPx = playCellPx(payload.size.rows, payload.size.cols, viewportWidth);
  const letterPx = playLetterFontPx(cellPx);
  const numberPx = playNumberFontPx(cellPx);
  const across = payload.clues.filter((c) => c.direction === "across");
  const down = payload.clues.filter((c) => c.direction === "down");
  const modeLabel = isLocal ? "Sample play · not indexed" : "Shared play · not indexed";
  const backHref = isLocal
    ? `/examples/${payload.token.replace(/^example:/, "")}/`
    : "/";
  const backLabel = isLocal ? "Back to example" : "Make your own";

  return (
    <ContentEnter>
      <section className="container section" style={{ paddingTop: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            {modeLabel}
          </p>
          <h1 style={{ margin: "0.25rem 0 0" }}>{payload.title}</h1>
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
            {filledCount} / {fillableCount} filled
            {solved ? " · Solved!" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "start" }}>
          {payload.allowCheck ? (
            <Button onClick={() => void runCheck()} disabled={busy}>
              Check
            </Button>
          ) : null}
          {payload.allowReveal ? (
            <Button variant="secondary" onClick={() => void runReveal()} disabled={busy}>
              Reveal
            </Button>
          ) : null}
          <Button variant="ghost" onClick={reset}>
            Reset
          </Button>
          <Button variant="ghost" onClick={() => void copyPageLink()}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>

      {solved ? (
        <div
          role="status"
          style={{
            marginTop: "0.85rem",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            background: "rgba(40, 140, 80, 0.12)",
            border: "1px solid rgba(40, 140, 80, 0.35)",
          }}
        >
          <strong>Solved!</strong> Nice work.{" "}
          <a href={isLocal ? "/ai-crossword-maker/" : "/"}>{isLocal ? "Make your own with AI" : "Make another"}</a>
          {isLocal ? (
            <>
              {" · "}
              <a href={backHref}>{backLabel}</a>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: "var(--color-warn)" }}>
          {error}
        </p>
      ) : null}

      <div className="play-layout">
        <div
          role="grid"
          aria-label="Crossword puzzle"
          tabIndex={0}
          onKeyDown={onKey}
          className="play-grid"
          style={{
            gridTemplateColumns: `repeat(${payload.size.cols}, ${cellPx}px)`,
            gridTemplateRows: `repeat(${payload.size.rows}, ${cellPx}px)`,
          }}
        >
          {payload.cells.map((row, r) =>
            row.map((cell, c) => {
              if (cell.isBlock) {
                return <div key={keyOf(r, c)} role="gridcell" className="play-cell play-cell--block" />;
              }
              const k = keyOf(r, c);
              const selected = active?.row === r && active?.col === c;
              const inClue =
                activeClue &&
                ((activeClue.direction === "across" &&
                  r === activeClue.row &&
                  c >= activeClue.col &&
                  c < activeClue.col + activeClue.length) ||
                  (activeClue.direction === "down" &&
                    c === activeClue.col &&
                    r >= activeClue.row &&
                    r < activeClue.row + activeClue.length));
              const mark = marks[k];
              const stateClass = selected
                ? "is-selected"
                : inClue
                  ? "is-in-clue"
                  : mark === false
                    ? "is-wrong"
                    : mark === true
                      ? "is-right"
                      : "";
              return (
                <button
                  key={k}
                  type="button"
                  role="gridcell"
                  className={`play-cell ${stateClass}`.trim()}
                  aria-selected={selected}
                  aria-label={`Row ${r + 1} column ${c + 1}${cell.number ? `, clue ${cell.number}` : ""}`}
                  onClick={() => {
                    if (selected) {
                      setDirection((d) => (d === "across" ? "down" : "across"));
                    } else {
                      setActive({ row: r, col: c });
                    }
                  }}
                  style={{ width: cellPx, height: cellPx, fontSize: letterPx }}
                >
                  {cell.number ? (
                    <span className="play-cell-number" style={{ fontSize: numberPx }}>
                      {cell.number}
                    </span>
                  ) : null}
                  <span className="play-cell-letter">{letters[k] ?? ""}</span>
                </button>
              );
            }),
          )}
        </div>

        <div className="play-clues">
          {activeClue ? (
            <p className="play-clue-active">
              <strong>
                {activeClue.number} {activeClue.direction}
              </strong>{" "}
              {activeClue.clue}
            </p>
          ) : (
            <p className="muted play-clue-hint">
              Select a cell and type. Arrow keys change direction; Tab jumps clues.
            </p>
          )}
          <div className="play-clue-columns">
            <ClueList
              title="Across"
              clues={across}
              activeId={activeClue?.entryId}
              onSelect={(clue) => {
                setDirection("across");
                setActive({ row: clue.row, col: clue.col });
              }}
            />
            <ClueList
              title="Down"
              clues={down}
              activeId={activeClue?.entryId}
              onSelect={(clue) => {
                setDirection("down");
                setActive({ row: clue.row, col: clue.col });
              }}
            />
          </div>
          <p className="muted play-clue-footer">
            <a href={backHref}>{backLabel}</a>
            {isLocal ? (
              <>
                {" · "}
                <a href="/ai-crossword-maker/">Make a variant with AI</a>
              </>
            ) : null}
          </p>
        </div>
      </div>
      </section>
    </ContentEnter>
  );
}

function ClueList({
  title,
  clues,
  activeId,
  onSelect,
}: {
  title: string;
  clues: PlayClue[];
  activeId?: string;
  onSelect: (clue: PlayClue) => void;
}) {
  return (
    <div>
      <strong>{title}</strong>
      <ul className="play-clue-list">
        {clues.map((c) => (
          <li key={c.entryId}>
            <button
              type="button"
              className={`play-clue-item${c.entryId === activeId ? " is-active" : ""}`}
              onClick={() => onSelect(c)}
            >
              <span style={{ fontWeight: 650 }}>{c.number}.</span> {c.clue}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
