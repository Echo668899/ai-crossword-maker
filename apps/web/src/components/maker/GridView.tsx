import type { BuildResult } from "@acm/crossword-engine";

export function GridView({
  result,
  selectedEntryId,
  onSelectEntry,
  showAnswers = false,
}: {
  result: BuildResult | null;
  selectedEntryId?: string | null;
  onSelectEntry?: (entryId: string) => void;
  showAnswers?: boolean;
}) {
  if (!result || result.placedEntryIds.length === 0) {
    return (
      <div
        style={{
          border: "1px dashed var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "2rem",
          textAlign: "center",
          color: "var(--color-muted)",
          background: "rgba(255,255,255,0.7)",
        }}
      >
        Build a grid to preview the puzzle here.
      </div>
    );
  }

  const numberAt = new Map<string, number>();
  const entryAt = new Map<string, string>();
  for (const p of result.placements) {
    if (p.number) numberAt.set(`${p.row},${p.col}`, p.number);
    const dr = p.direction === "down" ? 1 : 0;
    const dc = p.direction === "across" ? 1 : 0;
    for (let i = 0; i < p.length; i++) {
      entryAt.set(`${p.row + dr * i},${p.col + dc * i}`, p.entryId);
    }
  }

  const cellPx = Math.min(28, Math.floor(360 / Math.max(result.size.cols, result.size.rows)));

  return (
    <div
      role="grid"
      aria-label="Crossword grid preview"
      style={{
        display: "inline-grid",
        gridTemplateColumns: `repeat(${result.size.cols}, ${cellPx}px)`,
        gridTemplateRows: `repeat(${result.size.rows}, ${cellPx}px)`,
        border: "2px solid var(--color-ink)",
        background: "var(--color-ink)",
        gap: 1,
        maxWidth: "100%",
        overflow: "auto",
      }}
    >
      {result.cells.map((row, r) =>
        row.map((cell, c) => {
          const key = `${r},${c}`;
          const entryId = entryAt.get(key);
          const selected = entryId && entryId === selectedEntryId;
          if (!cell.letter) {
            return <div key={key} role="gridcell" style={{ background: "var(--color-ink)" }} />;
          }
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              aria-label={`Row ${r + 1} column ${c + 1}${numberAt.has(key) ? `, number ${numberAt.get(key)}` : ""}`}
              onClick={() => entryId && onSelectEntry?.(entryId)}
              style={{
                position: "relative",
                width: cellPx,
                height: cellPx,
                border: "none",
                margin: 0,
                padding: 0,
                background: selected ? "#DCE8F5" : "#fff",
                cursor: entryId ? "pointer" : "default",
                fontFamily: "var(--font-body)",
              }}
            >
              {numberAt.has(key) ? (
                <span
                  style={{
                    position: "absolute",
                    top: 1,
                    left: 2,
                    fontSize: Math.max(8, cellPx * 0.28),
                    lineHeight: 1,
                    color: "var(--color-ink)",
                  }}
                >
                  {numberAt.get(key)}
                </span>
              ) : null}
              {showAnswers ? (
                <span style={{ fontWeight: 700, fontSize: cellPx * 0.45 }}>{cell.letter}</span>
              ) : null}
            </button>
          );
        }),
      )}
    </div>
  );
}
