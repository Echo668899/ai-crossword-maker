import { useEffect, useState } from "react";
import { Button, ContentEnter } from "@acm/ui";
import { apiFetch } from "../../lib/api";
import { PackDetailSkeleton } from "../ui/AsyncSkeletons";

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
  const idx = parts.indexOf("packs");
  const id = idx >= 0 ? parts[idx + 1] : "";
  return id && id !== "_" ? id : "";
}

export default function PackApp({ initialPackId = "" }: { initialPackId?: string }) {
  const [packId, setPackId] = useState(initialPackId);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<PackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading pack…");
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = initialPackId || packIdFromPath();
    setPackId(id);
    if (!id) {
      setStatus("Missing pack id in URL.");
      setLoading(false);
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
          setLoading(false);
          return;
        }
        setTitle(data.pack?.title ?? "Activity pack");
        setItems(data.items ?? []);
        setStatus("");
        setLoading(false);
      } catch {
        if (!cancelled) {
          setStatus("API unreachable. Start the Worker on :8787.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPackId]);

  async function pollJob(id: string) {
    for (let i = 0; i < 20; i++) {
      const res = await apiFetch(`/api/v1/jobs/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error?.message ?? "Could not poll export job.");
        return null;
      }
      if (data.status === "completed") return data;
      if (data.status === "failed") {
        setStatus(`Export failed (${data.errorCode ?? "error"}).`);
        return null;
      }
      setStatus(`Export ${data.status}${data.stage ? ` / ${data.stage}` : ""}…`);
      await new Promise((r) => setTimeout(r, 500));
    }
    setStatus("Export still running — refresh and check Jobs later.");
    return null;
  }

  async function runExport() {
    if (!packId) return;
    setBusy(true);
    setExportJson(null);
    setDownloadPath(null);
    setJobId(null);
    try {
      const res = await apiFetch(`/api/v1/packs/${packId}/export?sync=1`, {
        method: "POST",
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error?.message ?? "Export failed.");
        return;
      }
      setJobId(data.jobId ?? null);
      if (data.previewManifest || data.manifest) {
        setExportJson(JSON.stringify(data.previewManifest ?? data.manifest, null, 2));
      }
      if (data.status === "queued" && data.jobId) {
        const done = await pollJob(data.jobId);
        if (done?.downloadPath) {
          setDownloadPath(done.downloadPath);
          setStatus(`ZIP ready (${done.file?.byteSize ?? "?"} bytes).`);
        }
        return;
      }
      if (data.downloadPath) {
        setDownloadPath(data.downloadPath);
        setStatus(
          data.mode === "manifest_only"
            ? "Manifest ready (bind FILES for ZIP download)."
            : `ZIP ready${data.byteSize ? ` (${data.byteSize} bytes)` : ""}.`,
        );
        return;
      }
      setStatus(`Export ${data.status ?? "done"} (job ${data.jobId}).`);
    } catch {
      setStatus("Export failed — is the API running?");
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip() {
    if (!downloadPath) return;
    setBusy(true);
    try {
      const res = await apiFetch(downloadPath);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setStatus(data?.error?.message ?? "Download failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pack-export${jobId ? `-${jobId.slice(0, 8)}` : ""}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("ZIP downloaded.");
    } catch {
      setStatus("Download failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <PackDetailSkeleton />;
  }

  return (
    <ContentEnter>
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
            {busy ? "Exporting…" : "Batch export ZIP"}
          </Button>
          {downloadPath ? (
            <Button disabled={busy} onClick={() => void downloadZip()}>
              Download ZIP
            </Button>
          ) : null}
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
    </ContentEnter>
  );
}
