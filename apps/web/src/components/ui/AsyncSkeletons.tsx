import { Skeleton, SkeletonGrid, SkeletonRows, SkeletonText } from "@acm/ui";

/** Share-play loading layout: title bones + grid + clue columns. */
export function PlayPageSkeleton() {
  return (
    <section
      className="container section"
      style={{ paddingTop: "1.5rem" }}
      aria-busy="true"
      aria-live="polite"
    >
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        Shared play · not indexed
      </p>
      <Skeleton width="14rem" height="1.85rem" style={{ marginTop: "0.45rem" }} />
      <p className="muted" style={{ margin: "0.65rem 0 0" }}>
        Loading puzzle…
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 0.9fr)",
          gap: "1.5rem",
          marginTop: "1rem",
          alignItems: "start",
        }}
        className="play-layout"
      >
        <SkeletonGrid label="Loading shared crossword" />
        <div style={{ display: "grid", gap: "1rem" }}>
          <div>
            <Skeleton width="5rem" height="1rem" style={{ marginBottom: "0.65rem" }} />
            <SkeletonText lines={5} lastWidth="78%" />
          </div>
          <div>
            <Skeleton width="4rem" height="1rem" style={{ marginBottom: "0.65rem" }} />
            <SkeletonText lines={4} lastWidth="70%" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Billing entitlements dl-shaped placeholder. */
export function BillingSkeleton() {
  return (
    <div
      style={{ maxWidth: 560, display: "grid", gap: "0.75rem" }}
      role="status"
      aria-busy="true"
      aria-label="Loading billing"
    >
      <p className="muted" style={{ margin: 0 }}>
        Loading billing…
      </p>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          style={{ display: "grid", gridTemplateColumns: "9rem 1fr", gap: "0.75rem", alignItems: "center" }}
        >
          <Skeleton height="0.8rem" />
          <Skeleton height="0.8rem" width={`${55 + ((i * 9) % 35)}%`} />
        </div>
      ))}
      <Skeleton width="8rem" height="2.1rem" radius="var(--radius-md)" style={{ marginTop: "0.5rem" }} />
    </div>
  );
}

/** Pricing CTA placeholder while auth/status resolve. */
export function CheckoutCtaSkeleton() {
  return (
    <div role="status" aria-label="Loading checkout" aria-busy="true">
      <Skeleton width="100%" height="2.45rem" radius="var(--radius-md)" />
    </div>
  );
}

/** Maker grid pane while AI generate / build runs. */
export function MakerGridSkeleton({ label = "Building crossword preview" }: { label?: string }) {
  return (
    <div style={{ display: "grid", gap: "1rem", justifyItems: "start" }}>
      <SkeletonGrid cols={10} cells={100} cellPx={26} label={label} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          width: "100%",
          maxWidth: 480,
        }}
      >
        <SkeletonText lines={4} />
        <SkeletonText lines={4} lastWidth="70%" />
      </div>
    </div>
  );
}

export function LibraryListSkeleton({ count = 4 }: { count?: number }) {
  return <SkeletonRows count={count} />;
}

export function PackDetailSkeleton() {
  return (
    <div style={{ display: "grid", gap: "1rem" }} role="status" aria-busy="true" aria-label="Loading pack">
      <Skeleton width="11rem" height="0.85rem" />
      <Skeleton width="16rem" height="1.85rem" />
      <p className="muted" style={{ margin: 0 }}>
        Loading pack…
      </p>
      <SkeletonRows count={3} />
    </div>
  );
}

export function PuzzleEditorSkeleton() {
  return (
    <div style={{ display: "grid", gap: "1rem" }} role="status" aria-busy="true" aria-label="Loading puzzle">
      <Skeleton width="9rem" height="0.85rem" />
      <Skeleton width="14rem" height="1.85rem" />
      <p className="muted" style={{ margin: 0 }}>
        Loading puzzle…
      </p>
      <SkeletonText lines={2} lastWidth="48%" />
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Skeleton width="5.5rem" height="2.2rem" radius="var(--radius-md)" />
        <Skeleton width="4.5rem" height="2.2rem" radius="var(--radius-md)" />
        <Skeleton width="7rem" height="2.2rem" radius="var(--radius-md)" />
      </div>
      <Skeleton width="9rem" height="1.1rem" style={{ marginTop: "0.35rem" }} />
      <SkeletonRows count={3} />
    </div>
  );
}

export function AdminOverviewSkeleton() {
  return (
    <div style={{ display: "grid", gap: "1.25rem" }} role="status" aria-busy="true" aria-label="Loading admin">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(11rem,1fr))",
          gap: "0.5rem",
        }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ padding: "0.35rem 0", borderBottom: "1px solid var(--color-border)" }}>
            <Skeleton width="3rem" height="1.1rem" />
            <Skeleton width="70%" height="0.75rem" style={{ marginTop: "0.4rem" }} />
          </div>
        ))}
      </div>
      <SkeletonBlockish />
      <SkeletonRows count={3} />
    </div>
  );
}

function SkeletonBlockish() {
  return <Skeleton variant="block" height="6rem" />;
}
