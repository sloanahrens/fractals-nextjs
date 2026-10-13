import type { ComplexNumber, FractalKind, TrapShape } from "../types/fractal";
import { TRAP_CYCLE_TOLERANCE, trapKey, trapKeyToDistance } from "./orbitTrap";

/**
 * Walk one Celtic Mandelbrot orbit from z = 0 and count the steps it survives.
 *
 * The Mandelbrot loop with the real part of the square folded onto the
 * positive side: the step is z -> (|Re(z^2)| + i Im(z^2)) + c, that is
 * x' = |x^2 - y^2| + cx and y' = 2xy + cy. Everything around that is the
 * Mandelbrot convention step for step -- the orbit starts at 0, the escape
 * test is the same |z|^2 > 4 read after the step, a point that escapes is
 * counted by the steps it completed and the smoothing is the same formula --
 * so a colour scheme looks the same on this fractal as on the others.
 *
 * The fold leaves the imaginary part alone, so conjugating c conjugates every
 * point of the orbit and the set keeps the Mandelbrot set's mirror symmetry
 * about the real axis. On the real axis y stays 0 and |x^2| is x^2, so this
 * kind counts exactly what the Mandelbrot set counts there.
 * @param c - Point in the complex plane to test
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
function celticIterations(
  c: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): number {
  let real = 0;
  let imaginary = 0;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    // The Celtic step: the Mandelbrot square with the real part of the product
    // made positive, then add c.
    const foldedReal = Math.abs(real * real - imaginary * imaginary);
    const squaredImaginary = 2 * real * imaginary;
    real = foldedReal + c.real;
    imaginary = squaredImaginary + c.imaginary;

    const magnitudeSquared = real * real + imaginary * imaginary;
    if (magnitudeSquared > 4) {
      if (!smooth) {
        return iterations;
      }

      const smoothIterations =
        iterations + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      return smoothIterations;
    }
  }

  return maxIterations;
}

/**
 * The closest a Celtic Mandelbrot orbit from z = 0 comes to a trap shape: the count's
 * own loop with a running minimum kept in place of the count, allocating
 * nothing. Counts the points the orbit lands on (the start is not one),
 * including the one that left the radius, and stops on the escape test, at the
 * cap, or when the orbit has closed on a cycle (Brent's check; see
 * `escapeTimeTrap` in mandelbrot.ts). The kind's `orbit` walk is the oracle
 * that holds it to the other copies of this loop (`trapDistance.test.ts`).
 * @param c - Point in the complex plane to test
 * @param maxIterations - Most steps to walk
 * @param shape - Which trap the distance is to
 * @returns The least distance reached, or Infinity when no step was measured
 */
function celticTrap(
  c: ComplexNumber,
  maxIterations: number,
  shape: TrapShape,
): number {
  let real = 0;
  let imaginary = 0;
  let savedReal = 0;
  let savedImaginary = 0;
  let sinceSave = 0;
  let saveEvery = 1;
  let least = Infinity;

  for (let steps = 0; steps < maxIterations; steps++) {
    const foldedReal = Math.abs(real * real - imaginary * imaginary);
    const squaredImaginary = 2 * real * imaginary;
    real = foldedReal + c.real;
    imaginary = squaredImaginary + c.imaginary;

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
 * The Celtic Mandelbrot set as a {@link FractalKind}: the point the renderer
 * hands over is the constant c the folded orbit is added to.
 *
 * Like the Tricorn it is a single picture, so its id is all the picker has to
 * carry for it.
 */
export const celticKind: FractalKind = {
  id: "celtic",
  iterations(point, maxIterations, smooth) {
    return celticIterations(point, maxIterations, smooth);
  },
  escapeInfo(point, maxIterations) {
    const steps = celticIterations(point, maxIterations, false);

    return { steps, escaped: steps < maxIterations };
  },
  trapDistance(point, maxIterations, trap) {
    return celticTrap(point, maxIterations, trap);
  },
  orbit(point, maxSteps) {
    // The count's own loop with the points kept, so the path the plot draws is
    // the path the colour was read from.
    const points: ComplexNumber[] = [{ real: 0, imaginary: 0 }];
    let real = 0;
    let imaginary = 0;

    for (let steps = 0; steps < maxSteps; steps++) {
      const foldedReal = Math.abs(real * real - imaginary * imaginary);
      const squaredImaginary = 2 * real * imaginary;
      real = foldedReal + point.real;
      imaginary = squaredImaginary + point.imaginary;
      points.push({ real, imaginary });

      if (real * real + imaginary * imaginary > 4) break;
    }

    return points;
  },
};
