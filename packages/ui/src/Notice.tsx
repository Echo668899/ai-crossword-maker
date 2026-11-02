import type { HTMLAttributes, ReactNode } from "react";

/** Entitlement / plan tips — distinct from muted helper text. */
export type NoticeTone = "info" | "upsell" | "warn";

/**
 * Colored plan tip. Tones:
 * - info: cool paper-blue (what you have / what stays free)
 * - upsell: amber (Pro / Activity Pack purchase)
 * - warn: quota-exhausted orange from Maker #31
 */
export function Notice({
  tone,
  children,
  className = "",
  role,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  tone: NoticeTone;
  children: ReactNode;
}) {
  const resolvedRole = role ?? (tone === "warn" ? "alert" : "status");
  return (
    <div
      className={`acm-notice acm-notice--${tone} ${className}`.trim()}
      role={resolvedRole}
      {...rest}
    >
      {children}
    </div>
  );
}
