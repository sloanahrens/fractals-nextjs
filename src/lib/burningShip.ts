import type { ComplexNumber, FractalKind } from "../types/fractal";

/**
 * Walk one Burning Ship orbit from z = 0 and count the steps it survives.
 *
 * The Mandelbrot loop with one change: both parts of z are folded onto the
 * positive side before squaring, so the step is
 * z -> (|Re z| + i |Im z|)^2 + c. Everything around that is the Mandelbrot
 * convention step for step -- the orbit starts at 0, the escape test is the
 * same |z|^2 > 4 read after the step, a point that escapes is counted by the
 * steps it completed and the smoothing is the same formula -- so a colour
 * scheme looks the same on this fractal as on that one.
 *
 * The magnitudes are taken from z at the top of the step, which is the z the
 * step squares. On the real axis the fold changes nothing, so this kind counts
 * exactly what the Mandelbrot set counts there; off the axis it is the fold
 * that draws the ship's hull and masts.
 * @param c - Point in the complex plane to test
 * @param maxIterations - Maximum number of iterations to perform
 * @param smooth - Whether to return the fractional (smooth) count
 * @returns Number of iterations before the point escapes (or maxIterations if it doesn't escape)
 */
function burningShipIterations(
  c: ComplexNumber,
  maxIterations: number,
  smooth: boolean,
): number {
  let real = 0;
  let imaginary = 0;

  for (let iterations = 0; iterations < maxIterations; iterations++) {
    // The ship's own step: fold both parts onto the positive side, then square
    // and add c, which is the Mandelbrot step on the folded z.
    const magnitudeReal = Math.abs(real);
    const magnitudeImaginary = Math.abs(imaginary);

    const squaredReal =
      magnitudeReal * magnitudeReal - magnitudeImaginary * magnitudeImaginary;
    const squaredImaginary = 2 * magnitudeReal * magnitudeImaginary;
    real = squaredReal + c.real;
    imaginary = squaredImaginary + c.imaginary;

    // Check if point has escaped (magnitude > 2)
    const magnitudeSquared = real * real + imaginary * imaginary;
    if (magnitudeSquared > 4) {
      if (!smooth) {
        return iterations;
      }

      // Smooth iteration calculation for better color gradients
      const smoothIterations =
        iterations + 1 - Math.log2(Math.log2(Math.sqrt(magnitudeSquared)));
      return smoothIterations;
    }
  }

  return maxIterations;
}

/**
 * The Burning Ship as a {@link FractalKind}: the point the renderer hands over
 * is the constant c the folded orbit is added to.
 *
 * This one is a single picture rather than a family like Julia, so its id is
 * all the picker has to carry for it.
 */
export const burningShipKind: FractalKind = {
  id: "burning-ship",
  iterations(point, maxIterations, smooth) {
    return burningShipIterations(point, maxIterations, smooth);
  },
  escapeInfo(point, maxIterations) {
    const steps = burningShipIterations(point, maxIterations, false);

    return { steps, escaped: steps < maxIterations };
  },
  orbit(point, maxSteps) {
    // The count's own loop with the points kept, so the path the plot draws is
    // the path the colour was read from.
    const points: ComplexNumber[] = [{ real: 0, imaginary: 0 }];
    let real = 0;
    let imaginary = 0;

    for (let steps = 0; steps < maxSteps; steps++) {
      const magnitudeReal = Math.abs(real);
      const magnitudeImaginary = Math.abs(imaginary);

      const squaredReal =
        magnitudeReal * magnitudeReal - magnitudeImaginary * magnitudeImaginary;
      const squaredImaginary = 2 * magnitudeReal * magnitudeImaginary;
      real = squaredReal + point.real;
      imaginary = squaredImaginary + point.imaginary;
      points.push({ real, imaginary });

      if (real * real + imaginary * imaginary > 4) break;
    }

    return points;
  },
};
