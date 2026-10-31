import { useEffect, useState } from "react";
import { Button } from "@acm/ui";
import { apiFetch } from "../../lib/api";

type Overview = {
  counts: Record<string, number>;
  runtime: Record<string, unknown>;
  flags: Array<{ key: string; value: string; updated_at: string; updated_by: string | null }>;
  note?: string;
};

type OrderRow = {
  id: string;
  sku: string;
  status: string;
  provider: string | null;
  amountCents: number | null;
  currency: string | null;
  createdAt: string;
  userEmail: string | null;
};

type JobRow = {
  id: string;
  type: string;
  status: string;
  stage: string | null;
  errorCode: string | null;
  createdAt: string;
};

type AuditRow = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  meta: unknown;
};

export default function AdminConsole() {
  const [status, setStatus] = useState("Checking admin access…");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const me = await apiFetch("/api/v1/admin/me");
      const meData = await me.json();
      if (me.status === 503) {
        setStatus(
          meData?.error?.message ??
            "Admin is unconfigured. Set ADMIN_EMAILS on the API Worker.",
        );
        return;
      }
      if (me.status === 401) {
        setStatus("Sign in required.");
        window.location.href = "/login/?next=/admin/";
        return;
      }
      if (me.status === 403) {
        setStatus("Forbidden — your account is not on ADMIN_EMAILS.");
        return;
      }
      if (!me.ok) {
        setStatus(meData?.error?.message ?? "Admin check failed.");
        return;
      }

      const [ov, ord, job, aud] = await Promise.all([
        apiFetch("/api/v1/admin/overview"),
        apiFetch("/api/v1/admin/orders"),
        apiFetch("/api/v1/admin/jobs"),
        apiFetch("/api/v1/admin/audit"),
      ]);
      const ovData = await ov.json();
      const ordData = await ord.json();
      const jobData = await job.json();
      const audData = await aud.json();
      if (!ov.ok) {
        setStatus(ovData?.error?.message ?? "Could not load overview.");
        return;
      }
      setOverview(ovData);
      setOrders(ordData.orders ?? []);
      setJobs(jobData.jobs ?? []);
      setAudit(audData.events ?? []);
      setStatus(`Signed in as ${meData.email}`);
    } catch {
      setStatus("API unreachable. Start the Worker on :8787.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function setFlag(key: Overview["flags"][number]["key"] | string, value: string) {
    setBusy(true);
    try {
      const res = await apiFetch("/api/v1/admin/flags", {
        method: "PATCH",
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error?.message ?? "Flag update failed.");
        return;
      }
      setStatus(`Updated ${key} → ${value}`);
      await load();
    } catch {
      setStatus("Flag update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: "0 0 0.35rem" }}>Admin</h1>
        <p className="muted" style={{ margin: 0 }}>
          Ops skeleton — aggregates and kill switches only. Raw puzzle content is never listed.
        </p>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          {status}
        </p>
        <Button variant="secondary" disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {overview ? (
        <>
          <section>
            <h2>Counts</h2>
            <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(11rem,1fr))", gap: "0.5rem", padding: 0, listStyle: "none" }}>
              {Object.entries(overview.counts).map(([k, v]) => (
                <li key={k} style={{ borderBottom: "1px solid var(--border, #d5dbe3)", padding: "0.35rem 0" }}>
                  <strong>{v}</strong>
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {k}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>Runtime</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", background: "rgba(0,0,0,0.04)", padding: "0.75rem" }}>
              {JSON.stringify(overview.runtime, null, 2)}
            </pre>
            {overview.note ? <p className="muted">{overview.note}</p> : null}
          </section>

          <section>
            <h2>Emergency flags</h2>
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Changes write <code>audit_logs</code>. Prefer <code>force_off</code> /{" "}
              <code>false</code> for incidents; price edits stay in code/config.
            </p>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.65rem" }}>
              {(overview.flags ?? []).map((f) => (
                <li key={f.key} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                  <code>{f.key}</code>
                  <span className="muted">= {f.value}</span>
                  {f.key === "ai_anon_demo_enabled" ? (
                    <>
                      <Button variant="ghost" disabled={busy} onClick={() => void setFlag(f.key, "true")}>
                        true
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => void setFlag(f.key, "false")}>
                        false
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" disabled={busy} onClick={() => void setFlag(f.key, "inherit")}>
                        inherit
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => void setFlag(f.key, "force_off")}>
                        force_off
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <section>
        <h2>Recent orders</h2>
        {orders.length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr>
                  <th align="left">Created</th>
                  <th align="left">SKU</th>
                  <th align="left">Status</th>
                  <th align="left">Provider</th>
                  <th align="left">User</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.createdAt}</td>
                    <td>{o.sku}</td>
                    <td>{o.status}</td>
                    <td>{o.provider}</td>
                    <td>{o.userEmail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Recent jobs</h2>
        {jobs.length === 0 ? (
          <p className="muted">No jobs yet.</p>
        ) : (
          <ul style={{ fontSize: "0.9rem" }}>
            {jobs.map((j) => (
              <li key={j.id}>
                <code>{j.type}</code> · {j.status}
                {j.errorCode ? ` · ${j.errorCode}` : ""} · {j.createdAt}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Audit</h2>
        {audit.length === 0 ? (
          <p className="muted">No admin audit events yet.</p>
        ) : (
          <ul style={{ fontSize: "0.9rem" }}>
            {audit.map((a) => (
              <li key={a.id}>
                {a.createdAt} · <code>{a.action}</code>
                {a.targetId ? ` · ${a.targetType}:${a.targetId}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
