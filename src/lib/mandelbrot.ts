import { ComplexNumber, FractalBounds, ZoomState } from "../types/fractal";

/**
 * Calculate the number of iterations for a point in the Mandelbrot set
 * @param c - Complex number representing the point to test
 * @param maxIterations - Maximum number of iterations to perform
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
export function mandelbrotIterations(
  c: ComplexNumber,
  maxIterations: number,
): number {
  let z: ComplexNumber = { real: 0, imaginary: 0 };
  let iterations = 0;

  while (iterations < maxIterations) {
    // Calculate z^2 + c
    const zSquared = complexSquare(z);
    z = complexAdd(zSquared, c);

    // Check if point has escaped (magnitude > 2)
    if (complexMagnitudeSquared(z) > 4) {
      break;
    }

    iterations++;
  }

  return iterations;
}

/**
 * Calculate the smooth iteration count for better color gradients
 * @param c - Complex number representing the point to test
 * @param maxIterations - Maximum number of iterations to perform
 * @returns Smooth iteration count as a float
 */
export function smoothMandelbrotIterations(
  c: ComplexNumber,
  maxIterations: number,
): number {
  let z: ComplexNumber = { real: 0, imaginary: 0 };
  let iterations = 0;

  while (iterations < maxIterations) {
    const zSquared = complexSquare(z);
    z = complexAdd(zSquared, c);

    const magnitudeSquared = complexMagnitudeSquared(z);
    if (magnitudeSquared > 4) {
      // Smooth iteration calculation for better color gradients
      const smoothIterations =
        iterations + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      return smoothIterations;
    }

    iterations++;
  }

  return maxIterations;
}

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

// Complex number utility functions
function complexSquare(z: ComplexNumber): ComplexNumber {
  return {
    real: z.real * z.real - z.imaginary * z.imaginary,
    imaginary: 2 * z.real * z.imaginary,
  };
}

function complexAdd(z1: ComplexNumber, z2: ComplexNumber): ComplexNumber {
  return {
    real: z1.real + z2.real,
    imaginary: z1.imaginary + z2.imaginary,
  };
}

function complexMagnitudeSquared(z: ComplexNumber): number {
  return z.real * z.real + z.imaginary * z.imaginary;
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
