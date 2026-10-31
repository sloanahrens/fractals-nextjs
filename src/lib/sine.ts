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

/**
 * How near a point must come to one saved a few steps back for the walk to try
 * a cycle proof (see {@link cycleIsTrapped}). The saving doubles its reach at
 * every save, as in `sineTrap`, so the points it offers back are 1, 2, 4, ...
 * steps old and any step from 1 up to the reach.
 *
 * This only decides whether the proof is attempted. A return this close is
 * not itself read as a cycle: the walk ends early only when the proof holds,
 * so the distance cannot change a count, whichever way it is set -- a loose
 * one spends the attempts on returns that prove nothing and a tight one never
 * spends them, and both only cost time. It is loose enough that a settling
 * orbit reaches the proof early and tight enough that a chaotic one rarely
 * reaches it at all. A millionth is a three-thousandth of a pixel at the
 * opening view.
 */
const SINE_RETURN_TOLERANCE = 1e-6;

/**
 * The longest span, in steps, a certified cycle may close over.
 *
 * The proof re-walks the span, so it costs a step per step of the span on the
 * walk that ends; a span of the whole cap would cost more than it saves.
 */
const SINE_CYCLE_MAX_STEPS = 32;

/**
 * How many times one walk may try the proof.
 *
 * A near-return that does not prove anything costs the span's steps and leaves
 * the walk running, so a path that keeps grazing an earlier point could pay
 * for the proof again and again. Three attempts bound that cost to a small
 * multiple of the span; a pixel whose first returns do not prove anything is
 * left to the plain walk.
 */
const SINE_CYCLE_ATTEMPTS = 3;

/**
 * The balls around 0 that hold an orbit for good, each paired with the largest
 * |c| squared it covers. The first pair the point's |c| fits is the one used.
 *
 * If an orbit ever reaches a point of modulus at most R, every later point has
 * modulus at most |c| sinh R, because |sin z| <= sinh |z|; so with
 * |c| sinh R <= R the whole orbit stays in the ball of radius R, whose height
 * |Im z| is at most R -- under 1, far below the escape height -- and the point
 * is in the set, whatever the cap. That is the same inequality the disc of
 * radius asinh(1) rests on, applied to the orbit once it has come in rather
 * than to the first step alone, which is what carries it past |c| = asinh(1)
 * and up to |c| = 1.
 *
 * Each radius is the round R whose bound, R / sinh R, is rounded DOWN for
 * comfort: 0.5 / sinh 0.5 = 0.9595 -> 0.95, so 0.9025; 0.25 / sinh 0.25 =
 * 0.9896 -> 0.989, so 0.978121; 0.1 / sinh 0.1 = 0.99833 -> 0.998, so
 * 0.996004; 0.05 / sinh 0.05 = 0.99958 -> 0.9995, so 0.99900025; 0.01 / sinh
 * 0.01 = 0.9999833 -> 0.99998, so 0.99996. A wider ball catches the orbit
 * sooner, so the pairs run widest first.
 *
 * There is no row for |c| under asinh(1): the disc of that radius answers
 * those points before the walk begins, so a row there would never be read.
 *
 * `sine.test.ts` holds every row to |c| sinh R <= R, which is the whole of the
 * argument: a row that let |c| through would end walks that could still leave.
 */
export const SINE_TRAP_RADII: readonly (readonly [number, number])[] = [
  [0.9025, 0.25],
  [0.978121, 0.0625],
  [0.996004, 0.01],
  [0.99900025, 0.0025],
  [0.99996, 0.0001],
];

/**
 * The squared radius of the ball that holds this c's orbit once it arrives, or
 * 0 when no ball does (|c| at least 1, where 0 is no longer attracting).
 * @param cSquared - |c| squared
 * @returns The ball's squared radius, or 0 for none
 */
function trapRadiusSquared(cSquared: number): number {
  for (const [cMaxSquared, radiusSquared] of SINE_TRAP_RADII) {
    if (cSquared <= cMaxSquared) return radiusSquared;
  }

  return 0;
}

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
 * Prove that a walk can never leave, from a return it has just made.
 *
 * The walk has gone `steps` steps from `from` to a point `now` that is within
 * the return tolerance of `from` (the caller has checked that). This asks
 * whether the whole orbit from `from` is held for good by the closed ball of
 * some radius about `from`, and answers yes only when a bound proves it.
 *
 * The bound. Let g = f^steps, with f(z) = c sin z. The ball B(from, r) is sent
 * by f into a ball of radius L r about f(from), where L is the most |f'| is
 * anywhere on B(from, r); and |f'| = |c cos z|, whose growth off the point z is
 * |c| |sin| r, with |sin| <= cosh |Im z|. So a ball of radius q_j about the
 * j-th point grows to radius q_{j+1} <= |c| (|cos z_j| + q_j cosh(|Im z_j| +
 * q_j)) q_j at the next step, and after `steps` steps the ball about `from`
 * has become a ball of radius q about `now`. If q + |now - from| <= r, every
 * point of B(from, r) is carried into B(from, r) by g, so an orbit that is in
 * that ball once is in it forever, every `steps` steps.
 *
 * No contraction is needed for that: a map that sends a closed ball into
 * itself keeps every orbit that it holds in it. The radius r is the least one
 * with r >= q(r) + |now - from|, found by starting at twice the gap and
 * stepping up; `q` grows with r, so the walk up may fail to settle, and then
 * this answers no.
 *
 * Two cheap tests close the argument. The ball holds the points the walk has
 * not reached yet, but it must also leave them under the escape height: the
 * tallest point of any of the balls is compared with `SINE_ESCAPE_HEIGHT`, so
 * a ball that reached as high as the escape height is refused. And the walk
 * that ends at the cap is the same walk the count already makes, since the
 * proof re-walks the very steps taken, with the same arithmetic.
 * @param cReal - Real part of c
 * @param cImaginary - Imaginary part of c
 * @param cMagnitude - |c|
 * @param from - The point the walk returned to, a whole `steps` steps back
 * @param now - Where the walk is, within the return tolerance of `from`
 * @param steps - How many steps separate the two, at most SINE_CYCLE_MAX_STEPS
 * @returns True only when the ball is proved to be held, so the count is the cap
 */
export function cycleIsTrapped(
  cReal: number,
  cImaginary: number,
  cMagnitude: number,
  fromReal: number,
  fromImaginary: number,
  nowReal: number,
  nowImaginary: number,
  steps: number,
): boolean {
  const gap = Math.hypot(nowReal - fromReal, nowImaginary - fromImaginary);

  for (let attempt = 0, radius = 2 * gap; attempt < 2; attempt++) {
    // Carry a ball of this radius along the very steps that were taken, the
    // centre following the orbit and the radius growing by the bound above.
    let image = radius;
    let real = fromReal;
    let imaginary = fromImaginary;
    let tallest = Math.abs(imaginary) + radius;

    for (let step = 0; step < steps; step++) {
      const up = Math.exp(imaginary);
      const down = 1 / up;
      const cosh = (up + down) / 2;
      const sinh = (up - down) / 2;
      const cosine = Math.hypot(Math.cos(real) * cosh, Math.sin(real) * sinh);
      const growth =
        cMagnitude * (cosine + image * Math.cosh(Math.abs(imaginary) + image));
      image *= growth;
      if (!(image < 2)) return false;

      const sineReal = (Math.sin(real) * (up + down)) / 2;
      const sineImaginary = (Math.cos(real) * (up - down)) / 2;
      real = cReal * sineReal - cImaginary * sineImaginary;
      imaginary = cReal * sineImaginary + cImaginary * sineReal;

      const height = Math.abs(imaginary) + image;
      if (height > tallest) tallest = height;
    }

    if (image + gap <= radius) return tallest < SINE_ESCAPE_HEIGHT;

    const least = (image + gap) / (1 - image / radius);
    if (!(least > 0) || least > 2) return false;
    radius = least;
  }

  return false;
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
 * Two proofs end a walk at the cap's count before the cap: one that the orbit
 * has come into a ball around 0 that holds it for good (see
 * {@link SINE_TRAP_RADII}), and one that the orbit returns to its own
 * neighbourhood in a way that holds it there for good (see
 * {@link cycleIsTrapped}). Neither can end a walk that would have left: each
 * is a bound on where the orbit can go, not a reading of where it has been.
 * They matter because the pixels in the set but outside the disc of radius
 * asinh(1) run four fifths of the loop's steps at the opening view.
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
  const cReal = c.real;
  const cImaginary = c.imaginary;
  const cSquared = cReal * cReal + cImaginary * cImaginary;

  // The disc of radius asinh(1) is in the set by a two-line argument, and most
  // of the cost of a view framed on the set is its in-set pixels running the cap.
  if (cSquared < SINE_INTERIOR_RADIUS_SQUARED) {
    return maxIterations;
  }

  // Beyond the disc most of the in-set pixels still come in to 0, and once one
  // is in this ball it can never leave: a shortcut for them, a plain walk for
  // the rest (see SINE_TRAP_RADII). Zero when |c| is at least 1.
  const trapSquared = trapRadiusSquared(cSquared);

  let real = SINE_START;
  let imaginary = 0;

  // Brent's saving, as in sineTrap: keep a point saved 1, 2, 4, ... steps
  // back, so a point that comes back within the return tolerance of it can
  // have the cycle proof tried on it. The saving and the tolerance decide only
  // when the proof is attempted; the proof alone decides whether the walk ends.
  let savedReal = SINE_START;
  let savedImaginary = 0;
  let savedStep = -1;
  let sinceSave = 0;
  let saveEvery = 1;
  let attempts = 0;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    const up = Math.exp(imaginary);
    const down = 1 / up;
    const sineReal = (Math.sin(real) * (up + down)) / 2;
    const sineImaginary = (Math.cos(real) * (up - down)) / 2;
    real = cReal * sineReal - cImaginary * sineImaginary;
    imaginary = cReal * sineImaginary + cImaginary * sineReal;

    const height = Math.abs(imaginary);
    if (height > SINE_ESCAPE_HEIGHT) {
      if (!smooth) {
        return iterations;
      }

      return smoothCount(iterations, height, Math.hypot(cReal, cImaginary));
    }

    // The escape test comes first, so a point that has just left is counted as
    // gone before any proof can call the orbit held.
    if (trapSquared > 0 && real * real + imaginary * imaginary <= trapSquared) {
      return maxIterations;
    }

    if (
      attempts < SINE_CYCLE_ATTEMPTS &&
      Math.abs(real - savedReal) < SINE_RETURN_TOLERANCE &&
      Math.abs(imaginary - savedImaginary) < SINE_RETURN_TOLERANCE
    ) {
      attempts++;
      const steps = iterations - savedStep;

      if (
        steps > 0 &&
        steps <= SINE_CYCLE_MAX_STEPS &&
        cycleIsTrapped(
          cReal,
          cImaginary,
          Math.hypot(cReal, cImaginary),
          savedReal,
          savedImaginary,
          real,
          imaginary,
          steps,
        )
      ) {
        return maxIterations;
      }
    }

    if (++sinceSave === saveEvery) {
      savedReal = real;
      savedImaginary = imaginary;
      savedStep = iterations;
      saveEvery *= 2;
      sinceSave = 0;
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
