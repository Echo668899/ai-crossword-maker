import { useEffect, useState } from "react";
import { Button } from "@acm/ui";
import { apiFetch } from "../../lib/api";

type PackRow = {
  id: string;
  title: string;
  project_id: string;
  base_seed: number;
  max_variants: number;
  item_count: number;
  updated_at: string;
};

type Access = {
  canCreatePack: boolean;
  maxPacks: number;
  maxVariants: number;
  canBatchExport: boolean;
  reason?: string;
};

export default function PackLibrary() {
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [access, setAccess] = useState<Access | null>(null);
  const [status, setStatus] = useState("Loading packs…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiFetch("/api/v1/auth/me");
        const meData = await me.json();
        if (cancelled) return;
        if (!meData.authenticated) {
          setStatus("Sign in to manage activity packs.");
          return;
        }
        const res = await apiFetch("/api/v1/packs");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus(data?.error?.message ?? "Could not load packs.");
          return;
        }
        setPacks(data.packs ?? []);
        setAccess(data.access ?? null);
        setStatus((data.packs?.length ?? 0) === 0 ? "No activity packs yet." : "");
      } catch {
        if (!cancelled) setStatus("API unreachable. Start the Worker on :8787.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {access && !access.canCreatePack ? (
        <p className="muted">
          {access.reason}{" "}
          <a href="/pricing/">View pricing</a>.
        </p>
      ) : null}
      {status ? <p className="muted">{status}</p> : null}
      {packs.length ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.65rem" }}>
          {packs.map((p) => (
            <li
              key={p.id}
              style={{
                padding: "0.85rem 1rem",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                background: "#fff",
              }}
            >
              <a href={`/app/packs/${p.id}/`} style={{ fontWeight: 700 }}>
                {p.title}
              </a>
              <div className="muted" style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
                {p.item_count} version{p.item_count === 1 ? "" : "s"} · updated{" "}
                {new Date(p.updated_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Button variant="secondary" onClick={() => (window.location.href = "/app/new/")}>
          Build in maker
        </Button>
        <a href="/app/">Back to library</a>
      </div>
    </div>
  );
}
