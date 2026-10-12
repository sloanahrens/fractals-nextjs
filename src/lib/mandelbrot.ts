import {
  ComplexNumber,
  FractalBounds,
  FractalKind,
  TrapShape,
  ZoomState,
} from "../types/fractal";
import { TRAP_CYCLE_TOLERANCE, trapKey, trapKeyToDistance } from "./orbitTrap";

// Where the Mandelbrot orbit starts: z = 0, the point the set is defined from.
// A Julia kind swaps the roles around -- it starts at the point the renderer
// handed it and adds its own constant -- which is the whole difference between
// the two.
const ORIGIN: ComplexNumber = { real: 0, imaginary: 0 };

/**
 * Walk one escape-time orbit, z -> z^2 + c, and count the steps it survives.
 *
 * The one loop behind the Mandelbrot functions and every Julia kind, so the
 * escape test, the iteration counting and the smoothing are the same for all
 * of them and colour schemes read consistently across kinds.
 * @param start - Point the orbit starts from (z0)
 * @param constant - Constant added at every step (c)
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
export function escapeTimeIterations(
  start: ComplexNumber,
  constant: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): number {
  let real = start.real;
  let imaginary = start.imaginary;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    // Calculate z^2 + c
    const squaredReal = real * real - imaginary * imaginary;
    const squaredImaginary = 2 * real * imaginary;
    real = squaredReal + constant.real;
    imaginary = squaredImaginary + constant.imaginary;

    // Check if point has escaped (magnitude > 2)
    const magnitudeSquared = real * real + imaginary * imaginary;
    if (magnitudeSquared > 4) {
      if (!smooth) {
        return iterations;
      }

      // Smooth iteration calculation for better color gradients
      const smoothIterations =
        iterations + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      return smoothIterations;
    }
  }

  return maxIterations;
}

/**
 * Walk one escape-time orbit, z -> z^2 + c, and hand back the points it visited.
 *
 * The same loop as {@link escapeTimeIterations} with the arithmetic kept rather
 * than the count: the Math card's orbit plot draws the path, so it wants the
 * points and not a number. The start is the first point, one point is added per
 * step, and the step whose result leaves the radius of 2 ends the walk with that
 * point included -- the dot that flew off is the one worth seeing. An orbit
 * still inside after `maxSteps` stops there.
 *
 * This is the one orbit walker both z -> z^2 + c kinds use: the Mandelbrot set
 * starts at 0 and adds the point the renderer handed over, a Julia set starts
 * at that point and adds its own constant, and nothing else differs.
 * @param start - Point the orbit starts from (z0)
 * @param constant - Constant added at every step (c)
 * @param maxSteps - Most steps to walk
 * @returns The visited points, the start first
 */
export function escapeTimeOrbit(
  start: ComplexNumber,
  constant: ComplexNumber,
  maxSteps: number,
): ComplexNumber[] {
  const points: ComplexNumber[] = [{ ...start }];
  let real = start.real;
  let imaginary = start.imaginary;

  for (let steps = 0; steps < maxSteps; steps++) {
    // Calculate z^2 + c, the step escapeTimeIterations walks.
    const squaredReal = real * real - imaginary * imaginary;
    const squaredImaginary = 2 * real * imaginary;
    real = squaredReal + constant.real;
    imaginary = squaredImaginary + constant.imaginary;
    points.push({ real, imaginary });

    // The same escape test, read after the step: the point that left the
    // radius is on the path, and the path ends with it.
    if (real * real + imaginary * imaginary > 4) break;
  }

  return points;
}

/**
 * Walk one escape-time orbit, z -> z^2 + c, and return the closest it comes to
 * a trap shape: the same loop as {@link escapeTimeOrbit} with a running minimum
 * kept in place of the points, so it allocates nothing.
 *
 * Counts the points the orbit lands on, the first step's onward; the start is
 * not one. Stops on the escape test (the point that left the radius is counted,
 * as the path counts it), at `maxSteps`, or when the orbit has closed on a
 * cycle or a fixed point: every later step revisits points already measured, so
 * the minimum cannot change. That check is Brent's: z is saved at steps 1, 2, 4,
 * 8, ... and the walk stops when z returns to within
 * {@link TRAP_CYCLE_TOLERANCE} of the saved one, which finds a cycle of any
 * length for one comparison a step. There is deliberately no cardioid shortcut:
 * the answer for an interior point is the closest approach over its orbit, not
 * the cap.
 * @param start - Point the orbit starts from (z0)
 * @param constant - Constant added at every step (c)
 * @param maxSteps - Most steps to walk
 * @param shape - Which trap the distance is to
 * @returns The least distance reached, or Infinity when no step was measured
 */
export function escapeTimeTrap(
  start: ComplexNumber,
  constant: ComplexNumber,
  maxSteps: number,
  shape: TrapShape,
): number {
  let real = start.real;
  let imaginary = start.imaginary;
  let savedReal = real;
  let savedImaginary = imaginary;
  let sinceSave = 0;
  let saveEvery = 1;
  let least = Infinity;

  for (let steps = 0; steps < maxSteps; steps++) {
    const squaredReal = real * real - imaginary * imaginary;
    const squaredImaginary = 2 * real * imaginary;
    real = squaredReal + constant.real;
    imaginary = squaredImaginary + constant.imaginary;

    const key = trapKey(shape, real, imaginary);
    if (key < least) least = key;

    if (real * real + imaginary * imaginary > 4) break;

    if (
      Math.abs(real - savedReal) < TRAP_CYCLE_TOLERANCE &&
      Math.abs(imaginary - savedImaginary) < TRAP_CYCLE_TOLERANCE
    ) {
      break;
    }
    if (++sinceSave === saveEvery) {
      savedReal = real;
      savedImaginary = imaginary;
      saveEvery *= 2;
      sinceSave = 0;
    }
  }

  return trapKeyToDistance(shape, least);
}

/**
 * Whether a point lies inside the two components of the set whose orbits are
 * known in closed form: the main cardioid and the period-2 bulb.
 *
 * A point in either is in the set, so its orbit never escapes and the loop
 * would run the entire cap only to report `maxIterations`. Interior pixels are
 * the whole cost of a view framed on the set — the live example is a deep zoom
 * into the cardioid taking minutes — and this is the answer those pixels were
 * already getting, reached without the orbit.
 *
 * The inequalities are strict on purpose: a point on a boundary is not claimed
 * here, so it goes to the loop and gets whatever count it always got.
 * @param c - Complex number representing the point to test
 * @returns True when the point is strictly inside the cardioid or the bulb
 */
export function isInMainBulbs(c: ComplexNumber): boolean {
  const x = c.real;
  const y = c.imaginary;

  // Main cardioid: q = (x - 1/4)^2 + y^2, and the point is inside when
  // q * (q + (x - 1/4)) < y^2 / 4.
  const offsetReal = x - 0.25;
  const q = offsetReal * offsetReal + y * y;
  if (q * (q + offsetReal) < (y * y) / 4) {
    return true;
  }

  // Period-2 bulb: the disk of radius 1/4 around -1.
  const bulbReal = x + 1;
  return bulbReal * bulbReal + y * y < 1 / 16;
}

/**
 * Calculate the number of iterations for a point in the Mandelbrot set
 *
 * The interior shortcut belongs here rather than in the loop: the orbit this
 * covers starts at z = 0, and that is the one thing about the point the
 * Mandelbrot set is defined from that a Julia kind changes.
 * @param c - Complex number representing the point to test
 * @param maxIterations - Maximum number of iterations to perform
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
export function mandelbrotIterations(
  c: ComplexNumber,
  maxIterations: number,
): number {
  if (isInMainBulbs(c)) {
    return maxIterations;
  }

  return escapeTimeIterations(ORIGIN, c, maxIterations, false);
}

/**
 * Calculate the smooth iteration count for better color gradients
 *
 * The interior shortcut returns `maxIterations` here too: an orbit that never
 * escapes is the one case the smoothing has nothing to add to, and it reports
 * the cap unchanged, so the shortcut is the same number.
 * @param c - Complex number representing the point to test
 * @param maxIterations - Maximum number of iterations to perform
 * @returns Smooth iteration count as a float
 */
export function smoothMandelbrotIterations(
  c: ComplexNumber,
  maxIterations: number,
): number {
  if (isInMainBulbs(c)) {
    return maxIterations;
  }

  return escapeTimeIterations(ORIGIN, c, maxIterations, true);
}

/**
 * The Mandelbrot set as a {@link FractalKind}: the orbit starts at z = 0, so
 * the point the renderer hands over is the constant c it is added to.
 *
 * A delegation, not a rewrite: the two functions above stay the definition of
 * the formula, and this is what puts them behind the interface the renderer
 * calls.
 */
export const mandelbrotKind: FractalKind = {
  id: "mandelbrot",
  iterations(point, maxIterations, smooth) {
    return smooth
      ? smoothMandelbrotIterations(point, maxIterations)
      : mandelbrotIterations(point, maxIterations);
  },
  escapeInfo(point, maxIterations) {
    // The interior shortcut is a point in the set, so it is the same answer
    // the count gives: the cap, and no escape.
    const steps = mandelbrotIterations(point, maxIterations);

    return { steps, escaped: steps < maxIterations };
  },
  orbit(point, maxSteps) {
    // The shortcut is for the count, not for the path: a point in the cardioid
    // is inside the set and its orbit is a real one, so the plot walks it.
    return escapeTimeOrbit(ORIGIN, point, maxSteps);
  },
  trapDistance(point, maxIterations, trap) {
    // No cardioid shortcut, for the same reason `orbit` has none.
    return escapeTimeTrap(ORIGIN, point, maxIterations, trap);
  },
};

/**
 * Convert pixel coordinates to complex plane coordinates
 * @param pixelX - X coordinate in pixels
 * @param pixelY - Y coordinate in pixels
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param bounds - Fractal bounds in complex plane
 * @returns Complex number representing the point in the complex plane
 */
export function pixelToComplex(
  pixelX: number,
  pixelY: number,
  width: number,
  height: number,
  bounds: FractalBounds,
): ComplexNumber {
  const real =
    bounds.minReal + (pixelX / width) * (bounds.maxReal - bounds.minReal);
  const imaginary =
    bounds.minImaginary +
    (pixelY / height) * (bounds.maxImaginary - bounds.minImaginary);

  return { real, imaginary };
}

/**
 * Convert complex plane coordinates to pixel coordinates
 * @param complex - Complex number
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param bounds - Fractal bounds in complex plane
 * @returns Pixel coordinates
 */
export function complexToPixel(
  complex: ComplexNumber,
  width: number,
  height: number,
  bounds: FractalBounds,
): { x: number; y: number } {
  const x =
    ((complex.real - bounds.minReal) / (bounds.maxReal - bounds.minReal)) *
    width;
  const y =
    ((complex.imaginary - bounds.minImaginary) /
      (bounds.maxImaginary - bounds.minImaginary)) *
    height;

  return { x, y };
}

// Size of the un-zoomed Mandelbrot view in the complex plane: 4 x 3, the
// whole set and the 4:3 shape of a canvas. This is zoom 1, and every other
// zoom in the app is a division of it, so there is one answer to what a set of
// bounds means. The Overview preset frames exactly this span.
export const BASE_WIDTH = 4;
export const BASE_HEIGHT = 3;

// The zoom the explorer accepts: the full base view out to the deepest zoom
// the controls offer.
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 10000;

// The iteration budget the explorer offers. The Maximum Iterations slider spans
// exactly this range and steps by ITERATION_STEP, so the count autoIterations
// picks is always a value that slider can show and the thumb can sit on.
export const MIN_ITERATIONS = 50;
export const MAX_ITERATIONS = 1000;
export const ITERATION_STEP = 10;

// Where the count starts, and how much each doubling of the zoom adds. The
// detail a view can show grows with its magnification: 1x needs 100 iterations,
// 100x needs 430, 10000x needs 760. Without this a deep zoom runs out of
// iterations and paints one flat colour over the detail it is magnifying.
const BASE_ITERATIONS = 100;
const ITERATIONS_PER_OCTAVE = 50;

/**
 * Clamp a zoom into the range the explorer accepts.
 *
 * A floor and a ceiling, not a rounding: a zoom already inside the range
 * arrives unchanged, so the view a gesture produced is the view the readout
 * describes. Rounding here instead is how a wheel notch gets swallowed.
 * @param scale - Zoom to clamp
 * @returns The closest zoom the explorer will show
 */
export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/**
 * The iteration count a zoom needs, so a deep view keeps the detail the zoom is
 * magnifying instead of flattening into one colour, without the user touching
 * the slider.
 *
 * One more doubling of the zoom is one more octave of detail, so the count
 * grows with it and then lands on the slider's step, inside its range, which is
 * what keeps the computed count a value the control can show.
 * @param zoom - Zoom to pick a count for
 * @returns The iteration count for that zoom, a multiple of ITERATION_STEP
 * within MIN_ITERATIONS..MAX_ITERATIONS
 */
export function autoIterations(zoom: number): number {
  // A zoom that is not a positive number has no octave to count, and log2 of
  // it would put a NaN iteration count into the renderer.
  const scale = Number.isFinite(zoom) ? Math.max(zoom, MIN_ZOOM) : MIN_ZOOM;
  const iterations = BASE_ITERATIONS + ITERATIONS_PER_OCTAVE * Math.log2(scale);
  const onStep = Math.round(iterations / ITERATION_STEP) * ITERATION_STEP;

  return Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, onStep));
}

/**
 * Get default fractal bounds (classic Mandelbrot view)
 *
 * The view the explorer opens on: the whole set at zoom 1, which is what the
 * base constants describe.
 */
export function getDefaultBounds(): FractalBounds {
  return calculateZoomBounds(-0.75, 0, 1);
}

/**
 * Calculate zoom bounds around a center point
 * @param centerX - Center X coordinate in complex plane
 * @param centerY - Center Y coordinate in complex plane
 * @param zoomLevel - Zoom level (higher = more zoomed in)
 * @returns New fractal bounds
 */
export function calculateZoomBounds(
  centerX: number,
  centerY: number,
  zoomLevel: number,
): FractalBounds {
  const width = BASE_WIDTH / zoomLevel;
  const height = BASE_HEIGHT / zoomLevel;

  return {
    minReal: centerX - width / 2,
    maxReal: centerX + width / 2,
    minImaginary: centerY - height / 2,
    maxImaginary: centerY + height / 2,
  };
}

/**
 * Read the view back out of bounds: the inverse of calculateZoomBounds.
 *
 * The zoom is taken from the width, since the view keeps the base aspect
 * ratio whatever the canvas shape.
 * @param bounds - Fractal bounds to describe
 * @returns Center and zoom of the region the bounds cover
 */
export function boundsToView(bounds: FractalBounds): ZoomState {
  return {
    centerX: (bounds.minReal + bounds.maxReal) / 2,
    centerY: (bounds.minImaginary + bounds.maxImaginary) / 2,
    scale: BASE_WIDTH / (bounds.maxReal - bounds.minReal),
  };
}
