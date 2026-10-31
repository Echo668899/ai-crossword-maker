import { useEffect, useState } from "react";
import { Button } from "@acm/ui";
import { apiFetch } from "../../lib/api";

type VersionRow = {
  id: string;
  parent_version_id: string | null;
  seed: number | null;
  engine_version: string | null;
  review_state: string;
  created_at: string;
};

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
  const [headVersionId, setHeadVersionId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading puzzle…");
  const [meta, setMeta] = useState("");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [maxVersions, setMaxVersions] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(id: string) {
    setBusy(true);
    try {
      const [projRes, verRes] = await Promise.all([
        apiFetch(`/api/v1/projects/${id}`),
        apiFetch(`/api/v1/projects/${id}/versions`),
      ]);
      const data = await projRes.json();
      const verData = await verRes.json();
      if (!projRes.ok) {
        setStatus(data?.error?.message ?? "Could not load puzzle.");
        return;
      }
      setTitle(data.title ?? "Puzzle");
      setRevision(data.revision ?? 1);
      setHeadVersionId(data.headVersion?.id ?? null);
      const snap = data.headVersion?.snapshot;
      setMeta(
        snap
          ? `${snap.placements?.length ?? 0} words · ${snap.size?.rows}×${snap.size?.cols} · seed ${snap.seed}`
          : "No versions yet",
      );
      if (verRes.ok) {
        setVersions(verData.versions ?? []);
        setMaxVersions(verData.maxVersions ?? null);
      }
      setStatus("");
    } catch {
      setStatus("API unreachable. Start the Worker on :8787.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const id = initialId || projectIdFromPath();
    setProjectId(id);
    if (!id) {
      setStatus("Missing puzzle id.");
      return;
    }
    void load(id);
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

  const makerHref = projectId
    ? `/app/new/?project=${encodeURIComponent(projectId)}${
        headVersionId ? `&version=${encodeURIComponent(headVersionId)}` : ""
      }`
    : "/app/new/";

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
        <Button variant="ghost" disabled={!projectId || busy} onClick={() => void load(projectId)}>
          Reload
        </Button>
        <a href={makerHref}>Open in maker</a>
        <a href="/app/new/">Create new puzzle</a>
      </div>

      <section>
        <h2 style={{ fontSize: "1.1rem", margin: "0.5rem 0" }}>
          Version history
          {maxVersions != null ? (
            <span className="muted" style={{ fontWeight: 400, fontSize: "0.9rem" }}>
              {" "}
              (plan cap {maxVersions})
            </span>
          ) : null}
        </h2>
        {versions.length === 0 ? (
          <p className="muted">No immutable versions yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem" }}>
            {versions.map((v) => {
              const isHead = v.id === headVersionId;
              const openHref = `/app/new/?project=${encodeURIComponent(projectId)}&version=${encodeURIComponent(v.id)}`;
              return (
                <li
                  key={v.id}
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    borderBottom: "1px solid var(--border, #d5dbe3)",
                    paddingBottom: "0.4rem",
                  }}
                >
                  <code style={{ fontSize: "0.85rem" }}>{v.id.slice(0, 8)}…</code>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {v.created_at}
                    {v.seed != null ? ` · seed ${v.seed}` : ""}
                    {` · ${v.review_state}`}
                    {isHead ? " · head" : ""}
                  </span>
                  <a href={openHref}>Load in maker</a>
                </li>
              );
            })}
          </ul>
        )}
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          Loading a version hydrates the maker grid from the immutable snapshot (no silent overwrite).
          Saving from the maker creates a new version with optimistic <code>expectedRevision</code>.
        </p>
      </section>
    </div>
  );
}
