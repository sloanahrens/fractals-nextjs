import { FractalBounds } from "../types/fractal";
import { boundsToView, clampZoom, pixelToComplex } from "./mandelbrot";

/** A position in canvas pixels. */
export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * How far apart two touches are, in the same pixels as the points.
 * @param a - One finger
 * @param b - The other finger
 * @returns The straight-line distance between them
 */
export function touchDistance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The point halfway between two touches, which a pinch zooms about.
 * @param a - One finger
 * @param b - The other finger
 * @returns The midpoint of the segment between them
 */
export function touchMidpoint(a: PixelPoint, b: PixelPoint): PixelPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The zoom factor one step of a pinch asks for: the new distance over the
 * previous one, so fingers moving apart give a factor above 1.
 *
 * Two fingers that sit on one point have no distance to take a ratio of, and a
 * ratio against zero is infinity or zero, which would throw the view to a zoom
 * limit. A pair with no distance on either side asks for no change, and the
 * caller takes the pair's distance as the baseline for its next step.
 * @param previousDistance - The distance at the last step
 * @param nextDistance - The distance now
 * @returns The factor to scale the view by, 1 when either distance is unusable
 */
export function pinchFactor(
  previousDistance: number,
  nextDistance: number,
): number {
  if (!(previousDistance > 0) || !(nextDistance > 0)) return 1;
  if (!Number.isFinite(previousDistance) || !Number.isFinite(nextDistance)) {
    return 1;
  }

  return nextDistance / previousDistance;
}

/**
 * The bounds after scaling the view by a factor so the point that was under
 * `from` ends up under `to`
 *
 * With `from` and `to` the same pixel this is a zoom about that pixel, the
 * wheel's. With them apart it also pans by the difference, which is what a
 * pinch whose fingers travel together does: the picture stays glued to the
 * fingers, as it does in a phone's own maps.
 *
 * The resulting zoom is held to the explorer's limits *here*, before the
 * anchor is worked out, so a pinch against a limit still keeps its point under
 * the fingers instead of sliding off it when the page clamps the zoom later.
 * @param bounds - The view on screen now
 * @param from - Canvas pixel the anchor was at in that view
 * @param to - Canvas pixel the anchor should be at in the new view
 * @param factor - Factor to multiply the zoom by (>1 = zoom in)
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @returns The new bounds
 */
export function scaleAboutPoint(
  bounds: FractalBounds,
  from: PixelPoint,
  to: PixelPoint,
  factor: number,
  canvasWidth: number,
  canvasHeight: number,
): FractalBounds {
  const view = boundsToView(bounds);
  const scale = clampZoom(view.scale * factor);
  const anchor = pixelToComplex(
    from.x,
    from.y,
    canvasWidth,
    canvasHeight,
    bounds,
  );

  // The span the new zoom shows, from the span the old one did.
  const realRange = (bounds.maxReal - bounds.minReal) * (view.scale / scale);
  const imaginaryRange =
    (bounds.maxImaginary - bounds.minImaginary) * (view.scale / scale);

  const minReal = anchor.real - (to.x / canvasWidth) * realRange;
  const minImaginary = anchor.imaginary - (to.y / canvasHeight) * imaginaryRange;

  return {
    minReal,
    maxReal: minReal + realRange,
    minImaginary,
    maxImaginary: minImaginary + imaginaryRange,
  };
}
