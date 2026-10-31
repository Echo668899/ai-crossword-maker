import type { CSSProperties } from "react";

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const tones: Record<string, CSSProperties> = {
    neutral: { background: "#E8EEF5", color: "var(--color-ink)" },
    ok: { background: "#D8F0E4", color: "var(--color-success)" },
    warn: { background: "#F5EED6", color: "var(--color-warn)" },
    danger: { background: "#F5DADB", color: "var(--color-danger)" },
  };
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.75rem",
        fontWeight: 600,
        padding: "0.2rem 0.5rem",
        borderRadius: "var(--radius-sm)",
        ...tones[tone],
      }}
    >
      {label}
    </span>
  );
}
