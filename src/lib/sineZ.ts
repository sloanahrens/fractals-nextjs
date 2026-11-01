import type { ComplexNumber, FractalKind, TrapShape } from "../types/fractal";
import { TRAP_CYCLE_TOLERANCE, trapKey, trapKeyToDistance } from "./orbitTrap";

/**
 * How far from the real axis an orbit has to get before it is counted as
 * having run away: |Im z| above this ends the orbit.
 *
 * Off the real axis sin z is about e^|Im z| / 2 across, so a point this far up
 * is flung roughly e^20 / 2 times |c| further on its next step and does not
 * come back in practice. It is the height Sine and Cosine use, and a bailout of
 * 10, 20 and 40 changes no in-set pixel on a 160 by 90 grid of c for the
 * principal branch (held by the tests). The test is read after every step, so
 * `Math.exp` is never handed more than 20 plus the one step that left.
 */
export const SINE_Z_ESCAPE_HEIGHT = 20;

/**
 * The step z -> c sin z + z has slope c cos z + 1, which is zero where
 * cos z = -1/c, so its critical points are arccos(-1/c) and every point that
 * differs from one by a multiple of 2 pi, or by a sign. arccos has infinitely
 * many branches and each critical point starts an orbit, but the map is odd and
 * f(z + 2 pi) = f(z) + 2 pi, so every other critical point's orbit is the
 * negative of this one, or this one shifted along the real axis by a multiple
 * of 2 pi. The escape test reads |Im z| only, so every branch gives the same
 * picture (measured at the opening frame and at one deep view on fr-p5cv, where
 * the pixel counts differed by 0.01 to 0.08 percent: floating-point noise in a
 * chaotic map). The start is the principal branch, the complex arccos whose
 * real part lies in [0, pi].
 */

/** The principal square root, with a negative real number given the positive imaginary root. */
function squareRoot(real: number, imaginary: number): ComplexNumber {
  const modulus = Math.hypot(real, imaginary);
  const root = Math.sqrt((modulus + real) / 2);
  const other = Math.sqrt((modulus - real) / 2);

  return { real: root, imaginary: imaginary < 0 ? -other : other };
}

/**
 * The critical point the orbit starts from: arccos(-1/c) with its real part in [0, pi].
 *
 * With w = -1/c, arccos w = -i ln(w + i sqrt(1 - w^2)), the principal square
 * root and logarithm. Writing q for the thing inside the logarithm,
 * q (w - i sqrt(1 - w^2)) = 1, so whichever of the two is the larger in
 * modulus is the one with no cancellation in it; the logarithm of the smaller
 * is minus the logarithm of the larger. That keeps the height of the start
 * right when c is small and w is huge.
 *
 * A real c with |c| >= 1 has a real start, acos(-1/c) exactly, so its orbit
 * stays on the real axis (the imaginary part is exactly 0, not a rounding
 * away from it, which a repelling real orbit would grow). Where c is 0 the start
 * is infinite and the result is not finite: the caller answers the cap.
 * @param c - The constant of the map
 * @returns The start, whose parts are not finite when it has none
 */
export function sineZStart(c: ComplexNumber): ComplexNumber {
  if (c.imaginary === 0 && Math.abs(c.real) >= 1) {
    return { real: Math.acos(-1 / c.real), imaginary: 0 };
  }

  const squared = c.real * c.real + c.imaginary * c.imaginary;
  const wReal = -c.real / squared;
  const wImaginary = c.imaginary / squared;

  // 1 - w^2
  const root = squareRoot(
    1 - (wReal * wReal - wImaginary * wImaginary),
    -2 * wReal * wImaginary,
  );
  // w + i root and w - i root
  const plusReal = wReal - root.imaginary;
  const plusImaginary = wImaginary + root.real;
  const minusReal = wReal + root.imaginary;
  const minusImaginary = wImaginary - root.real;

  const plus = Math.hypot(plusReal, plusImaginary);
  const minus = Math.hypot(minusReal, minusImaginary);

  if (plus >= minus) {
    return {
      real: Math.atan2(plusImaginary, plusReal),
      imaginary: -Math.log(plus),
    };
  }

  return {
    real: -Math.atan2(minusImaginary, minusReal),
    imaginary: Math.log(minus),
  };
}

/** cosh of the escape height: the most cosh(Im z) can be when |Im z| is at the height. */
const COSH_ESCAPE_HEIGHT = Math.cosh(SINE_Z_ESCAPE_HEIGHT);

/**
 * The fractional part of the count for an orbit that has just left.
 *
 * The usual smooth count is made for a step that squares; here the step puts
 * |Im z| through an exponential, so it would not join up the bands. What does:
 * an orbit whose last point sat at or below the height H lands, after one step,
 * at |Im (c sin z + z)| <= |c| |sin z| + |Im z| <= |c| cosh(Im z) + |Im z|
 * <= |c| cosh(H) + H, since |sin (x + iy)| <= cosh y. Having left, it is at
 * least H. So the height Y it left at lies in [H, |c| cosh(H) + H], and
 * ln(Y / H) / ln((|c| cosh(H) + H) / H) runs from 0 to 1 across that range. An
 * orbit that left by a hair counts as n + 1, one that jumped as far as it can
 * as n. The range is positive for every c other than 0, whose orbit never
 * leaves; if it is not (or the height is infinite) the answer is the near or
 * far end instead of a NaN. The clamp keeps the fraction in [0, 1] whatever
 * rounding does and is reached only by a call outside the formula's domain.
 * @param iterations - The steps the orbit survived, the whole count
 * @param height - |Im z| after the step that left, which is above SINE_Z_ESCAPE_HEIGHT
 * @param cMagnitude - |c|
 * @returns The smooth count, between iterations and iterations + 1
 */
export function smoothCount(
  iterations: number,
  height: number,
  cMagnitude: number,
): number {
  const range = Math.log(
    (cMagnitude * COSH_ESCAPE_HEIGHT + SINE_Z_ESCAPE_HEIGHT) /
      SINE_Z_ESCAPE_HEIGHT,
  );
  if (!(range > 0)) return iterations + 1;
  if (!Number.isFinite(range) || !Number.isFinite(height)) return iterations;

  const fraction = Math.log(height / SINE_Z_ESCAPE_HEIGHT) / range;

  return iterations + 1 - Math.min(1, Math.max(0, fraction));
}

/**
 * Where an orbit for this c begins, or null when there is no orbit to walk.
 *
 * There is none for c = 0 (the map is the identity and has no critical point),
 * for a c that is not finite, and for a c so small that the critical point
 * starts above the escape height. Those are answered as in the set, the cap,
 * with no NaN; the last is a disc of radius about 4e-9 round the origin.
 */
function startFor(c: ComplexNumber): ComplexNumber | null {
  if (c.real === 0 && c.imaginary === 0) return null;
  if (!Number.isFinite(c.real) || !Number.isFinite(c.imaginary)) return null;

  const start = sineZStart(c);
  if (!Number.isFinite(start.real) || !Number.isFinite(start.imaginary)) {
    return null;
  }
  if (Math.abs(start.imaginary) > SINE_Z_ESCAPE_HEIGHT) return null;

  return start;
}

/**
 * Walk one orbit of z -> c sin z + z from its critical point and count the
 * steps it survives.
 *
 * sin(x + iy) = sin x cosh y + i cos x sinh y, so with s = sin x cosh y and
 * t = cos x sinh y the new point is (cx s - cy t + x) + i (cx t + cy s + y).
 * cosh and sinh come from the one exponential e^y, so a step costs one `exp`,
 * one `sin` and one `cos`. The orbit ends the step it lands with |Im z| above
 * {@link SINE_Z_ESCAPE_HEIGHT}; a point that ends is counted by the steps it
 * completed, as the Mandelbrot loop counts them, and one that never does
 * returns the cap.
 *
 * The map is odd, so the orbit of -c from -z is the negative of the orbit of c,
 * but the start arccos(-1/c) is not negated by c -> -c (that changes the
 * critical point to arccos(1/c) = pi - arccos(-1/c)), so no symmetry of the
 * picture is claimed here beyond conjugation, which is tested.
 * @param c - Point in the complex plane to test
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
function sineZIterations(
  c: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): number {
  const start = startFor(c);
  if (start === null) return maxIterations;

  let real = start.real;
  let imaginary = start.imaginary;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    const up = Math.exp(imaginary);
    const down = 1 / up;
    const sineReal = (Math.sin(real) * (up + down)) / 2;
    const sineImaginary = (Math.cos(real) * (up - down)) / 2;
    real = c.real * sineReal - c.imaginary * sineImaginary + real;
    imaginary = c.real * sineImaginary + c.imaginary * sineReal + imaginary;

    const height = Math.abs(imaginary);
    if (height > SINE_Z_ESCAPE_HEIGHT) {
      if (!smooth) {
        return iterations;
      }

      return smoothCount(iterations, height, Math.hypot(c.real, c.imaginary));
    }
  }

  return maxIterations;
}

/**
 * The closest an orbit comes to a trap shape: the count's own loop with a
 * running minimum kept in place of the count, allocating nothing. Counts the
 * points the orbit lands on (the start is not one), including the one that
 * left, and stops on the escape test, at the cap, or when the orbit has closed
 * on a cycle (Brent's check; see `escapeTimeTrap` in mandelbrot.ts). The
 * kind's `orbit` walk is the oracle that holds it to the other copies of this
 * loop.
 * @param c - Point in the complex plane to test
 * @param maxIterations - Most steps to walk
 * @param shape - Which trap the distance is to
 * @returns The least distance reached, or Infinity when no step was measured
 */
function sineZTrap(
  c: ComplexNumber,
  maxIterations: number,
  shape: TrapShape,
): number {
  const start = startFor(c);
  if (start === null) return trapKeyToDistance(shape, Infinity);

  let real = start.real;
  let imaginary = start.imaginary;
  let savedReal = real;
  let savedImaginary = imaginary;
  let sinceSave = 0;
  let saveEvery = 1;
  let least = Infinity;

  for (let steps = 0; steps < maxIterations; steps++) {
    const up = Math.exp(imaginary);
    const down = 1 / up;
    const sineReal = (Math.sin(real) * (up + down)) / 2;
    const sineImaginary = (Math.cos(real) * (up - down)) / 2;
    real = c.real * sineReal - c.imaginary * sineImaginary + real;
    imaginary = c.real * sineImaginary + c.imaginary * sineReal + imaginary;

    const key = trapKey(shape, real, imaginary);
    if (key < least) least = key;

    if (Math.abs(imaginary) > SINE_Z_ESCAPE_HEIGHT) break;

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
 * The sin z + z set as a {@link FractalKind}: the point the renderer hands over
 * is the constant c in z -> c sin z + z, and every orbit starts from the
 * critical point arccos(-1/c) on the principal branch.
 *
 * A single picture, so its id is all the picker has to carry for it.
 */
export const sineZKind: FractalKind = {
  id: "sine-plus-z",
  iterations(point, maxIterations, smooth) {
    return sineZIterations(point, maxIterations, smooth);
  },
  escapeInfo(point, maxIterations) {
    const steps = sineZIterations(point, maxIterations, false);

    return { steps, escaped: steps < maxIterations };
  },
  trapDistance(point, maxIterations, trap) {
    return sineZTrap(point, maxIterations, trap);
  },
  orbit(point, maxSteps) {
    // The count's own loop with the points kept, so the path the plot draws is
    // the path the colour was read from. A c with no orbit to walk (see
    // startFor) draws only the origin.
    const start = startFor(point);
    if (start === null) return [{ real: 0, imaginary: 0 }];

    const points: ComplexNumber[] = [
      { real: start.real, imaginary: start.imaginary },
    ];
    let real = start.real;
    let imaginary = start.imaginary;

    for (let steps = 0; steps < maxSteps; steps++) {
      const up = Math.exp(imaginary);
      const down = 1 / up;
      const sineReal = (Math.sin(real) * (up + down)) / 2;
      const sineImaginary = (Math.cos(real) * (up - down)) / 2;
      real = point.real * sineReal - point.imaginary * sineImaginary + real;
      imaginary =
        point.real * sineImaginary + point.imaginary * sineReal + imaginary;
      points.push({ real, imaginary });

      if (Math.abs(imaginary) > SINE_Z_ESCAPE_HEIGHT) break;
    }

    return points;
  },
};
