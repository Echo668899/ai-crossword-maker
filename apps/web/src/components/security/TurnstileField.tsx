import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          action?: string;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type Props = {
  onToken: (token: string | null) => void;
  action?: string;
};

/**
 * Renders Cloudflare Turnstile when PUBLIC_TURNSTILE_SITE_KEY is set.
 * Without a site key, renders nothing (local/dev default).
 */
export default function TurnstileField({ onToken, action = "ai-topic" }: Props) {
  const siteKey = (import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined)?.trim();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const domId = useId().replace(/:/g, "");

  useEffect(() => {
    if (!siteKey || !hostRef.current) return;
    let cancelled = false;

    const mount = () => {
      if (cancelled || !hostRef.current || !window.turnstile) return;
      if (widgetId.current) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
      widgetId.current = window.turnstile.render(hostRef.current, {
        sitekey: siteKey,
        action,
        theme: "light",
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile"]',
    );
    if (window.turnstile) {
      mount();
    } else if (existing) {
      existing.addEventListener("load", mount);
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => mount();
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey, action]);

  if (!siteKey) return null;

  return (
    <div
      id={`cf-turnstile-${domId}`}
      ref={hostRef}
      style={{ minHeight: 65, marginTop: "0.5rem" }}
      aria-label="Bot check"
    />
  );
}

export function turnstileConfigured(): boolean {
  return Boolean((import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined)?.trim());
}
