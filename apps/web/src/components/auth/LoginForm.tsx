import { useEffect, useMemo, useState } from "react";
import { Button } from "@acm/ui";
import { apiFetch, apiUrl } from "../../lib/api";

const DEFAULT_COOLDOWN_SECONDS = 60;

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/v1/auth/me")
      .then((r) => r.json())
      .then((data: { googleEnabled?: boolean; authenticated?: boolean }) => {
        if (cancelled) return;
        setGoogleEnabled(Boolean(data.googleEnabled));
        if (data.authenticated) {
          window.location.href = "/app/";
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldownLeft((left) => Math.max(0, left - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownLeft]);

  const error = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("error");
  }, []);

  function startCooldown(seconds: number | undefined) {
    const next = Math.max(1, Math.floor(seconds ?? DEFAULT_COOLDOWN_SECONDS));
    setCooldownLeft(next);
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (loading || cooldownLeft > 0) return;
    setLoading(true);
    setStatus(null);
    setDevLink(null);
    try {
      const res = await apiFetch("/api/v1/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error?.message ?? "Could not send sign-in link.");
        if (res.status === 429) {
          startCooldown(data?.error?.retryAfterSeconds);
        }
        return;
      }
      setStatus(data.message ?? "Check your email for a sign-in link.");
      if (typeof data.devLink === "string") setDevLink(data.devLink);
      startCooldown(data.retryAfterSeconds);
    } catch {
      setStatus("Network error. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  const submitDisabled = loading || cooldownLeft > 0;
  const submitLabel = loading
    ? "Sending…"
    : cooldownLeft > 0
      ? `Resend in ${cooldownLeft}s`
      : "Email me a sign-in link";

  return (
    <div style={{ display: "grid", gap: "1.25rem", maxWidth: 420 }}>
      {error ? (
        <p role="alert" style={{ color: "var(--color-warn)", margin: 0 }}>
          Sign-in failed ({error}). Request a new link or try again.
        </p>
      ) : null}

      <form onSubmit={sendMagicLink} style={{ display: "grid", gap: "0.75rem" }}>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ fontWeight: 650 }}>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
            disabled={loading}
            style={{
              padding: "0.65rem 0.75rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              font: "inherit",
            }}
          />
        </label>
        <Button type="submit" disabled={submitDisabled} aria-busy={loading}>
          {submitLabel}
        </Button>
      </form>

      {status ? (
        <p aria-live="polite" style={{ margin: 0 }}>
          {status}
        </p>
      ) : null}
      {cooldownLeft > 0 ? (
        <p className="muted" aria-live="polite" style={{ margin: 0, fontSize: "0.88rem" }}>
          You can request another link in {cooldownLeft}s. Check your inbox (and spam) for the
          first email.
        </p>
      ) : null}
      {devLink ? (
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem", wordBreak: "break-all" }}>
          Dev link (AUTH_DEV_RETURN_LINK): <a href={devLink}>{devLink}</a>
        </p>
      ) : null}

      {googleEnabled ? (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <div className="muted" style={{ textAlign: "center", fontSize: "0.9rem" }}>
            or
          </div>
          <a href={apiUrl("/api/v1/auth/google")} style={{ textDecoration: "none" }}>
            <Button type="button" variant="secondary" style={{ width: "100%" }}>
              Continue with Google
            </Button>
          </a>
        </div>
      ) : null}

      <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
        Anonymous AI Topic demo and manual maker stay available without signing in. Sign-in unlocks
        cloud save and share links.
      </p>
    </div>
  );
}
