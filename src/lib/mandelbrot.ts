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

/**
 * Get default fractal bounds (classic Mandelbrot view)
 */
export function getDefaultBounds(): FractalBounds {
  return {
    minReal: -2.5,
    maxReal: 1.0,
    minImaginary: -1.25,
    maxImaginary: 1.25,
  };
}

// Size of the un-zoomed Mandelbrot view in the complex plane
export const BASE_WIDTH = 3.5;
export const BASE_HEIGHT = 2.5;

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
