import type { ComplexNumber, FractalBounds } from "../types/fractal";
import { calculateZoomBounds } from "./mandelbrot";

/**
 * The Julia map: the Mandelbrot set drawn small, as the chart of Julia constants
 *
 * A Julia set is one picture out of a family, and its constant is a point of the
 * plane — the same plane the Mandelbrot set is drawn in. This module is that
 * plane as a control: where a point of the inset is in the plane and where a
 * point of the plane is in the inset, each the other's inverse, plus the frame
 * and the constants the component draws and steps by. Nothing here touches the
 * DOM, so the arithmetic is checked without a browser.
 *
 * The frame is the app's base view (4 by 3) centred on the origin, and that is
 * the point of it rather than the set's own centre: a custom constant may name
 * any point with each part within 2 (see `./julia`), and x -2 to
 * 2 by y -1.5 to 1.5 is exactly that box. So every point of the inset is a
 * constant the app can be given, and pointing at the far left edge names -2
 * rather than a point that would be refused and leave the picture where it was.
 * The set's left tip sits on that edge, which is where the picture of the
 * Mandelbrot set has always ended.
 */

/** Width of the inset in pixels. */
export const JULIA_MAP_WIDTH = 160;

/** Height of the inset in pixels. */
export const JULIA_MAP_HEIGHT = 120;

/**
 * The iteration cap the map is drawn at.
 *
 * Low on purpose: the map is a chart of where the set is, not a picture to walk
 * into. A boundary point of the set at this size is a pixel wide however many
 * iterations are spent on it, and a cap of 60 keeps the picture to a couple of
 * milliseconds.
 */
export const JULIA_MAP_ITERATIONS = 60;

/**
 * How far one arrow-key press moves the constant, as a share of the inset's
 * width.
 *
 * The inset is 4:3 and so is the plane it shows, so a pixel is the same step in
 * both axes: 1/50 of the width is 0.08 of the plane either way.
 */
export const JULIA_MAP_ARROW_STEP = 1 / 50;

/**
 * The control's accessible name.
 *
 * It says what pointing does as well as what the picture is, because the map is
 * a control and not an illustration.
 */
export const JULIA_MAP_LABEL = "Pick the Julia constant on the Mandelbrot map";

/**
 * The region of the plane the inset draws.
 *
 * The app's base view — the whole Mandelbrot set at zoom 1 — centred on the
 * origin, which is the box a custom constant may name (see the module comment).
 */
export function juliaMapBounds(): FractalBounds {
  return calculateZoomBounds(0, 0, 1);
}

/**
 * How far along one axis a pixel sits, as 0..1 of that axis.
 *
 * A pixel outside the inset is held to the nearer edge rather than folded back
 * or dropped, so a drag that runs off the inset keeps picking the edge's point
 * and a ring for a constant the map cannot show sits on the edge instead of
 * somewhere it is not. An inset with no extent on an axis, and a value that is
 * not a number at all, both read as the start of the axis — which is the one
 * answer that cannot put a NaN into a constant's name.
 */
function axisFraction(value: number, extent: number): number {
  if (!(extent > 0) || !Number.isFinite(value)) return 0;

  return Math.min(Math.max(value, 0), extent) / extent;
}

/**
 * The point of the plane an inset pixel stands for.
 *
 * @param x - Pixel column in the inset, measured from its left edge
 * @param y - Pixel row in the inset, measured from its top edge
 * @param width - Width of the inset in pixels
 * @param height - Height of the inset in pixels
 * @param bounds - The region of the plane the inset draws
 * @returns The point there, held inside the inset's own region
 */
export function insetPointToComplex(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: FractalBounds,
): ComplexNumber {
  const column = axisFraction(x, width);
  const row = axisFraction(y, height);

  return {
    real: bounds.minReal + column * (bounds.maxReal - bounds.minReal),
    imaginary:
      bounds.minImaginary + row * (bounds.maxImaginary - bounds.minImaginary),
  };
}

/**
 * Where a point of the plane sits in the inset.
 *
 * The inverse of {@link insetPointToComplex}, and clamped the same way: a
 * constant the frame does not hold — nothing a pick can produce, but a name from
 * a link can be anything — puts its ring on the edge it lies beyond.
 *
 * @param point - The point to place
 * @param width - Width of the inset in pixels
 * @param height - Height of the inset in pixels
 * @param bounds - The region of the plane the inset draws
 * @returns The pixel, held inside the inset
 */
export function complexToInsetPoint(
  point: ComplexNumber,
  width: number,
  height: number,
  bounds: FractalBounds,
): { x: number; y: number } {
  const realSpan = bounds.maxReal - bounds.minReal;
  const imaginarySpan = bounds.maxImaginary - bounds.minImaginary;

  return {
    x:
      axisFraction(point.real - bounds.minReal, realSpan) *
      Math.max(width, 0),
    y:
      axisFraction(point.imaginary - bounds.minImaginary, imaginarySpan) *
      Math.max(height, 0),
  };
}

/**
 * The point one arrow-key press moves to.
 *
 * The step is {@link JULIA_MAP_ARROW_STEP} of the inset's width in both axes —
 * the same distance in the plane, the frame being the same shape as the inset —
 * and the result goes back through the clamped mapping, so a press at an edge
 * holds the constant on the edge rather than stepping off the map.
 *
 * @param point - The constant the map is ringed at
 * @param horizontal - -1 for a step left, 1 for a step right, 0 to stay
 * @param vertical - -1 for a step up the picture, 1 for a step down it, 0 to stay
 * @param width - Width of the inset in pixels
 * @param height - Height of the inset in pixels
 * @param bounds - The region of the plane the inset draws
 * @returns The point that press names
 */
export function stepJuliaMapPoint(
  point: ComplexNumber,
  horizontal: -1 | 0 | 1,
  vertical: -1 | 0 | 1,
  width: number,
  height: number,
  bounds: FractalBounds,
): ComplexNumber {
  const here = complexToInsetPoint(point, width, height, bounds);
  const step = width * JULIA_MAP_ARROW_STEP;

  return insetPointToComplex(
    here.x + horizontal * step,
    here.y + vertical * step,
    width,
    height,
    bounds,
  );
}
