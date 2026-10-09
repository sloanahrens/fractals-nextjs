import { describe, expect, it } from "vitest";

import type {
  ComplexNumber,
  FractalConfig,
  FractalKind,
} from "../../types/fractal";
import { mapIterationsToColor } from "../colorMapping";
import { FractalRenderer } from "../fractalRenderer";
import { mandelbrotIterations, pixelToComplex } from "../mandelbrot";

interface KindCall {
  point: ComplexNumber;
  maxIterations: number;
  smooth: boolean;
}

/** A kind that records its calls and returns whatever count it was built with. */
function constantKind(value: number, calls: KindCall[]): FractalKind {
  return {
    id: "constant",
    iterations(point, maxIterations, smooth) {
      calls.push({ point, maxIterations, smooth });
      return value;
    },
  };
}

const CLASSIC_BOUNDS = {
  minReal: -2,
  maxReal: 2,
  minImaginary: -1,
  maxImaginary: 1,
};

function renderConfig(overrides: Partial<FractalConfig> = {}): FractalConfig {
  return {
    bounds: CLASSIC_BOUNDS,
    maxIterations: 100,
    width: 8,
    height: 8,
    colorScheme: "grayscale",
    ...overrides,
  };
}

/**
 * The smallest stand-in for a 2D canvas that FractalRenderer touches
 * (createImageData / putImageData / width / height), so the pixel pipeline can
 * run in Node without a browser or the native canvas package.
 */
function createFakeCanvas(width: number, height: number) {
  const state = {
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4),
  };

  const context = {
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: (image: { data: Uint8ClampedArray }) => {
      state.pixels.set(image.data);
    },
  };

  const canvas = {
    get width() {
      return state.width;
    },
    set width(value: number) {
      state.width = value;
      state.pixels = new Uint8ClampedArray(state.width * state.height * 4);
    },
    get height() {
      return state.height;
    },
    set height(value: number) {
      state.height = value;
      state.pixels = new Uint8ClampedArray(state.width * state.height * 4);
    },
    getContext: () => context,
  };

  return {
    element: canvas as unknown as HTMLCanvasElement,
    pixelAt: (x: number, y: number): number[] => {
      const index = (y * state.width + x) * 4;
      return Array.from(state.pixels.slice(index, index + 4));
    },
  };
}

describe("FractalRenderer", () => {
  it("refuses a canvas that has no 2D context", () => {
    const canvas = {
      width: 8,
      height: 8,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;

    expect(() => new FractalRenderer(canvas)).toThrow(/2D rendering context/);
  });

  it("reports not rendering before and after a render", async () => {
    const { element } = createFakeCanvas(8, 8);
    const renderer = new FractalRenderer(element);

    expect(renderer.isCurrentlyRendering()).toBe(false);
    await renderer.renderFractal(renderConfig(), undefined, false);
    expect(renderer.isCurrentlyRendering()).toBe(false);
  });

  it("paints in-set pixels black and escaping pixels on the ramp", async () => {
    const { element, pixelAt } = createFakeCanvas(8, 8);
    const renderer = new FractalRenderer(element);
    await renderer.renderFractal(renderConfig(), undefined, false);

    // The bounds are symmetric about the origin, so the middle pixel is c = 0,
    // which is inside the set and must come out black.
    expect(pixelAt(4, 4)).toEqual([0, 0, 0, 255]);
    // c = -1 sits in the set too.
    expect(pixelAt(2, 4)).toEqual([0, 0, 0, 255]);
    // c = 1 escapes after two iterations: 2/100 of the grayscale ramp.
    expect(pixelAt(6, 4)).toEqual([5, 5, 5, 255]);
  });

  it("fills every pixel of the canvas opaquely", async () => {
    const { element, pixelAt } = createFakeCanvas(8, 8);
    const renderer = new FractalRenderer(element);
    await renderer.renderFractal(renderConfig(), undefined, false);

    let shaded = 0;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [r, g, b, a] = pixelAt(x, y);
        expect(a).toBe(255);
        if (r || g || b) shaded++;
      }
    }
    expect(shaded).toBeGreaterThan(0);
  });

  it("renders the region the bounds describe", async () => {
    const { element, pixelAt } = createFakeCanvas(8, 8);
    const renderer = new FractalRenderer(element);

    await renderer.renderFractal(
      renderConfig({
        colorScheme: "classic",
        bounds: { minReal: -4, maxReal: 0, minImaginary: -1, maxImaginary: 1 },
      }),
      undefined,
      false,
    );

    // real = -4 + x/2, so column 6 is c = -1: inside the set, painted black.
    expect(pixelAt(6, 4)).toEqual([0, 0, 0, 255]);
    // Column 0 is c = -4, which escapes on the first iteration and takes the
    // t = 0 colour of the classic ramp.
    expect(pixelAt(0, 4)).toEqual([0, 191, 191, 255]);
  });

  it("reports non-decreasing progress that finishes at 1", async () => {
    const { element } = createFakeCanvas(10, 10);
    const renderer = new FractalRenderer(element);
    const progress: number[] = [];

    await renderer.renderFractal(
      renderConfig({ width: 10, height: 10 }),
      (value) => progress.push(value),
      false,
    );

    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(1);
    for (const [index, value] of progress.entries()) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
      if (index > 0) {
        expect(value).toBeGreaterThanOrEqual(progress[index - 1]);
      }
    }
  });

  it("resizes the canvas when the config asks for a new size", async () => {
    const { element } = createFakeCanvas(8, 8);
    const renderer = new FractalRenderer(element);

    await renderer.renderFractal(renderConfig(), undefined, false);
    await renderer.renderFractal(renderConfig({ width: 10, height: 6 }), undefined, false);

    expect(element.width).toBe(10);
    expect(element.height).toBe(6);
  });

  it("renders a canvas smaller than one chunk without spinning", async () => {
    // 2x2 is only four pixels, so the chunk size derived from the pixel count
    // rounds to zero; the renderer must still make progress.
    const { element, pixelAt } = createFakeCanvas(2, 2);
    const renderer = new FractalRenderer(element);

    await renderer.renderFractal(
      renderConfig({
        width: 2,
        height: 2,
        bounds: { minReal: 0, maxReal: 4, minImaginary: -2, maxImaginary: 2 },
      }),
      undefined,
      false,
    );

    // c = 2 survives its first step at |z|^2 = 4 and escapes on the second:
    // 1/100 of the grayscale ramp.
    expect(pixelAt(1, 1)).toEqual([2, 2, 2, 255]);
  }, 2000);
});

describe("FractalRenderer fractal kind", () => {
  it("asks the kind it was given for every pixel's iteration count", async () => {
    const { element } = createFakeCanvas(4, 3);
    const calls: KindCall[] = [];
    const renderer = new FractalRenderer(element, constantKind(50, calls));

    await renderer.renderFractal(
      renderConfig({ width: 4, height: 3 }),
      undefined,
      false,
    );

    // Every pixel of the canvas, each with the complex point it maps to and
    // the cap the config asked for. The chunks of a row are rendered
    // concurrently, so the calls are matched by the point, not by their order.
    expect(calls).toHaveLength(12);
    expect(calls.every((call) => call.maxIterations === 100)).toBe(true);
    expect(calls.every((call) => call.smooth === false)).toBe(true);

    const expected: string[] = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        const point = pixelToComplex(x, y, 4, 3, CLASSIC_BOUNDS);
        expected.push(`${point.real},${point.imaginary}`);
      }
    }

    const points = calls
      .map((call) => `${call.point.real},${call.point.imaginary}`)
      .sort();
    expect(points).toEqual(expected.sort());
  });

  it("paints what the kind returns", async () => {
    const { element, pixelAt } = createFakeCanvas(4, 3);
    const renderer = new FractalRenderer(element, constantKind(50, []));

    await renderer.renderFractal(
      renderConfig({ width: 4, height: 3 }),
      undefined,
      false,
    );

    // 50 of 100 on the grayscale ramp, the same shade in every pixel because
    // the kind answered the same count for every one of them.
    const expected = mapIterationsToColor(50, 100, "grayscale");
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        expect(pixelAt(x, y)).toEqual([
          expected.r,
          expected.g,
          expected.b,
          255,
        ]);
      }
    }
  });

  it("hands the smooth flag through to the kind", async () => {
    const { element } = createFakeCanvas(4, 3);
    const calls: KindCall[] = [];
    const renderer = new FractalRenderer(element, constantKind(50, calls));

    await renderer.renderFractal(
      renderConfig({ width: 4, height: 3 }),
      undefined,
      true,
    );

    expect(calls).toHaveLength(12);
    expect(calls.every((call) => call.smooth === true)).toBe(true);
  });

  it("draws what the Mandelbrot functions draw when no kind is given", async () => {
    const { element, pixelAt } = createFakeCanvas(8, 8);
    const config = renderConfig();
    const renderer = new FractalRenderer(element);

    await renderer.renderFractal(config, undefined, false);

    // The same canvas, coloured from the iteration counts the Mandelbrot
    // functions give directly: reaching them through a kind moves no pixel.
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const point = pixelToComplex(x, y, 8, 8, CLASSIC_BOUNDS);
        const expected = mapIterationsToColor(
          mandelbrotIterations(point, config.maxIterations),
          config.maxIterations,
          config.colorScheme,
        );
        expect(pixelAt(x, y)).toEqual([
          expected.r,
          expected.g,
          expected.b,
          255,
        ]);
      }
    }
  });
});
