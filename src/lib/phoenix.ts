import type { ComplexNumber, FractalKind, TrapShape } from "../types/fractal";
import { TRAP_CYCLE_TOLERANCE, trapKey, trapKeyToDistance } from "./orbitTrap";

/**
 * A Phoenix constant with the label a picker shows for it.
 *
 * The two numbers sit in one {@link ComplexNumber} the way a Julia constant
 * does, which is how the page carries any constant, but they are not one
 * complex number: `real` is the c that is added at every step and `imaginary`
 * is the p that scales the point before the last.
 */
export interface PhoenixConstant {
  /** Display text for the constant, e.g. in a picker and a link */
  name: string;
  /** `real` is c, added each step; `imaginary` is p, the weight of z(n-1) */
  constant: ComplexNumber;
}

/**
 * The Phoenix constants whose pictures have names.
 *
 * The first is the classic: c = 0.5667, p = -0.5, the constant the fractal is
 * best known by. Each name says what the picture looks like, and each was
 * drawn at its whole-set place before it was kept.
 */
export const PHOENIX_CONSTANTS: readonly PhoenixConstant[] = [
  { name: "Classic", constant: { real: 0.5667, imaginary: -0.5 } },
  { name: "Spirals", constant: { real: 0.3, imaginary: 0.5 } },
  { name: "Hourglass", constant: { real: 0.5667, imaginary: -0.55 } },
];

/**
 * Read a Phoenix constant the way a link, a saved view or the page spells it.
 *
 * Only the name of an offered constant is one. Nothing is guessed (no case
 * folding, no trimming), so a value from outside the app never reaches
 * {@link createPhoenixKind}.
 * @param value - Text to read
 * @returns The constant, or null when the text names none of {@link PHOENIX_CONSTANTS}
 */
export function parsePhoenixConstant(
  value: string | null | undefined,
): ComplexNumber | null {
  if (typeof value !== "string") return null;

  return (
    PHOENIX_CONSTANTS.find((entry) => entry.name === value)?.constant ?? null
  );
}

/**
 * Walk one Phoenix orbit from the point and count the steps it survives.
 *
 * The step is z(n+1) = z(n)^2 + c + p z(n-1): the Julia step, with the point
 * before the last scaled by p and added in. Written out on the parts, that is
 * x' = x^2 - y^2 + c + p x_prev and y' = 2xy + p y_prev. The orbit starts at
 * the pixel, as a Julia orbit does, and z(-1) is 0, so the first step is the
 * Julia step; the second is the first to feel the extra term.
 *
 * Everything else is the Mandelbrot convention step for step -- the escape test
 * is |z|^2 > 4 read after the step, an escaping point is counted by the steps
 * it completed, and the smoothing is the same formula -- so a colour scheme
 * looks as it does on the other fractals. The radius 2 is still the right one
 * for the constants offered: with |c| + |p| well under 2 the next point is at
 * least |z|^2 - |c| - |p||z_prev|, which is past |z| for any |z| > 2 reached
 * from inside it.
 * @param start - The pixel's point, z(0)
 * @param constant - c in `real`, p in `imaginary`
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
function phoenixIterations(
  start: ComplexNumber,
  constant: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): number {
  const c = constant.real;
  const p = constant.imaginary;
  let real = start.real;
  let imaginary = start.imaginary;
  let previousReal = 0;
  let previousImaginary = 0;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    // z^2 + c, then the point before the last scaled by p.
    const nextReal = real * real - imaginary * imaginary + c + p * previousReal;
    const nextImaginary = 2 * real * imaginary + p * previousImaginary;
    previousReal = real;
    previousImaginary = imaginary;
    real = nextReal;
    imaginary = nextImaginary;

    const magnitudeSquared = real * real + imaginary * imaginary;
    if (magnitudeSquared > 4) {
      if (!smooth) {
        return iterations;
      }

      return iterations + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
    }
  }

  return maxIterations;
}

/**
 * The closest a Phoenix orbit comes to a trap shape: the count's own two-step
 * loop with a running minimum kept in place of the count, allocating nothing.
 * Counts the points the orbit lands on (the start, the pixel, is not one),
 * including the one that left the radius, and stops on the escape test, at the
 * cap, or when the orbit has closed on a cycle. The step remembers the point
 * before the last, so the cycle check compares the pair (z, z before it):
 * z alone repeating does not make the next step repeat.
 * @param start - The pixel's point, z(0)
 * @param constant - c in `real` and p in `imaginary`
 * @param maxIterations - Most steps to walk
 * @param shape - Which trap the distance is to
 * @returns The least distance reached, or Infinity when no step was measured
 */
function phoenixTrap(
  start: ComplexNumber,
  constant: ComplexNumber,
  maxIterations: number,
  shape: TrapShape,
): number {
  const c = constant.real;
  const p = constant.imaginary;
  let real = start.real;
  let imaginary = start.imaginary;
  let previousReal = 0;
  let previousImaginary = 0;
  let savedReal = real;
  let savedImaginary = imaginary;
  let savedPreviousReal = 0;
  let savedPreviousImaginary = 0;
  let sinceSave = 0;
  let saveEvery = 1;
  let least = Infinity;

  for (let steps = 0; steps < maxIterations; steps++) {
    const nextReal = real * real - imaginary * imaginary + c + p * previousReal;
    const nextImaginary = 2 * real * imaginary + p * previousImaginary;
    previousReal = real;
    previousImaginary = imaginary;
    real = nextReal;
    imaginary = nextImaginary;

    const key = trapKey(shape, real, imaginary);
    if (key < least) least = key;

    if (real * real + imaginary * imaginary > 4) break;

    if (
      Math.abs(real - savedReal) < TRAP_CYCLE_TOLERANCE &&
      Math.abs(imaginary - savedImaginary) < TRAP_CYCLE_TOLERANCE &&
      Math.abs(previousReal - savedPreviousReal) < TRAP_CYCLE_TOLERANCE &&
      Math.abs(previousImaginary - savedPreviousImaginary) <
        TRAP_CYCLE_TOLERANCE
    ) {
      break;
    }
    if (++sinceSave === saveEvery) {
      savedReal = real;
      savedImaginary = imaginary;
      savedPreviousReal = previousReal;
      savedPreviousImaginary = previousImaginary;
      saveEvery *= 2;
      sinceSave = 0;
    }
  }

  return trapKeyToDistance(shape, least);
}

/**
 * The Phoenix set for one constant, as a {@link FractalKind}.
 *
 * A kind keeps its own state, so the point before the last lives inside the
 * orbit loop and the renderer hands over a point as for any other fractal. A
 * family rather than a picture, like Julia, so the picker carries the constant
 * as the fractal's variant and `resolveFractalKind` builds the kind from it.
 * @param constant - c in `real`, p in `imaginary`
 * @returns The kind for that constant
 */
export function createPhoenixKind(constant: ComplexNumber): FractalKind {
  return {
    id: "phoenix",
    iterations(point, maxIterations, smooth) {
      return phoenixIterations(point, constant, maxIterations, smooth);
    },
    escapeInfo(point, maxIterations) {
      const steps = phoenixIterations(point, constant, maxIterations, false);

      return { steps, escaped: steps < maxIterations };
    },
    trapDistance(point, maxIterations, trap) {
      return phoenixTrap(point, constant, maxIterations, trap);
    },
    orbit(point, maxSteps) {
      // The count's own loop with the points kept, so the path the plot draws
      // is the path the colour was read from: it starts at the pixel and ends
      // on the point that left the radius, or after maxSteps.
      const points: ComplexNumber[] = [{ ...point }];
      let real = point.real;
      let imaginary = point.imaginary;
      let previousReal = 0;
      let previousImaginary = 0;

      for (let steps = 0; steps < maxSteps; steps++) {
        const nextReal =
          real * real -
          imaginary * imaginary +
          constant.real +
          constant.imaginary * previousReal;
        const nextImaginary =
          2 * real * imaginary + constant.imaginary * previousImaginary;
        previousReal = real;
        previousImaginary = imaginary;
        real = nextReal;
        imaginary = nextImaginary;
        points.push({ real, imaginary });

        if (real * real + imaginary * imaginary > 4) break;
      }

      return points;
    },
  };
}
