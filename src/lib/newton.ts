import type { ComplexNumber, FractalKind } from "../types/fractal";

/**
 * How close |z^3 - 1| must get before an orbit counts as having arrived at a
 * root. Newton's method converges quadratically near a simple root, so the last
 * step takes the residual from about 1e-3 to 1e-6 and the next would take it to
 * 1e-12: a tolerance this loose costs nothing in the picture and is far looser
 * than float64 can resolve, so no point is stranded by rounding.
 */
export const NEWTON_TOLERANCE = 1e-6;

/**
 * The share of the colour range one root owns. The colour mapping reads
 * `iterations / maxIterations` as a position along a scheme, so the three roots
 * take a third each of 0..maxIterations and every scheme shows three colour
 * families, one per root, with no change to the schemes or the renderer loop.
 */
export const NEWTON_BAND = 1 / 3;

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

/** How a point ended: at the root with this index after this many (possibly fractional) steps, or never. */
interface NewtonOutcome {
  root: number;
  steps: number;
}

/**
 * Index of the root of z^3 - 1 nearest a point. Past the tolerance test the
 * point is within about 1e-6 of one root and 1.7 of the others, so "nearest"
 * is never a close call.
 */
function nearestRoot(real: number, imaginary: number): number {
  let best = 0;
  let bestDistance = Infinity;
  NEWTON_ROOTS.forEach((root, index) => {
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
 * Run Newton's method on z^3 - 1 from a point, and say which root it reached
 * and in how many steps.
 *
 * The step z -> z - (z^3 - 1) / (3 z^2) is written (2z + 1/z^2) / 3, which is the
 * same map without ever forming z^3: a point far out would overflow z^3 to
 * infinity and the subtraction would then be NaN, while 1/z^2 only underflows to
 * 0. The residual |z^3 - 1| is still tested each lap, at the start, so a point
 * that begins on a root takes 0 steps and an orbit is tested before it is
 * stepped.
 *
 * The orbit gives up (null) on z = 0, where the derivative vanishes and the
 * step has no value, on any iterate that stops being finite, and on the cap.
 *
 * The smooth count credits the final step in part. Near a simple root the
 * residual's logarithm doubles each step, so the lap that first drops below the
 * tolerance (steps `n`) overshot by a fraction: `n + log2(ln tol / ln residual)`,
 * which is in (n - 1, n] and so continuous with the count of the lap before it.
 * The fraction is clamped to a step for the first laps, which are not yet in the
 * quadratic regime, and for a residual of exactly 0.
 */
function newtonOrbit(
  point: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): NewtonOutcome | null {
  let real = point.real;
  let imaginary = point.imaginary;

  for (let steps = 0; steps < maxIterations; steps++) {
    if (!Number.isFinite(real) || !Number.isFinite(imaginary)) return null;

    // z^2, then z^3 = z^2 * z, for the residual |z^3 - 1|.
    const squareReal = real * real - imaginary * imaginary;
    const squareImaginary = 2 * real * imaginary;
    const cubeReal = squareReal * real - squareImaginary * imaginary - 1;
    const cubeImaginary = squareReal * imaginary + squareImaginary * real;
    const residual = Math.hypot(cubeReal, cubeImaginary);

    if (residual < NEWTON_TOLERANCE) {
      const root = nearestRoot(real, imaginary);
      if (!smooth) return { root, steps };

      const credit = Math.log2(Math.log(NEWTON_TOLERANCE) / Math.log(residual));

      return { root, steps: steps + Math.max(-1, credit) };
    }

    // 1 / z^2 = conj(z^2) / |z^2|^2; a z of 0 has |z^2|^2 of 0 and no step.
    const squareMagnitude =
      squareReal * squareReal + squareImaginary * squareImaginary;
    if (squareMagnitude === 0) return null;

    const inverseReal = squareReal / squareMagnitude;
    const inverseImaginary = -squareImaginary / squareMagnitude;
    real = (2 * real + inverseReal) / 3;
    imaginary = (2 * imaginary + inverseImaginary) / 3;
  }

  return null;
}

/**
 * Pack a root and a step count into the single number the renderer's colour
 * mapping reads.
 *
 * `FractalKind.iterations` returns one number per point and the mapping paints
 * `iterations / maxIterations` along the scheme, black from `maxIterations` up.
 * The number is therefore a position in 0..maxIterations: the root picks a third
 * of it ({@link NEWTON_BAND}) and the step count picks where in that third, from
 * {@link NEWTON_BAND_MARGIN} in at once to short of the far edge by the same
 * margin for a slow point, along the curve {@link NEWTON_HALF_SHADE_STEPS} sets.
 * Root 0 (z = 1) is the lowest third, root 1 (the one above the axis) the
 * middle, root 2 the top, so the three always meet three different parts of a
 * scheme and the shade inside each follows how fast the point arrived.
 */
function packNewton(outcome: NewtonOutcome, maxIterations: number): number {
  const steps = Math.max(0, outcome.steps);
  const shade = steps / (steps + NEWTON_HALF_SHADE_STEPS);
  const inBand = NEWTON_BAND_MARGIN + (1 - 2 * NEWTON_BAND_MARGIN) * shade;

  return (outcome.root + inBand) * NEWTON_BAND * maxIterations;
}

/**
 * The Newton fractal of z^3 - 1 as a {@link FractalKind}.
 *
 * Not an escape-time set: every orbit that does not hit z = 0 heads for one of
 * the three cube roots of 1, and the picture is which one, so the three basins
 * of attraction, with a boundary where all three meet at every point of it. The
 * orbit starts at the point itself (there is no constant), and a point that has
 * not settled within the cap, which is the boundary's dust, returns
 * `maxIterations` and is drawn black like the inside of any other set.
 * @returns The kind that draws it
 */
export const newtonKind: FractalKind = {
  id: "newton",
  iterations(point, maxIterations, smooth) {
    const outcome = newtonOrbit(point, maxIterations, smooth);

    return outcome === null
      ? maxIterations
      : packNewton(outcome, maxIterations);
  },
};
