/**
 * The picture of a view as raw pixels, with no canvas anywhere.
 *
 * The explorer's pixels are made in one place, and in two steps: a point of the
 * plane goes to its iteration count through a {@link FractalKind}
 * ({@link countRgbaRows}), and the count goes to a colour through the colour
 * mapping ({@link colourRgbaRows}). {@link renderRgbaRows} and
 * {@link renderRgba} are those two steps run one after the other over one
 * buffer, so a picture is exactly its counts, coloured.
 *
 * Splitting them is what lets a colour change be had for free: the counts of a
 * view do not depend on the scheme, so a caller that kept them — `FractalRenderer`
 * keeps the counts of the run that finished, and repaints from them in another
 * scheme with no orbit computed at all — redraws the picture by running the
 * second step alone. Because the first step stores a count exactly as the kind
 * returned it, colouring those counts draws the picture the two-step pipeline
 * draws, byte for byte.
 *
 * `FractalRenderer` calls the two steps itself, row by row, and copies each
 * finished row into its canvas -- the counts it draws with are the ones it
 * keeps for a recolour -- and `scripts/make-og-previews.mjs` calls
 * {@link renderRgba} for a whole picture, so a place is the same pixels in the
 * browser and in a link preview, by construction rather than by two loops kept
 * in step. `fractalRenderer.test.ts` holds the two to byte equality for every
 * fractal.
 *
 * An orbit-trap picture has the same two steps with a different measure: a point
 * goes to the closest its orbit comes to a trap shape ({@link countTrapRows}),
 * and the distance goes to a colour through the same scheme, Reverse and Shift
 * ({@link colourTrapRows}). It is a sibling pair rather than a branch inside the
 * count pair, so a picture drawn without a trap is the code path it always was.
 *
 * Nothing here touches the DOM, `window` or any Node module, so it runs in both.
 */

import type {
  ColorOptions,
  ColorScheme,
  FractalBounds,
  FractalKind,
  TrapShape,
} from "../types/fractal";
import { mapIterationsToColor, mapPositionToColor } from "./colorMapping";
import { pixelToComplex } from "./mandelbrot";
import { trapDistanceFor, trapPosition } from "./orbitTrap";

/** Bytes a pixel takes in the buffer: red, green, blue, alpha. */
export const BYTES_PER_PIXEL = 4;

/**
 * A row range's iteration counts, one per pixel.
 *
 * `Float64Array` — what every caller here uses — holds a count exactly as the
 * kind returned it, so colouring counts draws the picture the one-pass pipeline
 * draws, byte for byte. A `Float32Array` halves the memory and rounds each
 * count to about seven significant digits, which for the escape-time
 * fractals moves no pixel and for Newton's packed root-and-speed count moves
 * about one pixel in 150 by one step of a ramp, so the type is the caller's to
 * choose rather than this module's.
 */
export type CountBuffer = Float32Array | Float64Array;

/**
 * A row range's orbit-trap distances, one per pixel, stored as `Float32`.
 *
 * Float32 is safe here and was not for counts: a trap distance is one smooth
 * quantity, not a root and a speed packed into one number, and it is rounded
 * once, when stored. Every caller colours from the stored (rounded) value, the
 * full render from its row buffer and the repaint from the kept buffer, so they
 * agree byte for byte. It is half the memory of the counts.
 */
export type TrapBuffer = Float32Array;

/**
 * Count some rows of a view: each pixel's point to its iteration count.
 *
 * Row `y` of the picture lands at `(y - firstRow) * width` in `counts`, so a
 * caller counting one row passes a buffer of `width` counts, and one counting
 * everything passes the whole picture with `firstRow` 0. Pixels are walked left
 * to right, top to bottom.
 *
 * A pixel's point is the pixel's top-left corner (`pixelToComplex` as the
 * canvas has always used it), not its centre; changing that would change every
 * picture the app has ever drawn.
 *
 * @param counts - Buffer to write, at least `(endRow - firstRow) * width` counts
 * @param firstRow - First row to count
 * @param endRow - One past the last row to count
 * @param bounds - The region of the plane the picture covers
 * @param width - Width of the whole picture in pixels
 * @param height - Height of the whole picture in pixels
 * @param maxIterations - Iteration cap, which is also what a count is judged against
 * @param kind - The formula to iterate
 * @param smooth - Whether counts are fractional; the full render is smooth, a
 *   preview is not
 */
export function countRgbaRows(
  counts: CountBuffer,
  firstRow: number,
  endRow: number,
  bounds: FractalBounds,
  width: number,
  height: number,
  maxIterations: number,
  kind: FractalKind,
  smooth: boolean = true,
): void {
  let index = 0;

  for (let y = firstRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const point = pixelToComplex(x, y, width, height, bounds);
      counts[index] = kind.iterations(point, maxIterations, smooth);
      index++;
    }
  }
}

/**
 * Colour some rows of a view: each pixel's count to its colour.
 *
 * The other half of {@link countRgbaRows}, over the same shape of buffer and
 * the same rows, and the only step a colour change has to run: the pixels are
 * opaque and their colours are the counts through the mapping, with no point of
 * the plane involved.
 *
 * @param out - Buffer to write, at least `(endRow - firstRow) * width * 4` bytes
 * @param counts - The counts to colour, as {@link countRgbaRows} left them
 * @param firstRow - First row to colour
 * @param endRow - One past the last row to colour
 * @param width - Width of the whole picture in pixels
 * @param maxIterations - The cap the counts were counted with, which is what
 *   they are judged against: a count of the whole cap is in the set, and black
 * @param scheme - Colour scheme to draw in
 * @param options - Reverse and shift of the scheme, or nothing for the scheme
 *   as it is; the same counts in another pair of options is a repaint, not a
 *   redraw of the view
 */
export function colourRgbaRows(
  out: Uint8ClampedArray,
  counts: CountBuffer,
  firstRow: number,
  endRow: number,
  width: number,
  maxIterations: number,
  scheme: ColorScheme,
  options?: ColorOptions,
): void {
  // One count a pixel, four bytes a pixel: the two buffers walk at different
  // rates.
  let pixel = 0;
  let index = 0;

  for (let y = firstRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const color = mapIterationsToColor(
        counts[pixel],
        maxIterations,
        scheme,
        options,
      );

      out[index] = color.r;
      out[index + 1] = color.g;
      out[index + 2] = color.b;
      out[index + 3] = 255;
      pixel++;
      index += BYTES_PER_PIXEL;
    }
  }
}

/**
 * Measure some rows of a view for an orbit trap: each pixel's point to the
 * closest its orbit comes to the shape ({@link trapDistanceFor}).
 *
 * The sibling of {@link countRgbaRows}, over the same rows and the same layout
 * of buffer, and what a trap render runs in its place. There is no `smooth`
 * argument: a distance has no whole-step form, so a preview pass draws the same
 * measure at fewer pixels.
 *
 * @param distances - Buffer to write, at least `(endRow - firstRow) * width`
 * @param firstRow - First row to measure
 * @param endRow - One past the last row to measure
 * @param bounds - The region of the plane the picture covers
 * @param width - Width of the whole picture in pixels
 * @param height - Height of the whole picture in pixels
 * @param maxIterations - Most steps an orbit is walked
 * @param kind - The formula to iterate
 * @param trap - The shape the distance is to
 */
export function countTrapRows(
  distances: TrapBuffer,
  firstRow: number,
  endRow: number,
  bounds: FractalBounds,
  width: number,
  height: number,
  maxIterations: number,
  kind: FractalKind,
  trap: TrapShape,
): void {
  let index = 0;

  for (let y = firstRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const point = pixelToComplex(x, y, width, height, bounds);
      distances[index] = trapDistanceFor(kind, point, maxIterations, trap);
      index++;
    }
  }
}

/**
 * Colour some rows of a trap picture: each pixel's stored distance to a place
 * on the palette ({@link trapPosition}) to a colour.
 *
 * The sibling of {@link colourRgbaRows}, not a branch inside it, so that
 * function's signature and per-pixel work are what they were and a plain
 * picture pays for nothing. It goes through the same scheme, Reverse and Shift
 * ({@link mapPositionToColor}), so a colour change in trap mode is this step
 * alone. No pixel is black for being inside the set: every pixel has a distance.
 *
 * @param out - Buffer to write, at least `(endRow - firstRow) * width * 4` bytes
 * @param distances - The distances, as {@link countTrapRows} left them
 * @param firstRow - First row to colour
 * @param endRow - One past the last row to colour
 * @param width - Width of the whole picture in pixels
 * @param scheme - Colour scheme to draw in
 * @param options - Reverse and shift of the scheme, or nothing for the scheme
 *   as it is
 */
export function colourTrapRows(
  out: Uint8ClampedArray,
  distances: TrapBuffer,
  firstRow: number,
  endRow: number,
  width: number,
  scheme: ColorScheme,
  options?: ColorOptions,
): void {
  let pixel = 0;
  let index = 0;

  for (let y = firstRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const color = mapPositionToColor(
        trapPosition(distances[pixel]),
        scheme,
        options,
      );

      out[index] = color.r;
      out[index + 1] = color.g;
      out[index + 2] = color.b;
      out[index + 3] = 255;
      pixel++;
      index += BYTES_PER_PIXEL;
    }
  }
}

/**
 * Draw some rows of a view into a buffer: count them, then colour them.
 *
 * The two steps above, over one counts buffer of the rows' own size, so a
 * caller has one function to call and the picture is the one the split pipeline
 * makes.
 *
 * @param out - Buffer to write, at least `(endRow - firstRow) * width * 4` bytes
 * @param firstRow - First row to draw
 * @param endRow - One past the last row to draw
 * @param bounds - The region of the plane the picture covers
 * @param width - Width of the whole picture in pixels
 * @param height - Height of the whole picture in pixels
 * @param maxIterations - Iteration cap, which is also what a count is judged against
 * @param scheme - Colour scheme to draw in
 * @param kind - The formula to iterate
 * @param smooth - Whether counts are fractional; the full render is smooth, a
 *   preview is not
 * @param options - Reverse and shift of the scheme, or nothing for the scheme
 *   as it is
 * @param trap - Colour by closest approach to this shape instead of by count:
 *   the trap pair of steps runs in place of the count pair, and `smooth` has no
 *   meaning for it. Absent is the picture the app has always drawn.
 */
export function renderRgbaRows(
  out: Uint8ClampedArray,
  firstRow: number,
  endRow: number,
  bounds: FractalBounds,
  width: number,
  height: number,
  maxIterations: number,
  scheme: ColorScheme,
  kind: FractalKind,
  smooth: boolean = true,
  options?: ColorOptions,
  trap?: TrapShape,
): void {
  const rows = Math.max(0, endRow - firstRow);

  if (trap !== undefined) {
    const distances = new Float32Array(rows * width);

    countTrapRows(
      distances,
      firstRow,
      endRow,
      bounds,
      width,
      height,
      maxIterations,
      kind,
      trap,
    );
    colourTrapRows(out, distances, firstRow, endRow, width, scheme, options);

    return;
  }

  const counts = new Float64Array(rows * width);

  countRgbaRows(
    counts,
    firstRow,
    endRow,
    bounds,
    width,
    height,
    maxIterations,
    kind,
    smooth,
  );
  colourRgbaRows(
    out,
    counts,
    firstRow,
    endRow,
    width,
    maxIterations,
    scheme,
    options,
  );
}

/**
 * The whole picture of a view: every row, counted and coloured.
 *
 * @param bounds - The region of the plane the picture covers
 * @param width - Width in pixels
 * @param height - Height in pixels
 * @param maxIterations - Iteration cap
 * @param scheme - Colour scheme to draw in
 * @param kind - The formula to iterate
 * @param smooth - Whether counts are fractional (the default, as the page draws)
 * @param options - Reverse and shift of the scheme, or nothing for the scheme
 *   as it is
 * @param trap - Colour by closest approach to this shape instead of by count
 * @returns `width * height * 4` bytes of RGBA, row by row from the top
 */
export function renderRgba(
  bounds: FractalBounds,
  width: number,
  height: number,
  maxIterations: number,
  scheme: ColorScheme,
  kind: FractalKind,
  smooth: boolean = true,
  options?: ColorOptions,
  trap?: TrapShape,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * BYTES_PER_PIXEL);

  renderRgbaRows(
    pixels,
    0,
    height,
    bounds,
    width,
    height,
    maxIterations,
    scheme,
    kind,
    smooth,
    options,
    trap,
  );

  return pixels;
}
