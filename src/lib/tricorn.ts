import type { ComplexNumber, FractalKind } from "../types/fractal";

/**
 * Walk one Tricorn orbit from z = 0 and count the steps it survives.
 *
 * The Mandelbrot loop with the conjugate taken first: the step is
 * z -> conj(z)^2 + c, which is (Re z - i Im z)^2 + c. Everything around that
 * is the Mandelbrot convention step for step -- the orbit starts at 0, the
 * escape test is the same |z|^2 > 4 read after the step, a point that escapes
 * is counted by the steps it completed and the smoothing is the same formula
 * -- so a colour scheme looks the same on this fractal as on the others.
 *
 * Conjugating z leaves its modulus alone, and squaring doubles its argument,
 * so conj(z)^2 turns the argument by -2 instead of +2. The result is a set with
 * three-fold rotational symmetry (a turn of 120 degrees about the origin maps
 * the set onto itself) where the Mandelbrot set has a mirror symmetry. On the
 * real axis the conjugate changes nothing, so this kind counts exactly what the
 * Mandelbrot set counts there.
 * @param c - Point in the complex plane to test
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
function tricornIterations(
  c: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): number {
  let real = 0;
  let imaginary = 0;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    // The Tricorn's own step: square the conjugate, so the imaginary part of
    // the product changes sign against the Mandelbrot step, then add c.
    const squaredReal = real * real - imaginary * imaginary;
    const squaredImaginary = -2 * real * imaginary;
    real = squaredReal + c.real;
    imaginary = squaredImaginary + c.imaginary;

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
 * The Tricorn (the Mandelbar set) as a {@link FractalKind}: the point the
 * renderer hands over is the constant c the conjugated orbit is added to.
 *
 * Like the Burning Ship it is a single picture, so its id is all the picker has
 * to carry for it.
 */
export const tricornKind: FractalKind = {
  id: "tricorn",
  iterations(point, maxIterations, smooth) {
    return tricornIterations(point, maxIterations, smooth);
  },
};
