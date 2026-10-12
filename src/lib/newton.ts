import type { ComplexNumber, FractalKind } from "../types/fractal";

/**
 * How close |p(z)| must get before an orbit counts as having arrived at a root.
 * Newton's method converges quadratically near a simple root, so the last step
 * takes the residual from about 1e-3 to 1e-6 and the next would take it to
 * 1e-12: a tolerance this loose costs nothing in the picture and is far looser
 * than float64 can resolve, so no point is stranded by rounding.
 */
export const NEWTON_TOLERANCE = 1e-6;

/**
 * How far inside its band a point's shading may reach, as a share of the band.
 * A point that arrives at once sits `NEWTON_BAND_MARGIN` in from the band's
 * lower edge and one that took forever sits the same distance short of the upper
 * edge, so the slowest shade of one root and the fastest of the next are never
 * the same colour, and no point lands exactly on `maxIterations`, which the
 * colour mapping paints black.
 */
export const NEWTON_BAND_MARGIN = 0.04;

/**
 * How many steps put a point halfway along its band. The shading is
 * `steps / (steps + NEWTON_HALF_SHADE_STEPS)`: a point at a root is at the band's
 * start, and a point that needed this many steps is half way along it. It is a
 * saturating curve rather than steps over a cap so that the picture does not
 * depend on the iteration count (the same point has the same colour at a cap of
 * 100 and 1000, apart from the points the cap is too low to settle), and so
 * that the slow points near a basin boundary, which have no upper limit, still
 * grade smoothly instead of clipping flat. Over the default view (a 400x300
 * grid, whole counts) the median point arrives in 6 steps, the middle half in 5
 * to 7 and nine in ten in 4 to 13, with a tail past 50 beside the boundary: 6
 * puts the bulk of the picture in the middle of the band's travel and leaves
 * room each side for the fast and the slow.
 */
export const NEWTON_HALF_SHADE_STEPS = 6;

/** The roots of z^3 - 1 in the order the bands are numbered: 1, then the two turned 120 degrees either way. */
export const NEWTON_ROOTS: readonly ComplexNumber[] = [
  { real: 1, imaginary: 0 },
  { real: -0.5, imaginary: Math.sqrt(3) / 2 },
  { real: -0.5, imaginary: -Math.sqrt(3) / 2 },
];

/**
 * The share of the colour range one root owns.
 *
 * The colour mapping reads `iterations / maxIterations` as a position along a
 * scheme, so a root takes its own band of 0..maxIterations and every scheme
 * shows as many colour families as the polynomial has roots, with no change to
 * the schemes or the renderer loop. This is the band of the three-root
 * polynomials, z^3 - 1 and z^3 - 2z + 2; a polynomial with n roots gives each
 * of them 1/n.
 */
export const NEWTON_BAND = 1 / 3;

/**
 * Where one Newton step of a polynomial leaves a point, and how close the point
 * it was taken from already was to a root.
 *
 * Written into an object the caller owns rather than returned: the renderer
 * walks a point's orbit some hundreds of times and a fresh object per step
 * would be garbage the picture pays for.
 */
export interface NewtonStepState {
  /** `|p(z)|` at the point the step was taken from, for the convergence test. */
  residual: number;
  /** `z - p(z)/p'(z)`, the next point the orbit visits, when {@link hasStep}. */
  real: number;
  imaginary: number;
  /** False when `p'(z)` is nought there and the step has no value. */
  hasStep: boolean;
}

/**
 * One polynomial Newton's method can be run on, as this fractal's variant: the
 * equation it solves, the roots it has, and the arithmetic of one step.
 *
 * The defaults are one per offered polynomial ({@link NEWTON_POLYNOMIALS}),
 * because the map is a property of the equation and not of the point.
 */
export interface NewtonPolynomial {
  /** The variant value a link, a saved view and the page carry. */
  id: string;
  /** How the chip, the setting and the saved view spell it. */
  label: string;
  /** The roots, in the order the colour bands are numbered. */
  roots: readonly ComplexNumber[];
  /**
   * The mechanics of the map at a point: its `|p(z)|`, and the Newton step from
   * it, both written into `out`.
   *
   * One call rather than two because the step and the residual share the powers
   * of z they need, and computing them twice would roughly double the cost of
   * the app's heaviest fractal.
   */
  evaluate(real: number, imaginary: number, out: NewtonStepState): void;
}

/**
 * The Newton step of z^d - 1 written out, for one power d.
 *
 * The step z -> z - (z^d - 1) / (d z^(d-1)) is written ((d-1)z + 1/z^(d-1)) / d,
 * which is the same map without ever forming the quotient: a point far out would
 * overflow z^d to the infinity the subtraction then turns into a NaN, while
 * 1/z^(d-1) only underflows to 0. The powers are built by repeated complex
 * multiplication, so a step is real arithmetic and the exactness the symmetry
 * tests lean on is kept.
 */
function unityEvaluate(power: number) {
  return (real: number, imaginary: number, out: NewtonStepState): void => {
    // w = z^(d-1), and then z^d = w z for the residual |z^d - 1|.
    let wReal = real;
    let wImaginary = imaginary;
    for (let factor = 2; factor < power; factor++) {
      const nextReal = wReal * real - wImaginary * imaginary;
      wImaginary = wReal * imaginary + wImaginary * real;
      wReal = nextReal;
    }
    const powerReal = wReal * real - wImaginary * imaginary;
    const powerImaginary = wReal * imaginary + wImaginary * real;
    out.residual = Math.hypot(powerReal - 1, powerImaginary);

    // 1 / w = conj(w) / |w|^2; a w of 0 has no inverse and no step.
    const magnitude = wReal * wReal + wImaginary * wImaginary;
    if (magnitude === 0) {
      out.hasStep = false;
      return;
    }

    out.real = ((power - 1) * real + wReal / magnitude) / power;
    out.imaginary = ((power - 1) * imaginary - wImaginary / magnitude) / power;
    out.hasStep = true;
  };
}

/**
 * The Newton step of z^3 - 2z + 2 written out.
 *
 * This polynomial has no z^2 term to divide by, so the general quotient
 * z - p(z)/p'(z) is formed here rather than rearranged, by multiplying through
 * by the conjugate of p'(z) = 3z^2 - 2. It is the classic equation whose Newton
 * map has no root to settle on near the origin: 0 is sent to 1 and 1 back to 0,
 * an attracting cycle the orbits beside them are drawn into, so those points run
 * the whole cap and are painted black.
 */
function cycleEvaluate(real: number, imaginary: number, out: NewtonStepState): void {
  const squareReal = real * real - imaginary * imaginary;
  const squareImaginary = 2 * real * imaginary;
  const cubeReal = squareReal * real - squareImaginary * imaginary;
  const cubeImaginary = squareReal * imaginary + squareImaginary * real;

  // p(z) = z^3 - 2z + 2.
  const valueReal = cubeReal - 2 * real + 2;
  const valueImaginary = cubeImaginary - 2 * imaginary;
  out.residual = Math.hypot(valueReal, valueImaginary);

  // p'(z) = 3z^2 - 2; where it is nought the step has no value (the points
  // +- sqrt(2/3) on the real axis).
  const slopeReal = 3 * squareReal - 2;
  const slopeImaginary = 3 * squareImaginary;
  const magnitude = slopeReal * slopeReal + slopeImaginary * slopeImaginary;
  if (magnitude === 0) {
    out.hasStep = false;
    return;
  }

  // p / p' = p conj(p') / |p'|^2.
  out.real =
    real -
    (valueReal * slopeReal + valueImaginary * slopeImaginary) / magnitude;
  out.imaginary =
    imaginary -
    (valueImaginary * slopeReal - valueReal * slopeImaginary) / magnitude;
  out.hasStep = true;
}

/**
 * The polynomials the Newton fractal offers, in the order the variant row lists
 * them. z^3 - 1 is the picture the app has always drawn and the one a link with
 * no variant names.
 */
export const NEWTON_POLYNOMIALS: readonly NewtonPolynomial[] = [
  {
    id: "3",
    label: "z^3 - 1",
    roots: NEWTON_ROOTS,
    evaluate: unityEvaluate(3),
  },
  {
    // The fourth roots of 1, in band order: 1, then a quarter turn each way
    // round the circle.
    id: "4",
    label: "z^4 - 1",
    roots: [
      { real: 1, imaginary: 0 },
      { real: 0, imaginary: 1 },
      { real: -1, imaginary: 0 },
      { real: 0, imaginary: -1 },
    ],
    evaluate: unityEvaluate(4),
  },
  {
    // The fifth roots of 1, a fifth of a turn apart.
    id: "5",
    label: "z^5 - 1",
    roots: [
      { real: 1, imaginary: 0 },
      { real: 0.30901699437494745, imaginary: 0.9510565162951535 },
      { real: -0.8090169943749473, imaginary: 0.5877852522924732 },
      { real: -0.8090169943749475, imaginary: -0.587785252292473 },
      { real: 0.30901699437494723, imaginary: -0.9510565162951536 },
    ],
    evaluate: unityEvaluate(5),
  },
  {
    // One real root and a conjugate pair, written out rather than solved for at
    // load: -1.7692923542386314 and 0.8846461771193157 +- 0.5897428050222056i,
    // to the digits a float64 holds.
    id: "cycle",
    label: "z^3 - 2z + 2",
    roots: [
      { real: -1.7692923542386314, imaginary: 0 },
      { real: 0.8846461771193157, imaginary: 0.5897428050222056 },
      { real: 0.8846461771193157, imaginary: -0.5897428050222056 },
    ],
    evaluate: cycleEvaluate,
  },
];

/** The polynomial a value that names none of them falls back to. */
export const DEFAULT_NEWTON_POLYNOMIAL = NEWTON_POLYNOMIALS[0].id;

/**
 * Read a polynomial the way a link, a saved view or the page spells it.
 *
 * Only the app's own spelling is one: "3", "4", "5" or "cycle". Anything else
 * — a number written another way, a polynomial this build does not offer, or a
 * value that is not text at all — is no polynomial, so a value from outside the
 * app never reaches {@link createNewtonKind}.
 * @param value - Text to read
 * @returns The polynomial's id, or null when the text names none of {@link NEWTON_POLYNOMIALS}
 */
export function parseNewtonPolynomial(value: string): string | null {
  const polynomial = NEWTON_POLYNOMIALS.find(
    (candidate) => candidate.id === value,
  );

  return polynomial?.id ?? null;
}

/**
 * The polynomial a variant names, falling back to z^3 - 1 for a value this
 * build cannot read — the picture {@link resolveFractalKind} draws for it, so
 * the card and the canvas agree.
 * @param value - A variant value from a link, a saved view or the page
 * @returns The polynomial to solve
 */
export function newtonPolynomialFor(value: string): NewtonPolynomial {
  return (
    NEWTON_POLYNOMIALS.find((candidate) => candidate.id === value) ??
    NEWTON_POLYNOMIALS[0]
  );
}

/** How a point ended: at the root with this index after this many (possibly fractional) steps, or never. */
interface NewtonOutcome {
  root: number;
  steps: number;
}

/**
 * Index of the root nearest a point. Past the tolerance test the point is within
 * about one part in a million of its root's own scale and as far from the
 * others, so "nearest" is never a close call.
 */
function nearestRoot(
  roots: readonly ComplexNumber[],
  real: number,
  imaginary: number,
): number {
  let best = 0;
  let bestDistance = Infinity;
  roots.forEach((root, index) => {
    const distance =
      (real - root.real) * (real - root.real) +
      (imaginary - root.imaginary) * (imaginary - root.imaginary);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });

  return best;
}

/**
 * Run Newton's method on one polynomial from a point, and say which root it
 * reached and in how many steps.
 *
 * A lap tests the residual at the point it is at and then steps, so a point
 * that begins on a root takes 0 steps and an orbit is tested before it is
 * stepped. The orbit gives up (null) where the step has no value — a z whose
 * p'(z) is nought — on any iterate that stops being finite, and on the cap.
 * A point drawn into a cycle of the map, as the points near 0 and 1 are for
 * z^3 - 2z + 2, never reaches a root and gives up on the cap the same way.
 *
 * The smooth count credits the final step in part. Near a simple root the
 * residual's logarithm doubles each step whatever the polynomial is, so the lap
 * that first drops below the tolerance (steps `n`) overshot by a fraction:
 * `n + log2(ln tol / ln residual)`, which is in (n - 1, n] and so continuous
 * with the count of the lap before it. The fraction is clamped to a step for
 * the first laps, which are not yet in the quadratic regime, and for a residual
 * of exactly 0.
 */
function newtonOrbit(
  polynomial: NewtonPolynomial,
  point: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): NewtonOutcome | null {
  const work: NewtonStepState = {
    residual: 0,
    real: 0,
    imaginary: 0,
    hasStep: false,
  };
  let real = point.real;
  let imaginary = point.imaginary;

  for (let steps = 0; steps < maxIterations; steps++) {
    if (!Number.isFinite(real) || !Number.isFinite(imaginary)) return null;

    polynomial.evaluate(real, imaginary, work);

    if (work.residual < NEWTON_TOLERANCE) {
      const root = nearestRoot(polynomial.roots, real, imaginary);
      if (!smooth) return { root, steps };

      const credit = Math.log2(
        Math.log(NEWTON_TOLERANCE) / Math.log(work.residual),
      );

      return { root, steps: steps + Math.max(-1, credit) };
    }

    if (!work.hasStep) return null;
    real = work.real;
    imaginary = work.imaginary;
  }

  return null;
}

/**
 * Pack a root and a step count into the single number the renderer's colour
 * mapping reads.
 *
 * `FractalKind.iterations` returns one number per point and the mapping paints
 * `iterations / maxIterations` along the scheme, black from `maxIterations` up.
 * The number is therefore a position in 0..maxIterations: the root picks a band
 * of it ({@link band}) and the step count picks where in that band, from
 * {@link NEWTON_BAND_MARGIN} in at once to short of the far edge by the same
 * margin for a slow point, along the curve {@link NEWTON_HALF_SHADE_STEPS} sets.
 * The bands are numbered in the order the polynomial lists its roots, so every
 * root always meets a different part of a scheme and the shade inside each
 * follows how fast the point arrived.
 */
function packNewton(
  outcome: NewtonOutcome,
  band: number,
  maxIterations: number,
): number {
  const steps = Math.max(0, outcome.steps);
  const shade = steps / (steps + NEWTON_HALF_SHADE_STEPS);
  const inBand = NEWTON_BAND_MARGIN + (1 - 2 * NEWTON_BAND_MARGIN) * shade;

  return (outcome.root + inBand) * band * maxIterations;
}

/** Build the kind that draws one polynomial. */
function buildNewtonKind(polynomial: NewtonPolynomial): FractalKind {
  const band = 1 / polynomial.roots.length;

  return {
    // The id is the picker's, not the polynomial's: a variant of one fractal is
    // still that fractal, as the Multibrot's powers are.
    id: "newton",
    iterations(point, maxIterations, smooth) {
      const outcome = newtonOrbit(polynomial, point, maxIterations, smooth);

      return outcome === null
        ? maxIterations
        : packNewton(outcome, band, maxIterations);
    },
    escapeInfo(point, maxIterations) {
      // A Newton orbit does not escape; it ends by arriving at a root. The
      // whole-step path is the same one the probe's words are read from, and it
      // is what `iterations` packs the root of, so the two agree.
      const outcome = newtonOrbit(polynomial, point, maxIterations, false);

      return outcome === null
        ? { steps: maxIterations, escaped: false }
        : { steps: outcome.steps, escaped: true, root: outcome.root };
    },
    orbit(point, maxSteps) {
      // newtonOrbit's loop with the points kept, and the same two endings: the
      // walk stops on the z whose residual is within the tolerance -- that z is
      // already on the path and is the dot at the root -- or on a z with no step
      // (a vanishing derivative, or an iterate that stopped being finite), or
      // after maxSteps.
      const work: NewtonStepState = {
        residual: 0,
        real: 0,
        imaginary: 0,
        hasStep: false,
      };
      const points: ComplexNumber[] = [{ ...point }];
      let real = point.real;
      let imaginary = point.imaginary;

      for (let steps = 0; steps < maxSteps; steps++) {
        if (!Number.isFinite(real) || !Number.isFinite(imaginary)) break;

        polynomial.evaluate(real, imaginary, work);
        if (work.residual < NEWTON_TOLERANCE) break;
        if (!work.hasStep) break;

        real = work.real;
        imaginary = work.imaginary;
        points.push({ real, imaginary });
      }

      return points;
    },
  };
}

/**
 * The kinds built so far, one per polynomial, so that resolving a variant twice
 * answers the same object: the page holds a kind across renders and the tests
 * compare them by identity.
 */
const NEWTON_KINDS = new Map<string, FractalKind>();

/**
 * The Newton fractal of one polynomial, as a {@link FractalKind}: the point the
 * renderer hands over is the guess Newton's method starts from.
 *
 * A family rather than a picture, like Julia and the Multibrot, so the picker
 * carries the polynomial as the fractal's variant; `resolveFractalKind` builds
 * the kind from it.
 * @param polynomial - One of {@link NEWTON_POLYNOMIALS}: "3", "4", "5" or "cycle"
 * @returns The kind that draws it
 * @throws RangeError when the value names no polynomial this build offers
 */
export function createNewtonKind(polynomial: string): FractalKind {
  if (parseNewtonPolynomial(polynomial) === null) {
    throw new RangeError(
      `Newton polynomial must be one of ${NEWTON_POLYNOMIALS.map((entry) => entry.id).join(", ")}, got ${polynomial}`,
    );
  }

  const existing = NEWTON_KINDS.get(polynomial);
  if (existing !== undefined) return existing;

  const kind = buildNewtonKind(newtonPolynomialFor(polynomial));
  NEWTON_KINDS.set(polynomial, kind);

  return kind;
}

/**
 * The Newton fractal of z^3 - 1: not an escape-time set, since every orbit that
 * does not stall heads for one of the three cube roots of 1 and the picture is
 * which one, so the three basins of attraction, with a boundary where all three
 * meet at every point of it. The orbit starts at the point itself (there is no
 * constant), and a point that has not settled within the cap, which is the
 * boundary's dust, returns `maxIterations` and is drawn black like the inside of
 * any other set.
 *
 * It is the polynomial every Newton link with no variant names, so it is the
 * kind the picker draws for a value it cannot read.
 */
export const newtonKind: FractalKind = createNewtonKind(
  DEFAULT_NEWTON_POLYNOMIAL,
);
