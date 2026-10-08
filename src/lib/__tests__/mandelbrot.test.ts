import { describe, expect, it } from "vitest";

import {
  ITERATION_STEP,
  MAX_ITERATIONS,
  MAX_ZOOM,
  MIN_ITERATIONS,
  MIN_ZOOM,
  autoIterations,
  boundsToView,
  calculateZoomBounds,
  clampZoom,
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
    expect(smoothMandelbrotIterations({ real: 0, imaginary: 0 }, 100)).toBe(
      100,
    );
  });

  it("returns a fractional count just past the escape step", () => {
    // z = 2 + 2i at the first step: 0 + 1 - log2(log2(sqrt(8))) = 0.4150375...
    expect(
      smoothMandelbrotIterations({ real: 2, imaginary: 2 }, 100),
    ).toBeCloseTo(0.4150375, 6);

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
      real: -2.75,
      imaginary: -1.5,
    });
    expect(pixelToComplex(800, 600, 800, 600, BOUNDS)).toEqual({
      real: 1.25,
      imaginary: 1.5,
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
  it("returns the classic Mandelbrot view at zoom 1", () => {
    expect(BOUNDS).toEqual({
      minReal: -2.75,
      maxReal: 1.25,
      minImaginary: -1.5,
      maxImaginary: 1.5,
    });
    expect(boundsToView(BOUNDS).scale).toBe(1);
  });
});

describe("calculateZoomBounds", () => {
  it("uses the 4 x 3 base view at zoom level 1", () => {
    const bounds = calculateZoomBounds(0, 0, 1);
    expect(bounds.maxReal - bounds.minReal).toBeCloseTo(4, 12);
    expect(bounds.maxImaginary - bounds.minImaginary).toBeCloseTo(3, 12);
  });

  it("halves the span each time the zoom level doubles, centred on the target", () => {
    const bounds = calculateZoomBounds(-0.75, 0.25, 2);
    expect(bounds.maxReal - bounds.minReal).toBeCloseTo(2, 12);
    expect(bounds.maxImaginary - bounds.minImaginary).toBeCloseTo(1.5, 12);
    expect((bounds.minReal + bounds.maxReal) / 2).toBeCloseTo(-0.75, 12);
    expect((bounds.minImaginary + bounds.maxImaginary) / 2).toBeCloseTo(
      0.25,
      12,
    );
  });
});

describe("clampZoom", () => {
  it("holds a zoom inside the range the explorer accepts", () => {
    expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(clampZoom(MIN_ZOOM - 0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(MAX_ZOOM + 1)).toBe(MAX_ZOOM);
  });

  it("leaves a zoom inside the range alone, to the last bit", () => {
    // The floor is the whole base view, and a gesture just inside it is a
    // notch the user asked for: clamping it to a level would swallow the step.
    for (const zoom of [1, 1.1, 1.21, 200, 9999.9]) {
      expect(clampZoom(zoom)).toBe(zoom);
    }
  });
});

describe("boundsToView", () => {
  it("reads the centre and zoom back out of the default bounds", () => {
    expect(boundsToView(BOUNDS)).toEqual({
      centerX: -0.75,
      centerY: 0,
      scale: 1,
    });
  });

  it("is the inverse of calculateZoomBounds", () => {
    for (const zoomLevel of [0.5, 1, 2, 1000]) {
      const view = boundsToView(calculateZoomBounds(-0.5, 0.25, zoomLevel));
      expect(view.centerX).toBeCloseTo(-0.5, 12);
      expect(view.centerY).toBeCloseTo(0.25, 12);
      // Deep zooms divide a small span back out, so the round trip is only
      // accurate to within a few units in the last place.
      expect(view.scale).toBeCloseTo(zoomLevel, 9);
    }
  });
});

describe("autoIterations", () => {
  it("scales the count with the zoom", () => {
    // 100 + 50 * log2(zoom), landing on the slider's ticks.
    expect(autoIterations(1)).toBe(100);
    expect(autoIterations(100)).toBe(430);
    expect(autoIterations(10000)).toBe(760);
  });

  it("hands back a count the slider can show, across the whole zoom range", () => {
    // Evenly spaced octaves plus the ends, so the ends of the range are checked
    // as exactly as the middle.
    for (let step = 0; step <= 100; step++) {
      const zoom = MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, step / 100);
      const iterations = autoIterations(zoom);

      expect(iterations % ITERATION_STEP).toBe(0);
      expect(iterations).toBeGreaterThanOrEqual(MIN_ITERATIONS);
      expect(iterations).toBeLessThanOrEqual(MAX_ITERATIONS);
    }

    expect(autoIterations(MIN_ZOOM)).toBe(100);
    expect(autoIterations(MAX_ZOOM)).toBe(760);
  });

  it("adds detail with every doubling of the zoom", () => {
    for (let zoom = MIN_ZOOM; zoom <= 5000; zoom *= 2) {
      expect(autoIterations(zoom * 2)).toBeGreaterThan(autoIterations(zoom));
    }
  });

  it("caps a zoom past the slider's ceiling at the top of its range", () => {
    // Nothing in the app asks for this: the zoom is clamped to MAX_ZOOM before
    // it gets here. The cap is what keeps the count inside the range the
    // control offers if one ever does.
    expect(autoIterations(1_000_000)).toBe(MAX_ITERATIONS);
  });

  it("keeps a zoom without an octave out of the renderer as a NaN count", () => {
    // A gesture can never produce these, but NaN survives min/max clamping and
    // reaches the render loop as a cap it cannot compare against.
    for (const zoom of [0, -1, NaN, Infinity]) {
      expect(autoIterations(zoom)).toBe(autoIterations(MIN_ZOOM));
    }
  });
});
