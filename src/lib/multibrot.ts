import type { ComplexNumber, FractalKind, TrapShape } from "../types/fractal";
import { TRAP_CYCLE_TOLERANCE, trapKey, trapKeyToDistance } from "./orbitTrap";

/**
 * The powers the Multibrot offers. With d = 2 the iteration is the Mandelbrot
 * set's own, which the picker already has, so the family starts at 3.
 */
export const MULTIBROT_POWERS: readonly number[] = [3, 4, 5];

/**
 * Read a power the way a link, a saved view or the page spells it.
 *
 * Only the plain spelling of an offered power is a power: "3", "4" or "5". A
 * number written another way ("3.0", "03", " 4"), a power outside the family
 * and anything that is not a number are all no power, so a value from outside
 * the app never reaches {@link createMultibrotKind}.
 * @param value - Text to read
 * @returns The power, or null when the text is not one of {@link MULTIBROT_POWERS}
 */
export function parseMultibrotPower(value: string): number | null {
  const power = MULTIBROT_POWERS.find(
    (candidate) => String(candidate) === value,
  );

  return power ?? null;
}

/**
 * Walk one Multibrot orbit from z = 0 and count the steps it survives.
 *
 * The Mandelbrot loop with a higher power: z -> z^d + c. Everything around the
 * step is the Mandelbrot convention -- the orbit starts at 0, the escape test
 * is |z|^2 > 4 read after the step, a point that escapes is counted by the
 * steps it completed -- so a colour scheme looks the same here as elsewhere.
 * Radius 2 is a safe escape radius for every power: once |z| > 2 and |c| <= 2,
 * |z^d + c| >= |z|^d - 2 > |z|, so the orbit only grows.
 *
 * z^d is built by multiplying z into a running product d - 1 times, which
 * keeps the arithmetic to real multiplications and additions (a power function
 * on a complex number would go through polar form and lose the exactness the
 * symmetry tests rely on).
 *
 * The smooth count replaces the Mandelbrot's log base 2 with log base d. An
 * escaping orbit grows like |z| -> |z|^d, so log|z| grows by a factor d each
 * step and the fraction of a step is log_d(log|z| / log 2):
 * iterations + 1 - log(log|z| / log 2) / log(d).
 * @param c - Point in the complex plane to test
 * @param power - The power d, 3 to 5
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
function multibrotIterations(
  c: ComplexNumber,
  power: number,
  maxIterations: number,
  smooth: boolean,
): number {
  let real = 0;
  let imaginary = 0;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    // z^d by repeated complex multiplication, then + c.
    let powerReal = real;
    let powerImaginary = imaginary;
    for (let factor = 1; factor < power; factor++) {
      const nextReal = powerReal * real - powerImaginary * imaginary;
      powerImaginary = powerReal * imaginary + powerImaginary * real;
      powerReal = nextReal;
    }
    real = powerReal + c.real;
    imaginary = powerImaginary + c.imaginary;

    const magnitudeSquared = real * real + imaginary * imaginary;
    if (magnitudeSquared > 4) {
      if (!smooth) {
        return iterations;
      }

      const logModulus = Math.log(magnitudeSquared) / 2;
      return iterations + 1 - Math.log(logModulus / Math.LN2) / Math.log(power);
    }
  }

  return maxIterations;
}

/**
 * The Multibrot set of one power as a {@link FractalKind}: the point the
 * renderer hands over is the constant c the orbit z -> z^d + c is added to.
 *
 * A family rather than a picture, like Julia, so the picker carries the power
 * as the fractal's variant; `resolveFractalKind` builds the kind from it.
 * @param power - The power d, an integer from 3 to 5
 * @returns The kind that draws it
 * @throws RangeError when the power is not one of {@link MULTIBROT_POWERS}
 */
/**
 * The closest a Multibrot orbit from z = 0 comes to a trap shape: the count's
 * own loop with a running minimum kept in place of the count, allocating
 * nothing. Counts the points the orbit lands on (the start is not one),
 * including the one that left the radius, and stops on the escape test, at the
 * cap, or when the orbit has closed on a cycle (Brent's check; see
 * `escapeTimeTrap` in mandelbrot.ts). The kind's `orbit` walk is the oracle
 * that holds it to the other copies of this loop (`trapDistance.test.ts`).
 * @param c - Point in the complex plane to test
 * @param power - The exponent d of z^d + c
 * @param maxIterations - Most steps to walk
 * @param shape - Which trap the distance is to
 * @returns The least distance reached, or Infinity when no step was measured
 */
function multibrotTrap(
  c: ComplexNumber,
  power: number,
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
    let powerReal = real;
    let powerImaginary = imaginary;
    for (let factor = 1; factor < power; factor++) {
      const nextReal = powerReal * real - powerImaginary * imaginary;
      powerImaginary = powerReal * imaginary + powerImaginary * real;
      powerReal = nextReal;
    }
    real = powerReal + c.real;
    imaginary = powerImaginary + c.imaginary;

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

export function createMultibrotKind(power: number): FractalKind {
  if (!MULTIBROT_POWERS.includes(power)) {
    throw new RangeError(
      `Multibrot power must be one of ${MULTIBROT_POWERS.join(", ")}, got ${power}`,
    );
  }

  return {
    id: "multibrot",
    iterations(point, maxIterations, smooth) {
      return multibrotIterations(point, power, maxIterations, smooth);
    },
    escapeInfo(point, maxIterations) {
      const steps = multibrotIterations(point, power, maxIterations, false);

      return { steps, escaped: steps < maxIterations };
    },
    trapDistance(point, maxIterations, trap) {
      return multibrotTrap(point, power, maxIterations, trap);
    },
    orbit(point, maxSteps) {
      // The count's own loop with the points kept, so the path the plot draws
      // is the path the colour was read from.
      const points: ComplexNumber[] = [{ real: 0, imaginary: 0 }];
      let real = 0;
      let imaginary = 0;

      for (let steps = 0; steps < maxSteps; steps++) {
        let powerReal = real;
        let powerImaginary = imaginary;
        for (let factor = 1; factor < power; factor++) {
          const nextReal = powerReal * real - powerImaginary * imaginary;
          powerImaginary = powerReal * imaginary + powerImaginary * real;
          powerReal = nextReal;
        }
        real = powerReal + point.real;
        imaginary = powerImaginary + point.imaginary;
        points.push({ real, imaginary });

        if (real * real + imaginary * imaginary > 4) break;
      }

      return points;
    },
  };
}
