/** Narrow layout used by `.play-layout` (stacked grid + clues). */
export const PLAY_NARROW_MAX_PX = 800;

const DESKTOP = { min: 40, max: 56, availableCap: 680, availableFloor: 520 } as const;
const MOBILE = { min: 30, max: 40, gutter: 32, availableFloor: 280 } as const;

/**
 * Play-grid cell size in CSS pixels.
 * Desktop aims for ~40–56px so letters stay readable; mobile stays tap-friendly
 * with horizontal scroll rather than shrinking below 30px.
 */
export function playCellPx(rows: number, cols: number, viewportWidth: number): number {
  const dim = Math.max(1, rows, cols);
  const narrow = viewportWidth < PLAY_NARROW_MAX_PX;
  if (narrow) {
    const available = Math.max(MOBILE.availableFloor, viewportWidth - MOBILE.gutter);
    return clamp(Math.floor(available / dim), MOBILE.min, MOBILE.max);
  }
  const available = Math.min(
    DESKTOP.availableCap,
    Math.max(DESKTOP.availableFloor, viewportWidth * 0.52),
  );
  // Large blocked grids (17+) keep a slightly smaller floor so clues still fit.
  const minCell = dim >= 17 ? 32 : DESKTOP.min;
  return clamp(Math.floor(available / dim), minCell, DESKTOP.max);
}

export function playLetterFontPx(cellPx: number): number {
  return Math.max(16, Math.round(cellPx * 0.56));
}

export function playNumberFontPx(cellPx: number): number {
  return Math.max(9, Math.round(cellPx * 0.22));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
