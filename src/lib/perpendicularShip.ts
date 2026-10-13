import type { ComplexNumber, FractalKind, TrapShape } from "../types/fractal";
import { TRAP_CYCLE_TOLERANCE, trapKey, trapKeyToDistance } from "./orbitTrap";

/**
 * Walk one Perpendicular Ship orbit from z = 0 and count the steps it survives.
 *
 * The Mandelbrot loop with one fold, on the imaginary part of the step only:
 * x' = x^2 - y^2 + cx and y' = -2 |x| y + cy. The real part is the Mandelbrot
 * step unchanged -- no absolute value is taken of x itself, so the plane's left
 * half is not folded onto its right -- while the imaginary part squares the
 * *size* of x against the sign of y, which is where the name comes from: the
 * two folds of the Burning Ship are at right angles to each other rather than
 * both along the axes. Everything around that is the Mandelbrot convention step
 * for step -- the orbit starts at 0, the escape test is the same |z|^2 > 4 read
 * after the step, a point that escapes is counted by the steps it completed and
 * the smoothing is the same formula -- so a colour scheme looks the same on
 * this fractal as on the others.
 *
 * Both x^2 and |x| are even in x, so a step's result does not depend on the
 * sign of x at all: the orbit of c and the orbit of any c' that reaches the
 * same magnitudes goes the same way. Conjugating every point of an orbit turns
 * -2 |x| y into -2 |x| (-y) while x^2 - y^2 is unchanged, so conjugating c
 * conjugates the orbit and the set keeps the mirror symmetry about the real
 * axis. On the real axis y stays 0 and the fold changes nothing, so this kind
 * counts exactly what the Mandelbrot set counts there.
 * @param c - Point in the complex plane to test
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
function perpendicularShipIterations(
  c: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): number {
  let real = 0;
  let imaginary = 0;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    // The ship's own step: the Mandelbrot square on the real part, and the
    // square of x's size against y on the imaginary part, then add c.
    const squaredReal = real * real - imaginary * imaginary;
    const squaredImaginary = -2 * Math.abs(real) * imaginary;
    real = squaredReal + c.real;
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
 * The closest a Perpendicular Ship orbit from z = 0 comes to a trap shape: the count's
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
function perpendicularShipTrap(
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
    const squaredReal = real * real - imaginary * imaginary;
    const squaredImaginary = -2 * Math.abs(real) * imaginary;
    real = squaredReal + c.real;
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
 * The Perpendicular Ship as a {@link FractalKind}: the point the renderer hands
 * over is the constant c the folded orbit is added to.
 *
 * Like the Burning Ship it is a single picture, so its id is all the picker has
 * to carry for it.
 */
export const perpendicularShipKind: FractalKind = {
  id: "perpendicular-ship",
  iterations(point, maxIterations, smooth) {
    return perpendicularShipIterations(point, maxIterations, smooth);
  },
  escapeInfo(point, maxIterations) {
    const steps = perpendicularShipIterations(point, maxIterations, false);

    return { steps, escaped: steps < maxIterations };
  },
  trapDistance(point, maxIterations, trap) {
    return perpendicularShipTrap(point, maxIterations, trap);
  },
  orbit(point, maxSteps) {
    // The count's own loop with the points kept, so the path the plot draws is
    // the path the colour was read from.
    const points: ComplexNumber[] = [{ real: 0, imaginary: 0 }];
    let real = 0;
    let imaginary = 0;

    for (let steps = 0; steps < maxSteps; steps++) {
      const squaredReal = real * real - imaginary * imaginary;
      const squaredImaginary = -2 * Math.abs(real) * imaginary;
      real = squaredReal + point.real;
      imaginary = squaredImaginary + point.imaginary;
      points.push({ real, imaginary });

      if (real * real + imaginary * imaginary > 4) break;
    }

    return points;
  },
};
