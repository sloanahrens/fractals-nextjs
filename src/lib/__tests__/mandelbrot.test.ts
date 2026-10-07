import { describe, expect, it } from "vitest";

import {
  calculateZoomBounds,
  complexToPixel,
  getDefaultBounds,
  mandelbrotIterations,
  pixelToComplex,
  smoothMandelbrotIterations,
} from "../mandelbrot";

const BOUNDS = getDefaultBounds();

describe("mandelbrotIterations", () => {
  it("returns the iteration cap for points that stay bounded", () => {
    // c = 0 is the fixed point at the origin; c = -1 falls into a 2-cycle;
    // the whole real segment [-2, 0.25] is inside the set.
    expect(mandelbrotIterations({ real: 0, imaginary: 0 }, 100)).toBe(100);
    expect(mandelbrotIterations({ real: -1, imaginary: 0 }, 100)).toBe(100);
    expect(mandelbrotIterations({ real: -1.3, imaginary: 0 }, 250)).toBe(250);
  });

  it("stops counting as soon as the orbit leaves the radius-2 disk", () => {
    // Iteration 1: z = 2 + 2i, |z|^2 = 8 > 4, so the escape is caught immediately.
    expect(mandelbrotIterations({ real: 2, imaginary: 2 }, 100)).toBe(0);
    // 0.5 -> 0.75 -> 1.0625 -> 1.62890625 -> 3.1533...: escapes on the fifth step.
    expect(mandelbrotIterations({ real: 0.5, imaginary: 0 }, 100)).toBe(4);
    // 1 -> 2 -> 5: escapes on the third step.
    expect(mandelbrotIterations({ real: 1, imaginary: 0 }, 100)).toBe(2);
  });

  it("never reports more iterations than the cap it was given", () => {
    for (const cap of [1, 2, 5, 50]) {
      for (const c of [
        { real: -0.75, imaginary: 0.1 },
        { real: 0.3, imaginary: 0.5 },
        { real: -1.7, imaginary: -0.02 },
      ]) {
        const iterations = mandelbrotIterations(c, cap);
        expect(Number.isInteger(iterations)).toBe(true);
        expect(iterations).toBeGreaterThanOrEqual(0);
        expect(iterations).toBeLessThanOrEqual(cap);
      }
    }
  });
});

describe("smoothMandelbrotIterations", () => {
  it("returns the raw cap for points that never escaped", () => {
    expect(smoothMandelbrotIterations({ real: 0, imaginary: 0 }, 100)).toBe(100);
  });

  it("returns a fractional count just past the escape step", () => {
    // z = 2 + 2i at the first step: 0 + 1 - log2(log2(sqrt(8))) = 0.4150375...
    expect(smoothMandelbrotIterations({ real: 2, imaginary: 2 }, 100)).toBeCloseTo(
      0.4150375,
      6,
    );

    // The same orbit as the integer test above, landing between 4 and 5.
    const smooth = smoothMandelbrotIterations({ real: 0.5, imaginary: 0 }, 100);
    expect(smooth).toBeGreaterThan(4);
    expect(smooth).toBeLessThan(5);
    expect(smooth).toBeCloseTo(4.2717, 3);
    expect(Number.isInteger(smooth)).toBe(false);
  });
});

describe("pixelToComplex", () => {
  it("maps the pixel corners onto the bound corners", () => {
    expect(pixelToComplex(0, 0, 800, 600, BOUNDS)).toEqual({
      real: -2.5,
      imaginary: -1.25,
    });
    expect(pixelToComplex(800, 600, 800, 600, BOUNDS)).toEqual({
      real: 1.0,
      imaginary: 1.25,
    });
  });

  it("maps the canvas centre onto the centre of the bounds", () => {
    expect(pixelToComplex(400, 300, 800, 600, BOUNDS)).toEqual({
      real: -0.75,
      imaginary: 0,
    });
  });

  it("increases the imaginary part downwards, matching screen rows", () => {
    const top = pixelToComplex(0, 0, 800, 600, BOUNDS);
    const bottom = pixelToComplex(0, 600, 800, 600, BOUNDS);
    expect(bottom.imaginary).toBeGreaterThan(top.imaginary);
  });
});

describe("complexToPixel", () => {
  it("is the inverse of pixelToComplex", () => {
    for (const [x, y] of [
      [0, 0],
      [137, 42],
      [799, 599],
    ]) {
      const complex = pixelToComplex(x, y, 800, 600, BOUNDS);
      const pixel = complexToPixel(complex, 800, 600, BOUNDS);
      expect(pixel.x).toBeCloseTo(x, 9);
      expect(pixel.y).toBeCloseTo(y, 9);
    }
  });
});

describe("getDefaultBounds", () => {
  it("returns the classic Mandelbrot view", () => {
    expect(BOUNDS).toEqual({
      minReal: -2.5,
      maxReal: 1.0,
      minImaginary: -1.25,
      maxImaginary: 1.25,
    });
  });
});

describe("calculateZoomBounds", () => {
  it("uses the 3.5 x 2.5 base view at zoom level 1", () => {
    const bounds = calculateZoomBounds(0, 0, 1);
    expect(bounds.maxReal - bounds.minReal).toBeCloseTo(3.5, 12);
    expect(bounds.maxImaginary - bounds.minImaginary).toBeCloseTo(2.5, 12);
  });

  it("halves the span each time the zoom level doubles, centred on the target", () => {
    const bounds = calculateZoomBounds(-0.75, 0.25, 2);
    expect(bounds.maxReal - bounds.minReal).toBeCloseTo(1.75, 12);
    expect(bounds.maxImaginary - bounds.minImaginary).toBeCloseTo(1.25, 12);
    expect((bounds.minReal + bounds.maxReal) / 2).toBeCloseTo(-0.75, 12);
    expect((bounds.minImaginary + bounds.maxImaginary) / 2).toBeCloseTo(0.25, 12);
  });
});
