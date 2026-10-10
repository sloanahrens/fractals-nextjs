/**
 * The picture of a view as raw pixels, with no canvas anywhere.
 *
 * The explorer's pixels are made in one place: a point of the plane goes to its
 * iteration count through a {@link FractalKind}, and the count goes to a colour
 * through the colour mapping. This module is that pipeline over a buffer of
 * RGBA bytes. `FractalRenderer` calls {@link renderRgbaRows} a row at a time and
 * copies each row into its canvas, and the `/api/og` route calls
 * {@link renderRgba} for a whole picture on the server, so a view is the same
 * pixels in the browser and in a link preview, by construction rather than by
 * two loops kept in step. `fractalRenderer.test.ts` holds the two to byte
 * equality for every fractal.
 *
 * Nothing here touches the DOM, `window` or any Node module, so it runs in both.
 */

import type { ColorScheme, FractalBounds, FractalKind } from "../types/fractal";
import { mapIterationsToColor } from "./colorMapping";
import { pixelToComplex } from "./mandelbrot";

/** Bytes a pixel takes in the buffer: red, green, blue, alpha. */
export const BYTES_PER_PIXEL = 4;

/**
 * Draw some rows of a view into a buffer.
 *
 * Row `y` of the picture lands at `(y - firstRow) * width * 4` in `out`, so a
 * caller drawing one row passes a buffer of `width * 4` bytes, and one drawing
 * everything passes the whole picture with `firstRow` 0. Pixels are walked left
 * to right, top to bottom, and each is opaque.
 *
 * A pixel's point is the pixel's top-left corner (`pixelToComplex` as the
 * canvas has always used it), not its centre; changing that would change every
 * picture the app has ever drawn.
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
): void {
  let index = 0;

  for (let y = firstRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const point = pixelToComplex(x, y, width, height, bounds);
      const iterations = kind.iterations(point, maxIterations, smooth);
      const color = mapIterationsToColor(iterations, maxIterations, scheme);

      out[index] = color.r;
      out[index + 1] = color.g;
      out[index + 2] = color.b;
      out[index + 3] = 255;
      index += BYTES_PER_PIXEL;
    }
  }
}

/**
 * The whole picture of a view.
 *
 * @param bounds - The region of the plane the picture covers
 * @param width - Width in pixels
 * @param height - Height in pixels
 * @param maxIterations - Iteration cap
 * @param scheme - Colour scheme to draw in
 * @param kind - The formula to iterate
 * @param smooth - Whether counts are fractional (the default, as the page draws)
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
  );

  return pixels;
}
