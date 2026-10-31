import { useEffect, useState } from "react";
import { Button } from "@acm/ui";
import { apiFetch } from "../../lib/api";

function projectIdFromPath(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("puzzles");
  const id = idx >= 0 ? parts[idx + 1] : "";
  return id && id !== "_" ? id : "";
}

export default function PuzzleEditor({ initialId = "" }: { initialId?: string }) {
  const [projectId, setProjectId] = useState(initialId);
  const [title, setTitle] = useState("");
  const [revision, setRevision] = useState(1);
  const [status, setStatus] = useState("Loading puzzle…");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = initialId || projectIdFromPath();
    setProjectId(id);
    if (!id) {
      setStatus("Missing puzzle id.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/v1/projects/${id}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus(data?.error?.message ?? "Could not load puzzle.");
          return;
        }
        setTitle(data.title ?? "Puzzle");
        setRevision(data.revision ?? 1);
        const snap = data.headVersion?.snapshot;
        setMeta(
          snap
            ? `${snap.placements?.length ?? 0} words · ${snap.size?.rows}×${snap.size?.cols} · seed ${snap.seed}`
            : "No versions yet",
        );
        setStatus("");
      } catch {
        if (!cancelled) setStatus("API unreachable. Start the Worker on :8787.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialId]);

  async function rename() {
    if (!projectId) return;
    const next = window.prompt("New title", title);
    if (!next?.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: next.trim(), expectedRevision: revision }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setStatus(
          `Conflict (server revision ${data?.currentRevision ?? "?"}). Reload the page and retry.`,
        );
        return;
      }
      if (!res.ok) {
        setStatus(data?.error?.message ?? "Rename failed.");
        return;
      }
      setTitle(data.title);
      setRevision(data.revision);
      setStatus("Title updated.");
    } catch {
      setStatus("Rename failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <nav className="muted" style={{ fontSize: "0.9rem" }}>
        <a href="/app/">My puzzles</a> / {title || "Puzzle"}
      </nav>
      <h1 style={{ margin: 0 }}>{title || "Cloud puzzle"}</h1>
      {status ? <p className="muted">{status}</p> : null}
      {meta ? <p className="muted">{meta} · revision {revision}</p> : null}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Button variant="secondary" disabled={!projectId || busy} onClick={() => void rename()}>
          Rename
        </Button>
        <a href="/app/new/">Open maker to create a new version</a>
      </div>
      <p className="muted" style={{ fontSize: "0.9rem" }}>
        Version history and in-maker reload land next; conflict-safe PATCH is live (
        <code>expectedRevision</code> → 409).
      </p>
    </div>
  );
}
