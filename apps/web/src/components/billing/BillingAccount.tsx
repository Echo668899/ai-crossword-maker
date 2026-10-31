import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type Entitlements = {
  planVersion: string;
  isPro: boolean;
  aiCreditsRemaining: number;
  unwatermarkedExport: boolean;
  batchExport: boolean;
  activityPack: boolean;
  subscription: {
    sku: string;
    status: string;
    provider: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

export default function BillingAccount() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [ents, setEnts] = useState<Entitlements | null>(null);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setMessage(
        "Thanks — payment received (or pending webhook confirmation). Entitlements update after the provider webhook.",
      );
    }
    let cancelled = false;
    (async () => {
      const me = await apiFetch("/api/v1/auth/me");
      const meJson = (await me.json()) as { authenticated?: boolean };
      if (cancelled) return;
      if (!meJson.authenticated) {
        setAuth(false);
        return;
      }
      setAuth(true);
      const [entRes, statusRes] = await Promise.all([
        apiFetch("/api/v1/billing/entitlements"),
        apiFetch("/api/v1/billing/status"),
      ]);
      if (cancelled) return;
      if (entRes.ok) {
        const json = (await entRes.json()) as { entitlements: Entitlements };
        setEnts(json.entitlements);
      }
      if (statusRes.ok) {
        const s = (await statusRes.json()) as { portalEnabled?: boolean };
        setPortalEnabled(Boolean(s.portalEnabled));
      }
    })().catch(() => {
      if (!cancelled) setError("Could not load billing status.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/billing/portal", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: { message?: string } };
      if (!res.ok || !json.url) {
        setError(json.error?.message ?? "Portal unavailable.");
        setBusy(false);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("Network error opening portal.");
      setBusy(false);
    }
  }

  if (auth === false) {
    return (
      <p>
        <a href={`/login/?next=${encodeURIComponent("/app/billing/")}`}>Sign in</a> to manage
        billing.
      </p>
    );
  }

  if (auth === null) {
    return <p className="muted">Loading billing…</p>;
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {message ? (
        <p role="status" style={{ color: "var(--color-success)" }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}

      {ents ? (
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 1rem" }}>
          <dt>Plan version</dt>
          <dd style={{ margin: 0 }}>
            <code>{ents.planVersion}</code>
          </dd>
          <dt>Pro</dt>
          <dd style={{ margin: 0 }}>{ents.isPro ? "Yes" : "No"}</dd>
          <dt>AI credits</dt>
          <dd style={{ margin: 0 }}>{ents.aiCreditsRemaining}</dd>
          <dt>Unwatermarked export</dt>
          <dd style={{ margin: 0 }}>{ents.unwatermarkedExport ? "Yes" : "No"}</dd>
          <dt>Batch export</dt>
          <dd style={{ margin: 0 }}>{ents.batchExport ? "Yes" : "No"}</dd>
          <dt>Activity Pack</dt>
          <dd style={{ margin: 0 }}>{ents.activityPack ? "Yes" : "No"}</dd>
          {ents.subscription ? (
            <>
              <dt>Subscription</dt>
              <dd style={{ margin: 0 }}>
                {ents.subscription.sku} · {ents.subscription.status} · {ents.subscription.provider}
                {ents.subscription.currentPeriodEnd
                  ? ` · renews/ends ${ents.subscription.currentPeriodEnd.slice(0, 10)}`
                  : ""}
                {ents.subscription.cancelAtPeriodEnd ? " · cancel at period end" : ""}
              </dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="muted">No entitlement ledger yet.</p>
      )}

      <p style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <a href="/pricing/">View plans</a>
        {portalEnabled ? (
          <button
            type="button"
            disabled={busy}
            onClick={openPortal}
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              padding: "0.45rem 0.9rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Opening…" : "Manage on Stripe"}
          </button>
        ) : null}
      </p>
    </div>
  );
}
