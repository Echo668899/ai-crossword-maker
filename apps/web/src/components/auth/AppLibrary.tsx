import { useEffect, useState } from "react";
import { Button } from "@acm/ui";
import { apiFetch } from "../../lib/api";

type User = { id: string; email: string | null; name: string | null };
type Project = { id: string; title: string; updated_at: string };

export default function AppLibrary() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState("Checking session…");

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
        const res = await apiFetch("/api/v1/projects");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus(data?.error?.message ?? "Could not load projects.");
          return;
        }
        setProjects(data.projects ?? []);
        setStatus(
          (data.projects?.length ?? 0) === 0
            ? "No cloud projects yet — share from the maker."
            : "",
        );
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
        <ul>
          {projects.map((p) => (
            <li key={p.id}>
              {p.title}{" "}
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                updated {new Date(p.updated_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p>
        <a href="/app/new/">Open full maker</a> · <a href="/">Home maker</a>
        {user ? (
          <>
            {" "}
            · <a href="/app/billing/">Billing</a>
          </>
        ) : null}
      </p>
    </div>
  );
}
