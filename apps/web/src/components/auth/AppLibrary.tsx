import { useEffect, useState } from "react";
import { Button } from "@acm/ui";
import { apiFetch } from "../../lib/api";

type User = { id: string; email: string | null; name: string | null };
type Project = {
  id: string;
  title: string;
  revision: number;
  updated_at: string;
  path?: string;
  archived?: boolean;
};

export default function AppLibrary() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState("Checking session…");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadProjects() {
    const res = await apiFetch("/api/v1/projects");
    const data = await res.json();
    if (!res.ok) {
      setStatus(data?.error?.message ?? "Could not load projects.");
      return;
    }
    setProjects(data.projects ?? []);
    setStatus(
      (data.projects?.length ?? 0) === 0
        ? "No cloud projects yet — use Save to cloud in the maker."
        : "",
    );
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await apiFetch("/api/v1/auth/me");
        const meData = await me.json();
        if (cancelled) return;
        if (!meData.authenticated) {
          setUser(null);
          setStatus("Sign in to sync cloud puzzles. Local drafts still autosave in this browser.");
          return;
        }
        setUser(meData.user);
        setStatus("Loading projects…");
        await loadProjects();
      } catch {
        if (!cancelled) setStatus("API unreachable. Start the Worker on :8787.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await apiFetch("/api/v1/auth/logout", { method: "POST", body: "{}" });
    window.location.href = "/";
  }

  async function archiveProject(p: Project) {
    setBusyId(p.id);
    try {
      const res = await apiFetch(`/api/v1/projects/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: true, expectedRevision: p.revision }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setStatus(
          data?.error?.message ??
            `Conflict on “${p.title}” (revision ${data?.currentRevision ?? "?"}). Reloading…`,
        );
        await loadProjects();
        return;
      }
      if (!res.ok) {
        setStatus(data?.error?.message ?? "Archive failed.");
        return;
      }
      await loadProjects();
    } catch {
      setStatus("Archive failed — is the API running?");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {user ? (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <span>
            Signed in as <strong>{user.email ?? user.name ?? user.id}</strong>
          </span>
          <Button variant="ghost" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      ) : (
        <p>
          <a href="/login/">Sign in</a> to create share links and list cloud projects.
        </p>
      )}
      {status ? <p className="muted">{status}</p> : null}
      {projects.length ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.65rem" }}>
          {projects.map((p) => (
            <li
              key={p.id}
              style={{
                display: "flex",
                gap: "0.75rem",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.75rem 0.9rem",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                background: "#fff",
              }}
            >
              <div>
                <a href={p.path ?? `/app/puzzles/${p.id}/edit/`}>
                  <strong>{p.title}</strong>
                </a>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  rev {p.revision} · updated {new Date(p.updated_at).toLocaleString()}
                </div>
              </div>
              <Button
                variant="ghost"
                disabled={busyId === p.id}
                onClick={() => void archiveProject(p)}
              >
                {busyId === p.id ? "Archiving…" : "Archive"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <p>
        <a href="/app/new/">Open full maker</a> · <a href="/">Home maker</a>
        {user ? (
          <>
            {" "}
            · <a href="/app/packs/">Activity packs</a> · <a href="/app/billing/">Billing</a>
          </>
        ) : null}
      </p>
    </div>
  );
}
