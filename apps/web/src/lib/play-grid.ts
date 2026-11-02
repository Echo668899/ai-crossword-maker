/** `.container` is `min(1120px, calc(100% - 2rem))`. */
export const PLAY_CONTENT_MAX_PX = 1120;
export const PLAY_CONTENT_GUTTER_PX = 32;

export const PLAY_ZOOM_MIN = 1;
export const PLAY_ZOOM_MAX = 2.5;
export const PLAY_ZOOM_STEP = 0.5;

const CELL_MIN_PX = 12;
const GRID_BORDER_PX = 4; // 2px on each side
const GRID_GAP_PX = 1;

/**
 * Content-column width the play grid should fill at zoom=1.
 * Matches `.container` so a desktop puzzle is not a small island in empty space.
 */
export function playContentWidth(viewportWidth: number): number {
  return Math.min(PLAY_CONTENT_MAX_PX, Math.max(0, viewportWidth - PLAY_CONTENT_GUTTER_PX));
}

/** Outer pixel width of a square-cell grid (cells + 1px gaps + 2px border). */
export function playGridPixelWidth(cols: number, cellPx: number): number {
  const c = Math.max(1, cols);
  return c * cellPx + (c - 1) * GRID_GAP_PX + GRID_BORDER_PX;
}

/**
 * Play-grid cell size in CSS pixels.
 * `availableWidth` is the content column (scroller) width, not the raw viewport.
 * At zoom=1 the grid fills that column; zoom > 1 enlarges past it for pan/scroll.
 */
export function playCellPx(
  rows: number,
  cols: number,
  availableWidth: number,
  zoom = PLAY_ZOOM_MIN,
): number {
  void rows;
  const c = Math.max(1, cols);
  const chrome = GRID_BORDER_PX + (c - 1) * GRID_GAP_PX;
  const inner = Math.max(c * CELL_MIN_PX, availableWidth - chrome);
  const fit = inner / c;
  const zoomed = fit * clamp(zoom, PLAY_ZOOM_MIN, PLAY_ZOOM_MAX);
  return Math.max(CELL_MIN_PX, Math.floor(zoomed));
}

export function playLetterFontPx(cellPx: number): number {
  return Math.max(8, Math.round(cellPx * 0.56));
}

export function playNumberFontPx(cellPx: number): number {
  return Math.max(7, Math.round(cellPx * 0.22));
}

export function clampPlayZoom(zoom: number): number {
  return clamp(zoom, PLAY_ZOOM_MIN, PLAY_ZOOM_MAX);
}

/** Step zoom up/down. Stepping past max wraps back to fit (used by Enlarge). */
export function stepPlayZoom(zoom: number, direction: 1 | -1): number {
  const next = zoom + direction * PLAY_ZOOM_STEP;
  if (direction > 0 && next > PLAY_ZOOM_MAX + 1e-6) return PLAY_ZOOM_MIN;
  return clampPlayZoom(Math.round(next * 10) / 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
