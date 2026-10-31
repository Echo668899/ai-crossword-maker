import { useEffect, useState } from "react";
import { Button } from "@acm/ui";
import { apiFetch } from "../../lib/api";

type PackItem = {
  id: string;
  label: string;
  seed: number;
  versionId: string;
  title: string;
  size: { rows: number; cols: number };
  placementCount: number;
  reviewState: string;
};

function packIdFromPath(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  // /app/packs/:id/
  const idx = parts.indexOf("packs");
  const id = idx >= 0 ? parts[idx + 1] : "";
  return id && id !== "_" ? id : "";
}

export default function PackApp({ initialPackId = "" }: { initialPackId?: string }) {
  const [packId, setPackId] = useState(initialPackId);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<PackItem[]>([]);
  const [status, setStatus] = useState("Loading pack…");
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = initialPackId || packIdFromPath();
    setPackId(id);
    if (!id) {
      setStatus("Missing pack id in URL.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/v1/packs/${id}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus(data?.error?.message ?? "Could not load pack.");
          return;
        }
        setTitle(data.pack?.title ?? "Activity pack");
        setItems(data.items ?? []);
        setStatus("");
      } catch {
        if (!cancelled) setStatus("API unreachable. Start the Worker on :8787.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPackId]);

  async function runExport() {
    if (!packId) return;
    setBusy(true);
    setExportJson(null);
    try {
      const res = await apiFetch(`/api/v1/packs/${packId}/export`, {
        method: "POST",
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error?.message ?? "Export failed.");
        return;
      }
      setExportJson(JSON.stringify(data.manifest, null, 2));
      setStatus(`Export manifest ready (job ${data.jobId}).`);
    } catch {
      setStatus("Export failed — is the API running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <nav className="muted" style={{ fontSize: "0.9rem" }}>
        <a href="/app/">My puzzles</a> / <a href="/app/packs/">Packs</a> / {title || "Pack"}
      </nav>
      <h1 style={{ margin: 0 }}>{title || "Activity pack"}</h1>
      {status ? <p className="muted">{status}</p> : null}
      {items.length ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.65rem" }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                padding: "0.85rem 1rem",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                background: "#fff",
              }}
            >
              <strong>Version {item.label}</strong>
              <div className="muted" style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
                {item.placementCount} words · {item.size.rows}×{item.size.cols} · seed {item.seed} ·{" "}
                {item.reviewState}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Button variant="secondary" disabled={!packId || busy} onClick={() => void runExport()}>
          {busy ? "Exporting…" : "Batch export manifest"}
        </Button>
        <a href="/pricing/">Entitlements</a>
      </div>
      {exportJson ? (
        <pre
          style={{
            margin: 0,
            padding: "0.85rem 1rem",
            overflow: "auto",
            maxHeight: 360,
            background: "#F5F7FA",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: "0.82rem",
          }}
        >
          {exportJson}
        </pre>
      ) : null}
    </div>
  );
}
