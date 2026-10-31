import type { ComplexNumber, FractalKind, TrapShape } from "../types/fractal";
import { TRAP_CYCLE_TOLERANCE, trapKey, trapKeyToDistance } from "./orbitTrap";

/**
 * How far the imaginary part of a point's square has to get before the orbit is
 * counted as having run away: |Im(z^2)| = |2xy| above this ends the orbit.
 *
 * The map's own radius of 2 is not a theorem here, as it is not for Sine: the
 * sine of a point with a large imaginary part is about e^|Im| / 2 across, so a
 * step taken from a point whose square is 20 up is already about e^20 / 2 =
 * 2.4e8 times c away from it. Reading the height after every step is also what
 * keeps `exp` finite: only a point whose square was at most 20 up is ever
 * handed to it, so it is never asked for more than e^20.
 */
export const SINE_SQUARED_ESCAPE_HEIGHT = 20;

/**
 * Where every orbit starts: sqrt(pi / 2), a critical point of z -> c sin(z^2).
 *
 * The derivative is 2 z c cos(z^2), zero wherever z^2 is a zero of the cosine,
 * and at z^2 = pi / 2 the cosine is 0. There sin(z^2) = 1, so the first step
 * lands on c itself and the picture is read like the Mandelbrot set's, whose
 * first step also lands on c. (Every zero of the cosine is a critical point;
 * this is the one whose first step lands on c.)
 */
export const SINE_SQUARED_START = Math.sqrt(Math.PI / 2);

/** cosh of the escape height: the most |sin(z^2)| can be across when its height is at the limit. */
const COSH_ESCAPE_HEIGHT = Math.cosh(SINE_SQUARED_ESCAPE_HEIGHT);

/**
 * ln(cosh(20)) and ln(20), kept for the smooth count, which works in logs so
 * that a |c| larger than the square root of the largest double is still a large
 * number and not an infinity dividing by another.
 */
const LOG_COSH_ESCAPE_HEIGHT = Math.log(COSH_ESCAPE_HEIGHT);
const LOG_ESCAPE_HEIGHT = Math.log(SINE_SQUARED_ESCAPE_HEIGHT);

/**
 * The fractional part of the count for an orbit that has just left.
 *
 * The squaring formula n + 1 - log2(log2 |z|) would not join up the bands: a
 * step here squares and then takes a sine, so the size the next point leaves at
 * is set by the exponential in the sine. What does join them: the point before
 * the leaving step had |Im(z^2)| <= H, so |sin(z^2)| <= cosh(H) and the point it
 * landed on has |Im(z^2)| <= |z|^2 <= |c|^2 cosh(H)^2 = M. The size it left at,
 * Y, therefore lies in [H, M], and ln(Y / H) / ln(M / H) runs from 0 to 1 across
 * that range. An orbit that left by a hair is counted as n + 1, the band it
 * would have joined had it left a step later, and one that jumped as far as it
 * can as n, so the count meets the whole step at both edges of the band.
 *
 * The clamp is the formula's, and it also keeps the answer finite: a height past
 * the largest double gives a fraction of Infinity, which counts as the whole
 * step, and a c so large that its magnitude overflows gives NaN, which counts as
 * the next one rather than poisoning the count.
 * @param iterations - The steps the orbit survived, the whole count
 * @param height - |Im(z^2)| after the step that left, above SINE_SQUARED_ESCAPE_HEIGHT
 * @param cMagnitude - |c|
 * @returns The smooth count, between iterations and iterations + 1
 */
function smoothCount(
  iterations: number,
  height: number,
  cMagnitude: number,
): number {
  const range =
    2 * Math.log(cMagnitude) +
    2 * LOG_COSH_ESCAPE_HEIGHT -
    LOG_ESCAPE_HEIGHT;
  const fraction = Math.log(height / SINE_SQUARED_ESCAPE_HEIGHT) / range;
  const clamped = Math.min(1, Math.max(0, fraction));

  return iterations + 1 - (Number.isFinite(clamped) ? clamped : 0);
}

/**
 * Walk one orbit of z -> c sin(z^2) from z = sqrt(pi / 2) and count its steps.
 *
 * The step squares the point, w = z^2 = (x^2 - y^2) + i(2xy), takes the sine
 * with sin(a + bi) = sin a cosh b + i cos a sinh b, and multiplies by c. cosh
 * and sinh come from the one exponential e^b, so a step costs one `exp`, one
 * `sin` and one `cos`. The orbit ends on the step whose landing point has
 * |Im(z^2)| above {@link SINE_SQUARED_ESCAPE_HEIGHT}; that point is counted by
 * the steps completed before it, as the Mandelbrot loop counts, and a point that
 * never ends returns the cap.
 *
 * Both axes are in the set. A real c keeps the orbit real: the square of a real
 * point is real, its sine is real, and c times a real number is real, so 2xy is
 * zero at every step. An imaginary c keeps the orbit imaginary: c = iy makes the
 * square of an imaginary point real, so its sine is real and c times a real
 * number is imaginary, and 2xy is zero again. An orbit that starts at a real
 * point therefore never leaves when c is on either axis.
 *
 * The set is symmetric about both axes. The orbit of -c is the negative of the
 * orbit of c from the first step on (the start is real, and if the square of a
 * point is unchanged by negating it, so is the next point), and |2xy| is
 * unchanged, so the two leave on the same step. Conjugating c conjugates every
 * point, and the height is unchanged again.
 * @param c - Point in the complex plane to test
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
function sineSquaredIterations(
  c: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): number {
  let real = SINE_SQUARED_START;
  let imaginary = 0;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    const squaredReal = real * real - imaginary * imaginary;
    const squaredImaginary = 2 * real * imaginary;

    const up = Math.exp(squaredImaginary);
    const down = 1 / up;
    const sineReal = (Math.sin(squaredReal) * (up + down)) / 2;
    const sineImaginary = (Math.cos(squaredReal) * (up - down)) / 2;

    real = c.real * sineReal - c.imaginary * sineImaginary;
    imaginary = c.real * sineImaginary + c.imaginary * sineReal;

    const height = Math.abs(2 * real * imaginary);
    if (height > SINE_SQUARED_ESCAPE_HEIGHT) {
      if (!smooth) {
        return iterations;
      }

      return smoothCount(iterations, height, Math.hypot(c.real, c.imaginary));
    }
  }

  return maxIterations;
}

/**
 * The closest an orbit of z -> c sin(z^2) comes to a trap shape: the count's own
 * loop with a running minimum kept in place of the count, allocating nothing.
 * Counts the points the orbit lands on (the start is not one), including the one
 * that left, and stops on the escape test, at the cap, or when the orbit has
 * closed on a cycle (Brent's check; see `escapeTimeTrap` in mandelbrot.ts). The
 * kind's `orbit` walk is the oracle that holds it to the other copies of this
 * loop.
 * @param c - Point in the complex plane to test
 * @param maxIterations - Most steps to walk
 * @param shape - Which trap the distance is to
 * @returns The least distance reached, or Infinity when no step was measured
 */
function sineSquaredTrap(
  c: ComplexNumber,
  maxIterations: number,
  shape: TrapShape,
): number {
  let real = SINE_SQUARED_START;
  let imaginary = 0;
  let savedReal = SINE_SQUARED_START;
  let savedImaginary = 0;
  let sinceSave = 0;
  let saveEvery = 1;
  let least = Infinity;

  for (let steps = 0; steps < maxIterations; steps++) {
    const squaredReal = real * real - imaginary * imaginary;
    const squaredImaginary = 2 * real * imaginary;

    const up = Math.exp(squaredImaginary);
    const down = 1 / up;
    const sineReal = (Math.sin(squaredReal) * (up + down)) / 2;
    const sineImaginary = (Math.cos(squaredReal) * (up - down)) / 2;

    real = c.real * sineReal - c.imaginary * sineImaginary;
    imaginary = c.real * sineImaginary + c.imaginary * sineReal;

    const key = trapKey(shape, real, imaginary);
    if (key < least) least = key;

    if (Math.abs(2 * real * imaginary) > SINE_SQUARED_ESCAPE_HEIGHT) break;

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
 * The Sine of z squared set as a {@link FractalKind}: the point the renderer
 * hands over is the constant c in z -> c sin(z^2), and every orbit starts from
 * the critical point sqrt(pi / 2).
 *
 * Like Sine it is a single picture, so its id is all the picker has to carry for
 * it. It is not registered in the picker yet; the kind is here for the bead that
 * comes after this one.
 */
export const sineSquaredKind: FractalKind = {
  id: "sin-z-squared",
  iterations(point, maxIterations, smooth) {
    return sineSquaredIterations(point, maxIterations, smooth);
  },
  escapeInfo(point, maxIterations) {
    const steps = sineSquaredIterations(point, maxIterations, false);

    return { steps, escaped: steps < maxIterations };
  },
  trapDistance(point, maxIterations, trap) {
    return sineSquaredTrap(point, maxIterations, trap);
  },
  orbit(point, maxSteps) {
    // The count's own loop with the points kept, so the path the plot draws is
    // the path the colour was read from.
    const points: ComplexNumber[] = [{ real: SINE_SQUARED_START, imaginary: 0 }];
    let real = SINE_SQUARED_START;
    let imaginary = 0;

    for (let steps = 0; steps < maxSteps; steps++) {
      const squaredReal = real * real - imaginary * imaginary;
      const squaredImaginary = 2 * real * imaginary;

      const up = Math.exp(squaredImaginary);
      const down = 1 / up;
      const sineReal = (Math.sin(squaredReal) * (up + down)) / 2;
      const sineImaginary = (Math.cos(squaredReal) * (up - down)) / 2;

      real = point.real * sineReal - point.imaginary * sineImaginary;
      imaginary = point.real * sineImaginary + point.imaginary * sineReal;
      points.push({ real, imaginary });

      if (Math.abs(2 * real * imaginary) > SINE_SQUARED_ESCAPE_HEIGHT) break;
    }

    return points;
  },
};
