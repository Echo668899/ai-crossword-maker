export type MakerPaperSize = "letter" | "a4";

export const PAPER_SIZE_OPTIONS: Array<{ id: MakerPaperSize; label: string }> = [
  { id: "letter", label: "US Letter (8.5 × 11 in)" },
  { id: "a4", label: "A4 (210 × 297 mm)" },
];

export function resolveMakerPaperSize(value: unknown): MakerPaperSize {
  return value === "a4" ? "a4" : "letter";
}

const STYLE_ID = "acm-paper-page";

/** Drive CSS `@page` so browser print matches the Maker paper-size choice. */
export function applyBrowserPrintPaper(paper: MakerPaperSize): () => void {
  if (typeof document === "undefined") return () => {};
  const html = document.documentElement;
  const prev = html.getAttribute("data-paper");
  html.setAttribute("data-paper", paper);
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const created = !style;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  const size = paper === "a4" ? "A4" : "letter";
  style.textContent = `@page { size: ${size} portrait; margin: 0.67in; }`;
  return () => {
    if (prev) html.setAttribute("data-paper", prev);
    else html.removeAttribute("data-paper");
    if (created) style?.remove();
  };
}
