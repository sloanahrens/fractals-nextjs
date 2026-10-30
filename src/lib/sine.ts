import type { ComplexNumber, FractalKind, TrapShape } from "../types/fractal";
import { TRAP_CYCLE_TOLERANCE, trapKey, trapKeyToDistance } from "./orbitTrap";

/**
 * How far from the real axis an orbit has to get before it is counted as
 * having run away: |Im z| above this ends the orbit.
 *
 * The Mandelbrot loop's radius of 2 is a theorem about squaring; this step has
 * no such radius, because the sine of a number with a large imaginary part is
 * about e^|Im z| / 2 across, so once an orbit is this far off the axis its next
 * step is roughly e^20 / 2 = 2.4e8 times c away from it and the orbit is gone
 * for good in practice (it could only come back by landing almost exactly on
 * a zero of cos, which an orbit that has just been flung that far does not).
 * It is the usual bailout for this map: the Fractint "sine" type uses 64;
 * 20 keeps `Math.exp` well inside the finite range, because the test is read
 * after every step and so no orbit ever hands `exp` more than 20 plus the one
 * step that left.
 */
export const SINE_ESCAPE_HEIGHT = 20;

/**
 * Where every orbit starts: pi / 2, the critical point of c sin(z) (the point
 * whose derivative, c cos(z), is zero). The first step lands on c itself,
 * since sin(pi / 2) = 1, so the picture is the set of c whose critical orbit
 * does not run away, exactly as the Mandelbrot set is for z -> z^2 + c.
 */
export const SINE_START = Math.PI / 2;

/**
 * The radius inside which a c never leaves, known in closed form.
 *
 * |sin z| <= sinh |z|, so a step from a point of modulus at most |c| lands at
 * modulus at most |c| sinh |c|, which is at most |c| exactly when sinh |c| <= 1,
 * that is |c| <= asinh(1) = 0.8813... The first step lands on c, so every point
 * of the orbit of such a c stays inside the disc of radius |c|, whose height
 * |Im z| is at most that, far under the limit: the orbit never leaves. (Inside
 * the disc the fixed point 0 attracts because its multiplier is c, and the set's
 * central disc runs on to |c| = 1; this is the part of it a two-line argument
 * covers.) Like the Mandelbrot set's cardioid, it answers the count at once and
 * leaves the orbit and the trap loops to walk, so the path the plot draws and
 * the closest approach are the real ones.
 */
export const SINE_INTERIOR_RADIUS = Math.asinh(1);

const SINE_INTERIOR_RADIUS_SQUARED =
  SINE_INTERIOR_RADIUS * SINE_INTERIOR_RADIUS;

/** cosh of the escape height: the most |sin z| can be across when |Im z| is at the height. */
const COSH_ESCAPE_HEIGHT = Math.cosh(SINE_ESCAPE_HEIGHT);

/**
 * The fractional part of the count for an orbit that has just left.
 *
 * The usual smooth count, n + 1 - log2(log2 |z|), is made for a step that
 * squares; here the step puts |Im z| through an exponential, so that formula
 * would not join up the bands. What does: an orbit whose last point sat below
 * the height (|Im z| <= H) lands, after one step, at most |c| cosh(H) up --
 * |Im (c sin z)| <= |c| |sin z| <= |c| cosh(Im z) -- and, having left, at least
 * H. So the size it left at, Y, lies in [H, |c| cosh(H)], and
 * ln(Y / H) / ln(|c| cosh(H) / H) runs from 0 to 1 across that range. An orbit
 * that left by a hair is counted as n + 1 (the band it would have joined had it
 * left a step later), one that jumped as far as it can as n, and the counts
 * agree across every band's edge instead of stepping.
 * @param iterations - The steps the orbit survived, the whole count
 * @param height - |Im z| after the step that left, which is above SINE_ESCAPE_HEIGHT
 * @param cMagnitude - |c|
 * @returns The smooth count, between iterations and iterations + 1
 */
function smoothCount(
  iterations: number,
  height: number,
  cMagnitude: number,
): number {
  const range = Math.log(
    (cMagnitude * COSH_ESCAPE_HEIGHT) / SINE_ESCAPE_HEIGHT,
  );
  if (!(range > 0)) return iterations + 1;

  const fraction = Math.log(height / SINE_ESCAPE_HEIGHT) / range;

  return iterations + 1 - Math.min(1, Math.max(0, fraction));
}

/**
 * Walk one sine orbit from z = pi / 2 and count the steps it survives.
 *
 * The step is z -> c sin(z), with sin(x + iy) = sin x cosh y + i cos x sinh y,
 * so the real and imaginary parts of the sine are
 *   s = sin x cosh y   and   t = cos x sinh y,
 * and the new point is (cx s - cy t) + i (cx t + cy s). cosh and sinh come
 * from the one exponential e^y, so a step costs one `exp`, one `sin` and one
 * `cos` and nothing else beyond arithmetic. The orbit ends the step it lands
 * with |Im z| above {@link SINE_ESCAPE_HEIGHT}; a point that ends is counted by
 * the steps it completed, as the Mandelbrot loop counts them, and a point that
 * never does returns the cap.
 *
 * The set is the same under c -> -c and under conjugation of c. sin is odd,
 * so the orbit of -c has the even-numbered points of the orbit of c and the
 * negatives of the odd-numbered ones; the heights |Im z| are the same, so the
 * two orbits leave on the same step. Conjugating c conjugates every point
 * (the start is real), and the height is unchanged. So the picture is
 * symmetric about both axes.
 * @param c - Point in the complex plane to test
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
function sineIterations(
  c: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): number {
  // The disc of radius asinh(1) is in the set by a two-line argument, and most
  // of the cost of a view framed on the set is its in-set pixels running the cap.
  if (
    c.real * c.real + c.imaginary * c.imaginary <
    SINE_INTERIOR_RADIUS_SQUARED
  ) {
    return maxIterations;
  }

  let real = SINE_START;
  let imaginary = 0;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    const up = Math.exp(imaginary);
    const down = 1 / up;
    const sineReal = (Math.sin(real) * (up + down)) / 2;
    const sineImaginary = (Math.cos(real) * (up - down)) / 2;
    real = c.real * sineReal - c.imaginary * sineImaginary;
    imaginary = c.real * sineImaginary + c.imaginary * sineReal;

    const height = Math.abs(imaginary);
    if (height > SINE_ESCAPE_HEIGHT) {
      if (!smooth) {
        return iterations;
      }

      return smoothCount(iterations, height, Math.hypot(c.real, c.imaginary));
    }
  }

  return maxIterations;
}

/**
 * The closest a sine orbit from z = pi / 2 comes to a trap shape: the count's
 * own loop with a running minimum kept in place of the count, allocating
 * nothing. Counts the points the orbit lands on (the start is not one),
 * including the one that left, and stops on the escape test, at the cap, or
 * when the orbit has closed on a cycle (Brent's check; see `escapeTimeTrap` in
 * mandelbrot.ts). The kind's `orbit` walk is the oracle that holds it to the
 * other copies of this loop (`trapDistance.test.ts`).
 * @param c - Point in the complex plane to test
 * @param maxIterations - Most steps to walk
 * @param shape - Which trap the distance is to
 * @returns The least distance reached, or Infinity when no step was measured
 */
function sineTrap(
  c: ComplexNumber,
  maxIterations: number,
  shape: TrapShape,
): number {
  let real = SINE_START;
  let imaginary = 0;
  let savedReal = SINE_START;
  let savedImaginary = 0;
  let sinceSave = 0;
  let saveEvery = 1;
  let least = Infinity;

  for (let steps = 0; steps < maxIterations; steps++) {
    const up = Math.exp(imaginary);
    const down = 1 / up;
    const sineReal = (Math.sin(real) * (up + down)) / 2;
    const sineImaginary = (Math.cos(real) * (up - down)) / 2;
    real = c.real * sineReal - c.imaginary * sineImaginary;
    imaginary = c.real * sineImaginary + c.imaginary * sineReal;

    const key = trapKey(shape, real, imaginary);
    if (key < least) least = key;

    if (Math.abs(imaginary) > SINE_ESCAPE_HEIGHT) break;

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
 * The sine set as a {@link FractalKind}: the point the renderer hands over is
 * the constant c in z -> c sin(z), and every orbit starts from the critical
 * point pi / 2.
 *
 * Like the Tricorn it is a single picture, so its id is all the picker has to
 * carry for it.
 */
export const sineKind: FractalKind = {
  id: "sine",
  iterations(point, maxIterations, smooth) {
    return sineIterations(point, maxIterations, smooth);
  },
  escapeInfo(point, maxIterations) {
    const steps = sineIterations(point, maxIterations, false);

    return { steps, escaped: steps < maxIterations };
  },
  trapDistance(point, maxIterations, trap) {
    return sineTrap(point, maxIterations, trap);
  },
  orbit(point, maxSteps) {
    // The count's own loop with the points kept, so the path the plot draws is
    // the path the colour was read from.
    const points: ComplexNumber[] = [{ real: SINE_START, imaginary: 0 }];
    let real = SINE_START;
    let imaginary = 0;

    for (let steps = 0; steps < maxSteps; steps++) {
      const up = Math.exp(imaginary);
      const down = 1 / up;
      const sineReal = (Math.sin(real) * (up + down)) / 2;
      const sineImaginary = (Math.cos(real) * (up - down)) / 2;
      real = point.real * sineReal - point.imaginary * sineImaginary;
      imaginary = point.real * sineImaginary + point.imaginary * sineReal;
      points.push({ real, imaginary });

      if (Math.abs(imaginary) > SINE_ESCAPE_HEIGHT) break;
    }

    return points;
  },
};
