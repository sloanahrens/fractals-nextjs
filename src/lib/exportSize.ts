/**
 * The sizes the Download PNG controls offer, and the names an export is saved
 * under.
 *
 * What is offered is a whole multiple of the canvas — the screen size and two
 * larger ones — and what bounds it is memory: a canvas holds four bytes per
 * pixel, so an export is a budget rather than whatever the multiplication
 * happens to land on. A size the budget rules out is replaced by the largest
 * whole multiple that fits, so the controls always offer the biggest export
 * they can rather than only the small ones.
 */

/** The pixel budget an export may use: 12 megapixels, about 48 MB of ImageData. */
export const EXPORT_MAX_PIXELS = 12_000_000;

/**
 * The multiples the controls offer: the canvas itself and the two larger sizes
 * this feature names. One the budget rules out is replaced below, never
 * dropped in silence.
 */
const CANDIDATE_SCALES: readonly number[] = [1, 2, 4];

/** How often an export's progress text may change, in milliseconds. */
export const EXPORT_PROGRESS_INTERVAL_MS = 250;

/** What the page says when an export cannot be drawn or handed over. */
export const EXPORT_FAILED_MESSAGE = "Could not create that size";

/** One option of the Export size select. */
export interface ExportSize {
  /** The option's text, carrying the pixel counts it stands for */
  label: string;
  /** Multiple of the canvas this size draws */
  scale: number;
  width: number;
  height: number;
}

/**
 * The export sizes to offer for a canvas, smallest first.
 *
 * The screen size is always offered — it is what Download PNG has always saved
 * and the cap is about the larger options — and a larger candidate is offered
 * when the whole image fits `maxPixels`. When the cap rules a candidate out,
 * the largest whole multiple that still fits takes its place: a 1200 x 900
 * canvas offers 3x (3600 x 2700) where 4x (4800 x 3600, 17.3 MP) is too big.
 *
 * @param canvasWidth - Width of the canvas on screen
 * @param canvasHeight - Height of the canvas on screen
 * @param maxPixels - Pixel budget for the larger options
 * @returns The offered sizes, ascending by scale
 */
export function exportSizes(
  canvasWidth: number,
  canvasHeight: number,
  maxPixels: number = EXPORT_MAX_PIXELS,
): ExportSize[] {
  const basePixels = canvasWidth * canvasHeight;

  const offered = CANDIDATE_SCALES.filter(
    (scale) => scale === 1 || basePixels * scale * scale <= maxPixels,
  );

  if (basePixels > 0 && offered.length < CANDIDATE_SCALES.length) {
    // The largest whole multiple the budget allows, if it is bigger than 1
    // and not already offered.
    const largest = Math.floor(Math.sqrt(maxPixels / basePixels));
    if (largest > 1 && !offered.includes(largest)) offered.push(largest);
  }

  offered.sort((a, b) => a - b);

  return offered.map((scale) => ({
    label:
      scale === 1
        ? `Screen size (${canvasWidth} x ${canvasHeight})`
        : `${scale}x (${canvasWidth * scale} x ${canvasHeight * scale})`,
    scale,
    width: canvasWidth * scale,
    height: canvasHeight * scale,
  }));
}

/**
 * A name with a part marked on it, before the extension.
 *
 * What an export is named after — the multiple, or a wallpaper shape and its
 * pixels (`exportShape.ts`) — goes in front of `.png`, so a folder holding
 * several saves of one view says which is which. A name with no extension gets
 * the part appended rather than an invented one.
 *
 * @param name - The name for the view, from `downloadFileName`
 * @param part - What to mark the name with, without a leading underscore
 * @returns The marked name
 */
export function appendToFileName(name: string, part: string): string {
  const extension = name.lastIndexOf(".");
  if (extension === -1) return `${name}_${part}`;

  return `${name.slice(0, extension)}_${part}${name.slice(extension)}`;
}

/**
 * The name an export is saved under: the name the screen-size save uses, with
 * the size marked before the extension, so a folder holding a 1x and a 4x of
 * the same view says which is which.
 *
 * The screen size is returned unchanged. That name is what this app has always
 * written, and a screen-size export is that same save.
 *
 * @param name - The name for the view, from `downloadFileName`
 * @param scale - Multiple of the canvas the export draws
 * @returns The filename for the export
 */
export function exportFileName(name: string, scale: number): string {
  if (scale === 1) return name;

  return appendToFileName(name, `${scale}x`);
}

/**
 * Whether an export's progress text may change now.
 *
 * A render reports progress every few rows, which at an export's size is far
 * more often than a person can read — a 3200 x 2400 render reports hundreds of
 * times. The text follows at most one report per interval.
 *
 * @param nowMs - The clock, in milliseconds
 * @param lastReportMs - When the text last changed, zero for never
 * @param intervalMs - The shortest gap between changes
 * @returns Whether a report may be shown now
 */
export function exportProgressDue(
  nowMs: number,
  lastReportMs: number,
  intervalMs: number = EXPORT_PROGRESS_INTERVAL_MS,
): boolean {
  return nowMs - lastReportMs >= intervalMs;
}
