import type { ComplexNumber, FractalKind, TrapShape } from "../types/fractal";
import { TRAP_CYCLE_TOLERANCE, trapKey, trapKeyToDistance } from "./orbitTrap";

/**
 * How far from the real axis an orbit has to get before it is counted as
 * having run away: |Im z| above this ends the orbit.
 *
 * The step z -> c cos(z) has no radius of escape the way squaring has, because
 * cos of a number with a large imaginary part is about e^|Im z| / 2 across, so
 * once an orbit is this far off the axis its next step is roughly
 * e^20 / 2 = 2.4e8 times c away from it and the orbit is gone for good in
 * practice (it could only come back by landing almost exactly on a zero of cos,
 * which an orbit that has just been flung that far does not). It is the same
 * height Sine uses, and moving it to 10 or 40 changes no in-set pixel on a
 * grid. It also keeps `Math.exp` well inside the finite range: the test is read
 * after every step, so no orbit ever hands `exp` more than 20 plus the one step
 * that left.
 */
export const COSINE_ESCAPE_HEIGHT = 20;

/**
 * Where every orbit starts: 0, the critical point of c cos(z) (the point whose
 * derivative, -c sin(z), is zero). The first step lands on c itself, since
 * cos(0) = 1, so the picture is the set of c whose critical orbit does not run
 * away, exactly as the Mandelbrot set is for z -> z^2 + c.
 */
export const COSINE_START = 0;

/**
 * The radius r at which x / cosh x is largest: the root of r tanh r = 1.
 *
 * |cos z| <= cosh |z|, so from a point of modulus at most ρ a step lands at
 * modulus at most |c| cosh ρ. The orbit of a c is then held inside the disc of
 * radius ρ when |c| cosh ρ <= ρ for every ρ up to the radius, and ρ / cosh ρ
 * is largest where its derivative vanishes, tanh ρ + ρ (1 - tanh² ρ) = 0, that
 * is tanh ρ = 1 / ρ. There is no closed form for that root, so it is found once
 * by Newton's method here: it is 1.19968...
 */
function solveInvariantRadius(): number {
  let radius = 1.2;

  for (let step = 0; step < 30; step++) {
    const tanh = Math.tanh(radius);
    const slope = tanh + radius * (1 - tanh * tanh);
    radius -= (radius * tanh - 1) / slope;
  }

  return radius;
}

/** The radius of the largest disc this argument holds the orbit inside. */
export const COSINE_INVARIANT_RADIUS = solveInvariantRadius();

/**
 * The |c| below which that disc is invariant: r / cosh r = 0.66274...
 *
 * For such a c the start 0 and the first point c lie inside the disc of radius
 * r, and by the argument in {@link COSINE_INVARIANT_RADIUS} no later point
 * leaves it, so the orbit never reaches the height and the count is the cap.
 * Like the Mandelbrot set's cardioid, it answers the count at once and leaves
 * the orbit and the trap loops to walk, so the path the plot draws and the
 * closest approach are the real ones.
 */
export const COSINE_INTERIOR_RADIUS =
  COSINE_INVARIANT_RADIUS / Math.cosh(COSINE_INVARIANT_RADIUS);

const COSINE_INTERIOR_RADIUS_SQUARED =
  COSINE_INTERIOR_RADIUS * COSINE_INTERIOR_RADIUS;

/** cosh of the escape height: the most |cos z| can be across when |Im z| is at the height. */
const COSH_ESCAPE_HEIGHT = Math.cosh(COSINE_ESCAPE_HEIGHT);

/**
 * The fractional part of the count for an orbit that has just left.
 *
 * The usual smooth count, n + 1 - log2(log2 |z|), is made for a step that
 * squares; here the step puts |Im z| through an exponential, so that formula
 * would not join up the bands. What does: an orbit whose last point sat below
 * the height (|Im z| <= H) lands, after one step, at most |c| cosh(H) up --
 * |Im (c cos z)| <= |c| |cos z| <= |c| cosh(Im z) -- and, having left, at least
 * H. So the size it left at, Y, lies in [H, |c| cosh(H)], and
 * ln(Y / H) / ln(|c| cosh(H) / H) runs from 0 to 1 across that range. An orbit
 * that left by a hair is counted as n + 1 (the band it would have joined had it
 * left a step later), one that jumped as far as it can as n, and the counts
 * agree across every band's edge instead of stepping. The clamp keeps the
 * fraction inside [0, 1] whatever rounding does; a range that is not positive
 * would make the logarithm's sign meaningless, so it answers the far end.
 *
 * No orbit reaches the clamp: one that leaves has a height above the limit and
 * at most |c| cosh(20), so its fraction is already in [0, 1]. It is a guard
 * against a value that rounding or a call outside the formula's domain pushed
 * past an end, which is why its own test drives the formula directly.
 * @param iterations - The steps the orbit survived, the whole count
 * @param height - |Im z| after the step that left, which is above COSINE_ESCAPE_HEIGHT
 * @param cMagnitude - |c|
 * @returns The smooth count, between iterations and iterations + 1
 */
export function smoothCount(
  iterations: number,
  height: number,
  cMagnitude: number,
): number {
  const range = Math.log(
    (cMagnitude * COSH_ESCAPE_HEIGHT) / COSINE_ESCAPE_HEIGHT,
  );
  if (!(range > 0)) return iterations + 1;

  const fraction = Math.log(height / COSINE_ESCAPE_HEIGHT) / range;

  return iterations + 1 - Math.min(1, Math.max(0, fraction));
}

/**
 * Walk one cosine orbit from z = 0 and count the steps it survives.
 *
 * The step is z -> c cos(z), with cos(x + iy) = cos x cosh y - i sin x sinh y,
 * so the real and imaginary parts of the cosine are
 *   s = cos x cosh y   and   t = -sin x sinh y,
 * and the new point is (cx s - cy t) + i (cx t + cy s). cosh and sinh come
 * from the one exponential e^y, so a step costs one `exp`, one `sin` and one
 * `cos` and nothing else beyond arithmetic. The orbit ends the step it lands
 * with |Im z| above {@link COSINE_ESCAPE_HEIGHT}; a point that ends is counted
 * by the steps it completed, as the Mandelbrot loop counts them, and a point
 * that never does returns the cap.
 *
 * The set is the same under c -> -c and under conjugation of c. cos is even,
 * so the orbit of -c is the negative of the orbit of c from the first step on
 * (the start is 0), and the heights |Im z| are the same, so the two orbits
 * leave on the same step. Conjugating c conjugates every point (the start is
 * real), and the height is unchanged. So the picture is symmetric about both
 * axes. A real c gives a real orbit bounded by |c|, since |cos x| <= 1, so the
 * whole real axis is in the set.
 * @param c - Point in the complex plane to test
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
function cosineIterations(
  c: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): number {
  // The disc of radius r / cosh r is in the set by a two-line argument, and
  // most of the cost of a view framed on the set is its in-set pixels running
  // the cap.
  if (
    c.real * c.real + c.imaginary * c.imaginary <
    COSINE_INTERIOR_RADIUS_SQUARED
  ) {
    return maxIterations;
  }

  let real = COSINE_START;
  let imaginary = 0;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    const up = Math.exp(imaginary);
    const down = 1 / up;
    const cosineReal = (Math.cos(real) * (up + down)) / 2;
    const cosineImaginary = (-Math.sin(real) * (up - down)) / 2;
    real = c.real * cosineReal - c.imaginary * cosineImaginary;
    imaginary = c.real * cosineImaginary + c.imaginary * cosineReal;

    const height = Math.abs(imaginary);
    if (height > COSINE_ESCAPE_HEIGHT) {
      if (!smooth) {
        return iterations;
      }

      return smoothCount(iterations, height, Math.hypot(c.real, c.imaginary));
    }
  }

  return maxIterations;
}

/**
 * The closest a cosine orbit from z = 0 comes to a trap shape: the count's own
 * loop with a running minimum kept in place of the count, allocating nothing.
 * Counts the points the orbit lands on (the start is not one), including the
 * one that left, and stops on the escape test, at the cap, or when the orbit
 * has closed on a cycle (Brent's check; see `escapeTimeTrap` in mandelbrot.ts).
 * The kind's `orbit` walk is the oracle that holds it to the other copies of
 * this loop (`trapDistance.test.ts`).
 * @param c - Point in the complex plane to test
 * @param maxIterations - Most steps to walk
 * @param shape - Which trap the distance is to
 * @returns The least distance reached, or Infinity when no step was measured
 */
function cosineTrap(
  c: ComplexNumber,
  maxIterations: number,
  shape: TrapShape,
): number {
  let real = COSINE_START;
  let imaginary = 0;
  let savedReal = COSINE_START;
  let savedImaginary = 0;
  let sinceSave = 0;
  let saveEvery = 1;
  let least = Infinity;

  for (let steps = 0; steps < maxIterations; steps++) {
    const up = Math.exp(imaginary);
    const down = 1 / up;
    const cosineReal = (Math.cos(real) * (up + down)) / 2;
    const cosineImaginary = (-Math.sin(real) * (up - down)) / 2;
    real = c.real * cosineReal - c.imaginary * cosineImaginary;
    imaginary = c.real * cosineImaginary + c.imaginary * cosineReal;

    const key = trapKey(shape, real, imaginary);
    if (key < least) least = key;

    if (Math.abs(imaginary) > COSINE_ESCAPE_HEIGHT) break;

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
 * The cosine set as a {@link FractalKind}: the point the renderer hands over is
 * the constant c in z -> c cos(z), and every orbit starts from the critical
 * point 0.
 *
 * Like Sine it is a single picture, so its id is all the picker has to carry
 * for it.
 */
export const cosineKind: FractalKind = {
  id: "cosine",
  iterations(point, maxIterations, smooth) {
    return cosineIterations(point, maxIterations, smooth);
  },
  escapeInfo(point, maxIterations) {
    const steps = cosineIterations(point, maxIterations, false);

    return { steps, escaped: steps < maxIterations };
  },
  trapDistance(point, maxIterations, trap) {
    return cosineTrap(point, maxIterations, trap);
  },
  orbit(point, maxSteps) {
    // The count's own loop with the points kept, so the path the plot draws is
    // the path the colour was read from.
    const points: ComplexNumber[] = [{ real: COSINE_START, imaginary: 0 }];
    let real = COSINE_START;
    let imaginary = 0;

    for (let steps = 0; steps < maxSteps; steps++) {
      const up = Math.exp(imaginary);
      const down = 1 / up;
      const cosineReal = (Math.cos(real) * (up + down)) / 2;
      const cosineImaginary = (-Math.sin(real) * (up - down)) / 2;
      real = point.real * cosineReal - point.imaginary * cosineImaginary;
      imaginary = point.real * cosineImaginary + point.imaginary * cosineReal;
      points.push({ real, imaginary });

      if (Math.abs(imaginary) > COSINE_ESCAPE_HEIGHT) break;
    }

    return points;
  },
};
