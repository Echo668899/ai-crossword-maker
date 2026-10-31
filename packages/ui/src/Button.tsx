import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--color-primary)",
    color: "#fff",
    border: "1px solid var(--color-primary)",
  },
  secondary: {
    background: "var(--color-surface)",
    color: "var(--color-ink)",
    border: "1px solid var(--color-border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-primary)",
    border: "1px solid transparent",
  },
  danger: {
    background: "var(--color-danger)",
    color: "#fff",
    border: "1px solid var(--color-danger)",
  },
};

export function Button({
  variant = "primary",
  children,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      style={{
        fontFamily: "var(--font-body)",
        fontSize: "0.95rem",
        fontWeight: 600,
        padding: "0.55rem 1rem",
        borderRadius: "var(--radius-md)",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.55 : 1,
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
