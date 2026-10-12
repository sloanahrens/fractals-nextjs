import type { ComplexNumber, FractalKind } from "../types/fractal";

/**
 * How small a step must be before the orbit counts as having settled.
 *
 * Near a fixed point the Nova map contracts by a fixed factor each step, so the
 * steps shrink geometrically and a tolerance this loose costs nothing in the
 * picture while staying far above what float64 can resolve.
 */
export const NOVA_TOLERANCE = 1e-6;

/**
 * How far out an orbit may go before it counts as escaped. The map shrinks a
 * far point by a third each step, so an orbit only gets this far by passing
 * close to the pole at 0 (where the step is 1/(3z^2)) or from a constant this
 * large to begin with.
 */
export const NOVA_BAILOUT = 1e6;

/** Where every Nova orbit starts: z = 1, a root of z^3 - 1 and so a critical point of the Newton map. */
export const NOVA_START: ComplexNumber = { real: 1, imaginary: 0 };

const TOLERANCE_SQUARED = NOVA_TOLERANCE * NOVA_TOLERANCE;
const BAILOUT_SQUARED = NOVA_BAILOUT * NOVA_BAILOUT;

/** How an orbit ended: it stopped moving, it got away (or hit the pole), or the cap came first. */
type NovaEnding = "settled" | "escaped" | "unsettled";

/** What a walk found: the steps taken, how it ended, and the fraction of a step a settled orbit is credited. */
interface NovaWalk {
  steps: number;
  ending: NovaEnding;
  fraction: number;
}

/**
 * The share of a step an orbit that settled is credited with, in [0, 1].
 *
 * Steps shrink by a fixed factor near a fixed point, so a settled orbit's last
 * two step lengths `previous >= tolerance > current` say how far into its last
 * step it crossed the tolerance, on a log scale:
 *
 *   fraction = ln(previous / tolerance) / ln(previous / current)
 *
 * which is 0 when `previous` is only just over the tolerance and tends to 1 as
 * `current` approaches it. That is what makes the smooth count continuous: a
 * point that settles in `n` steps with a `current` just under the tolerance is
 * credited `n + 1`, and the neighbour whose `current` is just over it settles a
 * step later with a `previous` just over the tolerance, credited `n + 1 + 0`.
 *
 * The first step has no step before it, and its length is |c|, so it is
 * credited `ln(tolerance) / ln(current)`, which is 1 at the tolerance and 0 for
 * a step of length 0 (c = 0), and joins the same way. The lengths are squared
 * (a square root per step is work the picture does not need) and the ratio of
 * logs is unchanged by squaring.
 * @param previousSquared - Squared length of the step before the last, or NaN when the last was the first
 * @param currentSquared - Squared length of the last step, under the tolerance
 * @returns A fraction in [0, 1]
 */
function settleFraction(previousSquared: number, currentSquared: number): number {
  const fraction = Number.isNaN(previousSquared)
    ? Math.log(TOLERANCE_SQUARED) / Math.log(currentSquared)
    : Math.log(previousSquared / TOLERANCE_SQUARED) /
      Math.log(previousSquared / currentSquared);

  // A step of exactly 0 divides into an infinity and gives 0 or NaN; anything
  // that is not a number is no credit.
  return Number.isNaN(fraction) ? 0 : Math.min(1, Math.max(0, fraction));
}

/**
 * Walk one Nova orbit from z = 1 and say how it ended.
 *
 * Newton's method on z^3 - 1 with the pixel added at every step:
 * z -> z - (z^3 - 1) / (3 z^2) + c, which is written (2z + 1/z^2) / 3 + c so a
 * far point does not overflow z^3 and turn the subtraction into a NaN. The
 * orbit ends the first time
 *
 * - the step it just took was shorter than {@link NOVA_TOLERANCE}: it settled,
 *   which is what colours most of the plane;
 * - it lands past {@link NOVA_BAILOUT}, or on a value that is not finite: it
 *   escaped;
 * - it stands on z = 0 and has no step to take: the map sends 0 to infinity, so
 *   that is an escape too and counts the steps completed to get there.
 *
 * `steps` is the number of steps taken when it ended (so at most one less than
 * the cap) and the cap itself for an orbit that never ended: a cycle or chaos,
 * which the colour mapping paints black like the inside of any set.
 * @param c - The pixel's point, added at every step
 * @param maxIterations - Iteration cap
 * @returns The steps, the ending, and the settled orbit's fraction of a step
 */
function walkNova(c: ComplexNumber, maxIterations: number): NovaWalk {
  if (!Number.isFinite(c.real) || !Number.isFinite(c.imaginary)) {
    return { steps: maxIterations, ending: "unsettled", fraction: 0 };
  }

  let real = NOVA_START.real;
  let imaginary = NOVA_START.imaginary;
  let previousSquared = Number.NaN;

  for (let steps = 1; steps < maxIterations; steps++) {
    // w = z^2, and 1/w = conj(w) / |w|^2; where w is 0 there is no step.
    const wReal = real * real - imaginary * imaginary;
    const wImaginary = 2 * real * imaginary;
    const magnitude = wReal * wReal + wImaginary * wImaginary;
    if (magnitude === 0) {
      return { steps: steps - 1, ending: "escaped", fraction: 0 };
    }

    const nextReal = (2 * real + wReal / magnitude) / 3 + c.real;
    const nextImaginary = (2 * imaginary - wImaginary / magnitude) / 3 + c.imaginary;
    const stepReal = nextReal - real;
    const stepImaginary = nextImaginary - imaginary;
    const stepSquared = stepReal * stepReal + stepImaginary * stepImaginary;
    real = nextReal;
    imaginary = nextImaginary;

    // Written so that NaN and infinity fail the comparison and so escape.
    if (!(real * real + imaginary * imaginary <= BAILOUT_SQUARED)) {
      return { steps, ending: "escaped", fraction: 0 };
    }
    if (stepSquared < TOLERANCE_SQUARED) {
      return {
        steps,
        ending: "settled",
        fraction: settleFraction(previousSquared, stepSquared),
      };
    }
    previousSquared = stepSquared;
  }

  return { steps: maxIterations, ending: "unsettled", fraction: 0 };
}

/**
 * The Nova fractal as a {@link FractalKind}: the point the renderer hands over
 * is the constant c the Newton step is added to, and every orbit starts at
 * z = 1.
 *
 * It is the second kind here that is not an escape-time set (Newton's is the
 * first): its picture is how long an orbit takes to stop moving, and the count
 * is the steps taken when it did. A point that settles is shaded by that count;
 * smooth, the count carries a fraction of a step from how far under the
 * tolerance the last step fell ({@link settleFraction}), so it is in [n, n+1]
 * for n steps and continuous across the places where n changes. An escape
 * carries no fraction, since nothing about a point that has been sent past a
 * million says how far into a step it crossed. A point that never ends is the
 * cap, which the colour mapping paints black.
 *
 * The recurrence has real coefficients and starts on the real axis, so
 * conjugating c conjugates the orbit step for step and the picture is its own
 * mirror about the real axis, bit for bit. It has no other symmetry.
 */
export const novaKind: FractalKind = {
  id: "nova",
  iterations(point, maxIterations, smooth) {
    const walk = walkNova(point, maxIterations);

    if (walk.ending === "unsettled") return maxIterations;

    return smooth ? walk.steps + walk.fraction : walk.steps;
  },
  escapeInfo(point, maxIterations) {
    const walk = walkNova(point, maxIterations);

    return {
      steps: walk.steps,
      escaped: walk.ending !== "unsettled",
      settled: walk.ending === "settled",
    };
  },
  orbit(point, maxSteps) {
    // walkNova's loop with the points kept. The path ends on the point that
    // ended the orbit (the one that settled or got away), or on z = 0 where
    // there is no step to take, or after maxSteps.
    const points: ComplexNumber[] = [{ ...NOVA_START }];
    if (!Number.isFinite(point.real) || !Number.isFinite(point.imaginary)) {
      return points;
    }

    let real = NOVA_START.real;
    let imaginary = NOVA_START.imaginary;

    for (let steps = 0; steps < maxSteps; steps++) {
      const wReal = real * real - imaginary * imaginary;
      const wImaginary = 2 * real * imaginary;
      const magnitude = wReal * wReal + wImaginary * wImaginary;
      if (magnitude === 0) break;

      const nextReal = (2 * real + wReal / magnitude) / 3 + point.real;
      const nextImaginary =
        (2 * imaginary - wImaginary / magnitude) / 3 + point.imaginary;
      const stepReal = nextReal - real;
      const stepImaginary = nextImaginary - imaginary;
      real = nextReal;
      imaginary = nextImaginary;
      points.push({ real, imaginary });

      if (!(real * real + imaginary * imaginary <= BAILOUT_SQUARED)) break;
      if (stepReal * stepReal + stepImaginary * stepImaginary < TOLERANCE_SQUARED) {
        break;
      }
    }

    return points;
  },
};
