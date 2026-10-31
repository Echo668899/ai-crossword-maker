import { useEffect, useState, type CSSProperties } from "react";
import { pricing } from "@acm/config/pricing";
import { apiFetch } from "../../lib/api";

type BillingStatus = {
  checkoutEnabled: boolean;
  portalEnabled: boolean;
  activeProvider: "stripe" | "creem" | null;
  providers: {
    stripe: { configured: boolean; pricesMapped: boolean };
    creem: { configured: boolean; productsMapped: boolean };
  };
  planVersion: string;
  skus: string[];
};

type AuthMe = {
  authenticated: boolean;
  user: { id: string; email: string | null } | null;
};

type Sku =
  | "pro_monthly"
  | "pro_yearly"
  | "credits_50"
  | "credits_100"
  | "activity_pack";

const card: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  background: "#fff",
  padding: "1.1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
};

const primaryCard: CSSProperties = {
  ...card,
  borderColor: "var(--color-primary)",
  boxShadow: "0 0 0 1px rgba(47, 92, 143, 0.12)",
};

function CheckoutButton({
  sku,
  label,
  enabled,
  signedIn,
  busySku,
  onCheckout,
}: {
  sku: Sku;
  label: string;
  enabled: boolean;
  signedIn: boolean;
  busySku: Sku | null;
  onCheckout: (sku: Sku) => void;
}) {
  const busy = busySku === sku;
  if (!enabled) {
    return (
      <button type="button" disabled style={btnStyle(true)}>
        Checkout unavailable
      </button>
    );
  }
  if (!signedIn) {
    return (
      <a href={`/login/?next=${encodeURIComponent("/pricing/")}`} style={linkBtnStyle}>
        Sign in to buy
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled={busySku !== null}
      onClick={() => onCheckout(sku)}
      style={btnStyle(busySku !== null)}
    >
      {busy ? "Redirecting…" : label}
    </button>
  );
}

const btnStyle = (disabled: boolean): CSSProperties => ({
  fontFamily: "var(--font-body)",
  fontSize: "0.95rem",
  fontWeight: 600,
  padding: "0.55rem 1rem",
  borderRadius: "var(--radius-md)",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  background: "var(--color-primary)",
  color: "#fff",
  border: "1px solid var(--color-primary)",
  width: "100%",
  textAlign: "center",
});

const linkBtnStyle: CSSProperties = {
  ...btnStyle(false),
  display: "inline-block",
  textDecoration: "none",
  boxSizing: "border-box",
};

export default function PricingCheckout() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [auth, setAuth] = useState<AuthMe | null>(null);
  const [busySku, setBusySku] = useState<Sku | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "canceled") {
      setNotice("Checkout canceled. No charge was made.");
    }
    if (params.get("upgraded") === "1") {
      setNotice("Welcome to Pro — your entitlements refresh after webhook confirmation.");
    }
    let cancelled = false;
    (async () => {
      try {
        const [statusRes, meRes] = await Promise.all([
          apiFetch("/api/v1/billing/status"),
          apiFetch("/api/v1/auth/me"),
        ]);
        const statusJson = (await statusRes.json()) as BillingStatus;
        const meJson = (await meRes.json()) as AuthMe;
        if (!cancelled) {
          setStatus(statusJson);
          setAuth(meJson);
        }
      } catch {
        if (!cancelled) {
          setStatus({
            checkoutEnabled: false,
            portalEnabled: false,
            activeProvider: null,
            providers: {
              stripe: { configured: false, pricesMapped: false },
              creem: { configured: false, productsMapped: false },
            },
            planVersion: pricing.planVersion,
            skus: [],
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startCheckout(sku: Sku) {
    setError(null);
    setBusySku(sku);
    try {
      const res = await apiFetch("/api/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ sku }),
      });
      const json = (await res.json()) as {
        url?: string;
        error?: { message?: string };
      };
      if (!res.ok || !json.url) {
        setError(json.error?.message ?? "Checkout could not start.");
        setBusySku(null);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("Network error starting checkout.");
      setBusySku(null);
    }
  }

  const enabled = Boolean(status?.checkoutEnabled);
  const signedIn = Boolean(auth?.authenticated);
  const providerLabel =
    status?.activeProvider === "stripe"
      ? "Stripe"
      : status?.activeProvider === "creem"
        ? "Creem"
        : null;
  const yearlyPerMonth = (pricing.proYearly.priceUsd / 12).toFixed(0);

  return (
    <div>
      <p style={{ maxWidth: "62ch", margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
        Start free with a daily AI Topic demo. Upgrade to Pro when you need more generations,
        cloud saves, batch classroom packs, and watermark-free PDFs.
      </p>
      <p className="muted" style={{ maxWidth: "60ch", margin: "0 0 0.75rem" }}>
        You pay for workflow — not for basic grid correctness. Manual building and structural
        validation stay available on Free. Plan version:{" "}
        <code>{status?.planVersion ?? pricing.planVersion}</code>.
      </p>

      <p style={{ margin: "0 0 1.25rem" }}>
        <a href="/#maker">Try the free Topic demo</a>
        {" · "}
        <a href="/examples/">Browse printable examples</a>
        {" · "}
        <a href="/crossword-maker-for-teachers/">Teacher workflows</a>
      </p>

      {status && !enabled ? (
        <p
          className="muted"
          role="status"
          style={{
            margin: "0 0 1rem",
            padding: "0.75rem 1rem",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: "rgba(255,255,255,0.7)",
          }}
        >
          Checkout is offline until payment secrets are configured. Set{" "}
          <code>CREEM_*</code> (preferred) or <code>STRIPE_*</code> plus product/price IDs.
          Free AI demo and manual maker remain available.
        </p>
      ) : null}

      {enabled && providerLabel ? (
        <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
          Checkout via {providerLabel}
          {status?.providers.stripe.configured && status?.providers.creem.configured
            ? " (alternate provider also configured; switch with BILLING_PROVIDER)"
            : ""}
          .
        </p>
      ) : null}

      {notice ? (
        <p role="status" style={{ color: "var(--color-warn)", margin: "0 0 1rem" }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: "var(--color-danger)", margin: "0 0 1rem" }}>
          {error}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          marginTop: "0.5rem",
        }}
      >
        <article style={card}>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Free</h2>
          <p style={{ margin: 0, fontSize: "1.6rem", fontWeight: 700 }}>$0</p>
          <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
            <li>{pricing.free.anonAiDemoPerDay} AI Topic demos / day</li>
            <li>Manual maker + local draft autosave</li>
            <li>Watermarked PDF + share play links</li>
            <li>Up to {pricing.free.loggedInCloudProjects} cloud projects when signed in</li>
          </ul>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            When the daily demo runs out, keep building manually — or upgrade for more AI ops.
          </p>
          <p style={{ marginTop: "auto" }}>
            <a href="/#maker" style={linkBtnStyle}>
              Start free Topic demo
            </a>
          </p>
        </article>

        <article style={primaryCard}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--color-primary)",
            }}
          >
            Recommended for teachers
          </p>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Pro</h2>
          <p style={{ margin: 0, fontSize: "1.6rem", fontWeight: 700 }}>
            ${pricing.proMonthly.priceUsd}/mo
          </p>
          <p className="muted" style={{ margin: 0 }}>
            or ${pricing.proYearly.priceUsd}/year (≈ ${yearlyPerMonth}/mo)
          </p>
          <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
            <li>~{pricing.proMonthly.aiOpsPerPeriod} AI ops / billing period</li>
            <li>{pricing.proMonthly.cloudProjects} cloud projects + version history</li>
            <li>Batch / Activity pack export, no watermark</li>
            <li>Best Free → Pro path when you prep classes weekly</li>
          </ul>
          <div style={{ display: "grid", gap: "0.5rem", marginTop: "auto" }}>
            <CheckoutButton
              sku="pro_yearly"
              label={`Go Pro yearly (save $${pricing.proMonthly.priceUsd * 12 - pricing.proYearly.priceUsd})`}
              enabled={enabled}
              signedIn={signedIn}
              busySku={busySku}
              onCheckout={startCheckout}
            />
            <CheckoutButton
              sku="pro_monthly"
              label="Go Pro monthly"
              enabled={enabled}
              signedIn={signedIn}
              busySku={busySku}
              onCheckout={startCheckout}
            />
          </div>
        </article>

        <article style={card}>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Credit Pack</h2>
          <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
            ${pricing.creditPacks[0].priceUsd}/{pricing.creditPacks[0].aiOps} or $
            {pricing.creditPacks[1].priceUsd}/{pricing.creditPacks[1].aiOps}
          </p>
          <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
            <li>Pay-as-you-go AI operations</li>
            <li>Good for occasional parents / one-off units</li>
            <li>Does not remove watermark by default</li>
          </ul>
          <div style={{ display: "grid", gap: "0.5rem", marginTop: "auto" }}>
            <CheckoutButton
              sku="credits_50"
              label={`Buy ${pricing.creditPacks[0].aiOps} credits`}
              enabled={enabled}
              signedIn={signedIn}
              busySku={busySku}
              onCheckout={startCheckout}
            />
            <CheckoutButton
              sku="credits_100"
              label={`Buy ${pricing.creditPacks[1].aiOps} credits`}
              enabled={enabled}
              signedIn={signedIn}
              busySku={busySku}
              onCheckout={startCheckout}
            />
          </div>
        </article>

        <article style={card}>
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Activity Pack</h2>
          <p style={{ margin: 0, fontSize: "1.6rem", fontWeight: 700 }}>
            ${pricing.activityPack.priceUsd}
          </p>
          <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
            <li>One project, up to {pricing.activityPack.layoutVariants} layout variants</li>
            <li>+{pricing.activityPack.bonusAiOps} AI ops for that project</li>
            <li>Classroom A/B/C sheets without a full Pro sub</li>
          </ul>
          <div style={{ marginTop: "auto" }}>
            <CheckoutButton
              sku="activity_pack"
              label="Buy Activity Pack"
              enabled={enabled}
              signedIn={signedIn}
              busySku={busySku}
              onCheckout={startCheckout}
            />
          </div>
        </article>
      </div>

      <section style={{ marginTop: "2rem", maxWidth: "68ch" }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Free → Pro in practice</h2>
        <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
          <li>Generate a Topic demo on the homepage (no signup required for the first tries).</li>
          <li>Print with a light brand footer, or sign in to save a cloud draft.</li>
          <li>
            Hit the daily AI wall or need clean PDFs / batch packs → choose Pro (yearly saves most)
            or a Credit Pack for light use.
          </li>
        </ol>
      </section>
    </div>
  );
}
