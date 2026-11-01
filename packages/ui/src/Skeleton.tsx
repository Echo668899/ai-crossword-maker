import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  /** Soft cool-blue bone; matches paper-workbench surfaces. */
  variant?: "bone" | "line" | "block";
};

function dim(value: string | number | undefined, fallback: string): string {
  if (value == null) return fallback;
  return typeof value === "number" ? `${value}px` : value;
}

/** Single shimmer bone. Animation lives in apps/web global.css (`.acm-skeleton`). */
export function Skeleton({
  width,
  height,
  radius,
  variant = "bone",
  className = "",
  style,
  ...rest
}: SkeletonProps) {
  const defaults =
    variant === "line"
      ? { width: "100%", height: "0.85rem", radius: "var(--radius-sm)" }
      : variant === "block"
        ? { width: "100%", height: "7rem", radius: "var(--radius-md)" }
        : { width: "100%", height: "1rem", radius: "var(--radius-sm)" };

  return (
    <div
      aria-hidden="true"
      className={`acm-skeleton ${className}`.trim()}
      style={{
        width: dim(width, defaults.width),
        height: dim(height, defaults.height),
        borderRadius: dim(radius, defaults.radius),
        ...style,
      }}
      {...rest}
    />
  );
}

export function SkeletonText({
  lines = 3,
  lastWidth = "62%",
  gap = "0.55rem",
  style,
}: {
  lines?: number;
  lastWidth?: string | number;
  gap?: string | number;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "grid",
        gap: typeof gap === "number" ? `${gap}px` : gap,
        ...style,
      }}
    >
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          variant="line"
          width={i === lines - 1 && lines > 1 ? lastWidth : "100%"}
          height={i === 0 ? "1rem" : "0.85rem"}
        />
      ))}
    </div>
  );
}

/** Card-shaped list rows used by libraries / packs / versions. */
export function SkeletonRows({
  count = 3,
  rowHeight = "3.25rem",
}: {
  count?: number;
  rowHeight?: string | number;
}) {
  return (
    <div
      style={{ display: "grid", gap: "0.65rem" }}
      role="status"
      aria-label="Loading"
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 0.9rem",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
            minHeight: dim(rowHeight, "3.25rem"),
          }}
        >
          <div style={{ flex: 1, display: "grid", gap: "0.45rem" }}>
            <Skeleton width={`${58 + ((i * 11) % 28)}%`} height="0.95rem" />
            <Skeleton width={`${38 + ((i * 7) % 22)}%`} height="0.7rem" />
          </div>
          <Skeleton width="4.5rem" height="1.85rem" radius="var(--radius-md)" />
        </div>
      ))}
    </div>
  );
}

/** Crossword-ish grid placeholder (share play + maker preview). */
export function SkeletonGrid({
  cells = 81,
  cellPx = 28,
  cols = 9,
  label = "Loading puzzle",
}: {
  cells?: number;
  cellPx?: number;
  cols?: number;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      style={{
        display: "inline-grid",
        gridTemplateColumns: `repeat(${cols}, ${cellPx}px)`,
        gap: 2,
        padding: 4,
        border: "2px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-surface)",
        maxWidth: "100%",
      }}
    >
      {Array.from({ length: cells }, (_, i) => {
        const isBlock = i % 7 === 0 || i % 11 === 3;
        return (
          <Skeleton
            key={i}
            width={cellPx}
            height={cellPx}
            radius={2}
            style={{
              opacity: isBlock ? 0.35 : 1,
              background: isBlock ? "var(--color-ink)" : undefined,
            }}
            className={isBlock ? "acm-skeleton--static" : undefined}
          />
        );
      })}
    </div>
  );
}

/** Fade/slide-in wrapper when real content replaces a skeleton. */
export function ContentEnter({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`acm-content-enter ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
