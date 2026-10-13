import type { ComplexNumber, FractalKind } from "../types/fractal";

/**
 * The two magnetic-model maps the Magnet fractal offers, numbered as the
 * magnetic types they come from.
 */
export const MAGNET_TYPES: readonly number[] = [1, 2];

/** What each type is called wherever the app shows it, the switcher's chips first. */
export const MAGNET_TYPE_LABELS: Readonly<Record<number, string>> = {
  1: "Type I",
  2: "Type II",
};

/**
 * Read a magnetic type the way a link, a saved view or the page spells it.
 *
 * Only the plain spelling of an offered type is a type: "1" or "2". A number
 * written another way ("1.0", " 1"), a type outside the family and anything
 * that is not a number are all no type, so a value from outside the app never
 * reaches {@link createMagnetKind}.
 * @param value - Text to read
 * @returns The type, or null when the text is not one of {@link MAGNET_TYPES}
 */
export function parseMagnetType(value: string): number | null {
  const type = MAGNET_TYPES.find((candidate) => String(candidate) === value);

  return type ?? null;
}

/**
 * How far an orbit has to get before it counts as having run off to infinity.
 *
 * The maps are rational, so a point far enough out is squared in effect and
 * leaves for good: at |z| = 100 the next step of either map is in the thousands
 * and every step after that is larger still, so no orbit that reaches it turns
 * back. The radius is not 2 as it is for the polynomial sets, because these
 * are not |z|^d + c and their escape is not governed by that inequality.
 */
export const MAGNET_BAILOUT = 100;

/**
 * How close |z - 1| must get before an orbit counts as having settled on the
 * attracting fixed point, which is what puts a point inside the Magnet set.
 *
 * z = 1 is a fixed point of both maps for every c (the two sides of the
 * fraction come to c/c in type I and to the same polynomial in type II), and
 * the set the picture draws is exactly the c whose orbit is drawn into it. The
 * tolerance is the one Newton's method is given for the same reason: it is far
 * finer than the picture can show and far looser than float64 can resolve, so
 * no point is judged stranded by rounding.
 */
export const MAGNET_TOLERANCE = 1e-6;

/** Complex helpers written out, so a step is plain real arithmetic. */
function multiply(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
  return {
    real: a.real * b.real - a.imaginary * b.imaginary,
    imaginary: a.real * b.imaginary + a.imaginary * b.real,
  };
}

function add(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
  return { real: a.real + b.real, imaginary: a.imaginary + b.imaginary };
}

function scale(a: ComplexNumber, factor: number): ComplexNumber {
  return { real: a.real * factor, imaginary: a.imaginary * factor };
}

function square(a: ComplexNumber): ComplexNumber {
  return multiply(a, a);
}

/** a / b as a * conj(b) / |b|^2. The caller has ruled out a zero b. */
function divide(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
  const magnitudeSquared = b.real * b.real + b.imaginary * b.imaginary;

  return {
    real: (a.real * b.real + a.imaginary * b.imaginary) / magnitudeSquared,
    imaginary: (a.imaginary * b.real - a.real * b.imaginary) / magnitudeSquared,
  };
}

/**
 * One step of a magnet map, the two sides of the fraction written out.
 *
 * Type I is the ratio ((z^2 + c - 1) / (2z + c - 2)) squared and type II is
 * ((z^3 + 3(c-1)z + (c-1)(c-2)) / (3z^2 + 3(c-2)z + (c-1)(c-2) + 1)) squared;
 * each is the same expression the Math card shows.
 *
 * The denominator's roots are the map's poles -- the points it sends to
 * infinity -- and a step from exactly one of them has no value, so it answers
 * null rather than a division by zero. That is a real point of the plane and
 * not a floating-point accident: at c = 2 the type I denominator is
 * 2z + c - 2 = 0 for the orbit's own start z = 0.
 * @param z - The point the orbit is at
 * @param c - The constant the picture is a picture of
 * @param type - The magnetic type, 1 or 2
 * @returns The next point, or null when the step has no value at z
 */
function magnetStep(
  z: ComplexNumber,
  c: ComplexNumber,
  type: number,
): ComplexNumber | null {
  const cMinusOne: ComplexNumber = {
    real: c.real - 1,
    imaginary: c.imaginary,
  };
  const cMinusTwo: ComplexNumber = {
    real: c.real - 2,
    imaginary: c.imaginary,
  };

  let numerator: ComplexNumber;
  let denominator: ComplexNumber;

  if (type === 2) {
    const product = multiply(cMinusOne, cMinusTwo);
    const squared = square(z);

    numerator = add(
      add(multiply(squared, z), scale(multiply(cMinusOne, z), 3)),
      product,
    );
    denominator = add(
      add(scale(squared, 3), scale(multiply(cMinusTwo, z), 3)),
      { real: product.real + 1, imaginary: product.imaginary },
    );
  } else {
    numerator = add(square(z), cMinusOne);
    denominator = {
      real: 2 * z.real + cMinusTwo.real,
      imaginary: 2 * z.imaginary + cMinusTwo.imaginary,
    };
  }

  if (denominator.real === 0 && denominator.imaginary === 0) return null;

  return square(divide(numerator, denominator));
}

/**
 * Walk one magnet orbit from z = 0 and count the steps it survives.
 *
 * The orbit starts at 0 for both types, and it ends in one of two ways. If it
 * comes within {@link MAGNET_TOLERANCE} of 1 the point is inside the set and
 * the count is the cap, which the colour mapping paints black like the inside
 * of any other set. If it leaves the radius of {@link MAGNET_BAILOUT} it is
 * outside, and the count is the steps it completed before the step that took
 * it out.
 *
 * Everything around that is the shared convention, so a colour scheme looks
 * here as it does anywhere else. The smooth count is the degree-2 formula the
 * other kinds use -- `n + 1 - log2(log|z| / log R)` -- with this kind's own
 * radius R in place of their 2. The radius has to appear: that expression is
 * the shared `n + 1 - log2(log2|z|)` exactly when R = 2, and with R = 100 the
 * same reading gives counts a shade under n + 1 for a point that stepped out
 * just past the radius and a shade under n for one that overshot by all of the
 * next squaring, rather than the two-and-three-quarter steps a formula that
 * left R out would move every point by.
 * @param c - Point in the complex plane to test
 * @param type - The magnetic type, 1 or 2
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it settles inside or never ends)
 */
function magnetIterations(
  c: ComplexNumber,
  type: number,
  maxIterations: number,
  smooth: boolean,
): number {
  let z: ComplexNumber = { real: 0, imaginary: 0 };

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    // The attractor is tested before the step, so a point that is already on
    // it is inside without a step being taken -- the same reading Newton's
    // root test has.
    if (Math.hypot(z.real - 1, z.imaginary) < MAGNET_TOLERANCE) {
      return maxIterations;
    }

    const next = magnetStep(z, c, type);

    // A pole has no next point: the orbit is gone, on the step it was at.
    if (next === null) return iterations;

    z = next;

    const magnitudeSquared = z.real * z.real + z.imaginary * z.imaginary;
    if (magnitudeSquared > MAGNET_BAILOUT * MAGNET_BAILOUT) {
      if (!smooth) return iterations;

      // An infinite magnitude (an overflow; a pole ends the orbit above
      // instead) has no size to smooth with, so the count is whole.
      const logModulus = Math.log(magnitudeSquared) / 2;
      const fraction =
        Math.log(logModulus / Math.log(MAGNET_BAILOUT)) / Math.LN2;

      return Number.isFinite(fraction) ? iterations + 1 - fraction : iterations;
    }
  }

  return maxIterations;
}

/**
 * A magnet map as a {@link FractalKind}: the point the renderer hands over is
 * the constant c the orbit started at 0 runs for.
 *
 * A family rather than a picture, like the Multibrot, so the picker carries
 * the magnetic type as the fractal's variant and `resolveFractalKind` builds
 * the kind from it.
 * @param type - The magnetic type, 1 or 2
 * @returns The kind that draws it
 * @throws RangeError when the type is not one of {@link MAGNET_TYPES}
 */
export function createMagnetKind(type: number): FractalKind {
  if (!MAGNET_TYPES.includes(type)) {
    throw new RangeError(
      `Magnet type must be one of ${MAGNET_TYPES.join(", ")}, got ${type}`,
    );
  }

  return {
    id: "magnet",
    iterations(point, maxIterations, smooth) {
      return magnetIterations(point, type, maxIterations, smooth);
    },
    escapeInfo(point, maxIterations) {
      // The count is a step count for this kind as it is for the escape-time
      // sets: a settled point is the cap, and the renderer paints it black.
      const steps = magnetIterations(point, type, maxIterations, false);

      return { steps, escaped: steps < maxIterations };
    },
    orbit(point, maxSteps) {
      // The count's own loop with the points kept, so the path the plot draws
      // is the path the colour was read from. The walk stops where the count
      // stops: on the point that settled on 1, on the step that left the
      // radius, on a pole (which has no next point to draw), or at maxSteps.
      const points: ComplexNumber[] = [{ real: 0, imaginary: 0 }];
      let z: ComplexNumber = { real: 0, imaginary: 0 };

      for (let steps = 0; steps < maxSteps; steps++) {
        if (Math.hypot(z.real - 1, z.imaginary) < MAGNET_TOLERANCE) break;

        const next = magnetStep(z, point, type);
        if (next === null) break;

        z = next;
        points.push({ real: z.real, imaginary: z.imaginary });

        if (
          z.real * z.real + z.imaginary * z.imaginary >
          MAGNET_BAILOUT * MAGNET_BAILOUT
        ) {
          break;
        }
      }

      return points;
    },
  };
}
