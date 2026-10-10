import { describe, expect, it } from "vitest";

import { EXPORT_MAX_PIXELS } from "../exportSize";
import {
  EXPORT_SHAPES,
  SCREEN_ASPECT,
  SCREEN_SHAPE_ID,
  exportFrame,
  exportShapeFor,
  wallpaperFileName,
  type ExportShape,
} from "../exportShape";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  calculateZoomBounds,
} from "../mandelbrot";
import type { FractalBounds } from "../../types/fractal";

/** Views to try a frame against: the opening one, a deep one, the deepest. */
const VIEWS: [number, number, number][] = [
  [-0.75, 0, 1],
  [-0.743643887037151, 0.13182590420533, 400],
  [0.36024044343761443, -0.6413130610648031, 2000],
  [-1.9, 1.2, 2.5],
];

/** The shapes that are not the screen: the ones with sizes of their own. */
const WALLPAPER_SHAPES = EXPORT_SHAPES.filter(
  (shape) => shape.id !== SCREEN_SHAPE_ID,
);

/** The width a set of bounds covers in the plane. */
function widthOf(bounds: FractalBounds): number {
  return bounds.maxReal - bounds.minReal;
}

/** The height a set of bounds covers in the plane. */
function heightOf(bounds: FractalBounds): number {
  return bounds.maxImaginary - bounds.minImaginary;
}

/** Every number of a set of bounds, for the finiteness check. */
function numbersOf(bounds: FractalBounds): number[] {
  return [
    bounds.minReal,
    bounds.maxReal,
    bounds.minImaginary,
    bounds.maxImaginary,
  ];
}

describe("the shapes", () => {
  it("opens on the screen", () => {
    // The control's first option is what the feature was before shapes
    // existed, and it is the fallback an id this build does not know gets.
    expect(EXPORT_SHAPES[0].id).toBe(SCREEN_SHAPE_ID);
    expect(EXPORT_SHAPES[0].label).toBe("Screen (4:3)");
    expect(SCREEN_ASPECT).toBe(BASE_WIDTH / BASE_HEIGHT);

    // The screen has no sizes of its own: its sizes are the whole multiples of
    // the canvas that `exportSize.ts` works out.
    expect(EXPORT_SHAPES[0].sizes).toEqual([]);
  });

  it("names the shapes the feature asks for", () => {
    expect(EXPORT_SHAPES.map((shape) => shape.label)).toEqual([
      "Screen (4:3)",
      "Desktop 16:9",
      "Phone 9:19.5",
      "Square 1:1",
    ]);
  });

  it("offers the sizes the feature asks for, smallest first", () => {
    const sizesOf = (id: string) =>
      exportShapeFor(id).sizes.map((size) => `${size.width}x${size.height}`);

    expect(sizesOf("desktop")).toEqual(["1920x1080", "2560x1440", "3840x2160"]);
    expect(sizesOf("phone")).toEqual(["1170x2532", "1290x2796"]);
    expect(sizesOf("square")).toEqual(["1080x1080", "2160x2160"]);
  });

  it("holds every shape and size to its guards", () => {
    const ids = EXPORT_SHAPES.map((shape) => shape.id);
    const labels = EXPORT_SHAPES.map((shape) => shape.label);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);

    for (const shape of WALLPAPER_SHAPES) {
      // A slug goes into a file name: it must not carry anything a filesystem
      // (or the extension split) has to be careful about.
      expect(shape.slug).toMatch(/^[0-9.x]+$/);
      expect(shape.aspect).toBeGreaterThan(0);
      expect(shape.sizes.length).toBeGreaterThanOrEqual(2);

      let lastPixels = 0;

      for (const size of shape.sizes) {
        // Whole pixels, ascending, and inside the budget: a wallpaper that
        // blew the cap would be refused rather than drawn.
        expect(Number.isInteger(size.width)).toBe(true);
        expect(Number.isInteger(size.height)).toBe(true);
        expect(size.width * size.height).toBeGreaterThan(lastPixels);
        expect(size.width * size.height).toBeLessThanOrEqual(EXPORT_MAX_PIXELS);
        lastPixels = size.width * size.height;

        // The published size is the shape it is filed under, rounded: a
        // 1170 x 2532 phone is 9:19.52 rather than 9:19.5.
        const aspect = size.width / size.height;
        expect(Math.abs(aspect / shape.aspect - 1)).toBeLessThan(0.01);
      }
    }
  });

  it("finds a shape by id, and the screen for one it does not know", () => {
    for (const shape of EXPORT_SHAPES) {
      expect(exportShapeFor(shape.id)).toBe(shape);
    }

    expect(exportShapeFor("wallpaper").id).toBe(SCREEN_SHAPE_ID);
    expect(exportShapeFor("").id).toBe(SCREEN_SHAPE_ID);
  });
});

describe("exportFrame", () => {
  it("returns the screen's own bounds for the screen's own shape", () => {
    // Byte for byte what the page draws, so the 4:3 shape is not a second
    // answer to a question the view already answers.
    for (const [centerX, centerY, zoom] of VIEWS) {
      expect(exportFrame(centerX, centerY, zoom, 4 / 3)).toEqual(
        calculateZoomBounds(centerX, centerY, zoom),
      );
    }
  });

  it("keeps the height and fills the sides for a wider shape", () => {
    const view = calculateZoomBounds(-0.75, 0, 1);
    const frame = exportFrame(-0.75, 0, 1, 16 / 9);

    // The view's own height, to the bit; the sides are what grows.
    expect(frame.minImaginary).toBe(view.minImaginary);
    expect(frame.maxImaginary).toBe(view.maxImaginary);
    expect(widthOf(frame)).toBeCloseTo(BASE_HEIGHT * (16 / 9), 12);
    expect(widthOf(frame)).toBeGreaterThan(widthOf(view));
    expect(frame.minReal).toBeLessThan(view.minReal);
    expect(frame.maxReal).toBeGreaterThan(view.maxReal);
  });

  it("keeps the width and fills above and below for a taller shape", () => {
    const view = calculateZoomBounds(-0.75, 0, 1);
    const frame = exportFrame(-0.75, 0, 1, 9 / 19.5);

    expect(frame.minReal).toBe(view.minReal);
    expect(frame.maxReal).toBe(view.maxReal);
    expect(heightOf(frame)).toBeCloseTo(BASE_WIDTH / (9 / 19.5), 12);
    expect(heightOf(frame)).toBeGreaterThan(heightOf(view));
  });

  it("keeps the width for a square", () => {
    // The one shape the feature's two rules agree about: a square is not wider
    // than the view, so it keeps the width and gains the room above and below.
    const view = calculateZoomBounds(0.25, -0.5, 32);
    const frame = exportFrame(0.25, -0.5, 32, 1);

    expect(frame.minReal).toBe(view.minReal);
    expect(frame.maxReal).toBe(view.maxReal);
    expect(widthOf(frame)).toBeCloseTo(heightOf(frame), 12);
    expect(heightOf(frame)).toBeGreaterThan(heightOf(view));
  });

  it("keeps the centre wherever it is", () => {
    for (const [centerX, centerY, zoom] of VIEWS) {
      for (const aspect of [16 / 9, 9 / 19.5, 1, 21 / 9]) {
        const frame = exportFrame(centerX, centerY, zoom, aspect);

        expect((frame.minReal + frame.maxReal) / 2).toBeCloseTo(centerX, 12);
        expect((frame.minImaginary + frame.maxImaginary) / 2).toBeCloseTo(
          centerY,
          12,
        );
      }
    }
  });

  it("contains the view on screen whatever the shape", () => {
    // The point of the whole framing rule: what the visitor is looking at is
    // inside the wallpaper rather than cropped off its edges.
    for (const [centerX, centerY, zoom] of VIEWS) {
      const view = calculateZoomBounds(centerX, centerY, zoom);

      for (const aspect of [16 / 9, 21 / 9, 9 / 19.5, 1, 3 / 4, 5 / 4, 4 / 3]) {
        const frame = exportFrame(centerX, centerY, zoom, aspect);

        expect(frame.minReal).toBeLessThanOrEqual(view.minReal);
        expect(frame.maxReal).toBeGreaterThanOrEqual(view.maxReal);
        expect(frame.minImaginary).toBeLessThanOrEqual(view.minImaginary);
        expect(frame.maxImaginary).toBeGreaterThanOrEqual(view.maxImaginary);
      }
    }
  });

  it("draws the shape it was asked for", () => {
    // The frame's own aspect is the picture's, so its pixels are square.
    for (const aspect of [16 / 9, 9 / 19.5, 1, 21 / 9, 4 / 3]) {
      const frame = exportFrame(-0.75, 0, 1, aspect);

      expect(widthOf(frame) / heightOf(frame)).toBeCloseTo(aspect, 12);
    }
  });

  it("draws every published size at that size's own aspect", () => {
    for (const shape of WALLPAPER_SHAPES) {
      for (const size of shape.sizes) {
        const aspect = size.width / size.height;
        const frame = exportFrame(-0.75, 0, 1, aspect);

        expect(widthOf(frame) / heightOf(frame)).toBeCloseTo(aspect, 12);
      }
    }
  });

  it("stays finite at the deepest zoom", () => {
    for (const shape of WALLPAPER_SHAPES) {
      for (const size of shape.sizes) {
        const frame = exportFrame(
          -0.743643887037151,
          0.13182590420533,
          MAX_ZOOM,
          size.width / size.height,
        );

        for (const value of numbersOf(frame)) {
          expect(Number.isFinite(value)).toBe(true);
        }

        expect(frame.minReal).toBeLessThan(frame.maxReal);
        expect(frame.minImaginary).toBeLessThan(frame.maxImaginary);
      }
    }
  });

  it("takes a zoom it cannot use as the shallowest one", () => {
    // The page clamps a zoom before it gets here; a value from anywhere else
    // must not put an infinity or a NaN into the renderer.
    const shallow = exportFrame(0, 0, MIN_ZOOM, 16 / 9);

    for (const zoom of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(exportFrame(0, 0, zoom, 16 / 9)).toEqual(shallow);
    }
  });

  it("takes an aspect it cannot use as the screen's own", () => {
    const screen = calculateZoomBounds(0, 0, 1);

    for (const aspect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(exportFrame(0, 0, 1, aspect)).toEqual(screen);
    }
  });
});

describe("wallpaperFileName", () => {
  it("marks the shape and the size before the extension", () => {
    const name = "mandelbrot_-0.75_0_1x.png";
    const desktop: ExportShape = exportShapeFor("desktop");

    expect(wallpaperFileName(name, desktop, 3840, 2160)).toBe(
      "mandelbrot_-0.75_0_1x_16x9_3840x2160.png",
    );
    expect(wallpaperFileName(name, exportShapeFor("phone"), 1170, 2532)).toBe(
      "mandelbrot_-0.75_0_1x_9x19.5_1170x2532.png",
    );
    expect(wallpaperFileName(name, exportShapeFor("square"), 1080, 1080)).toBe(
      "mandelbrot_-0.75_0_1x_1x1_1080x1080.png",
    );
  });

  it("names a name with no extension without inventing one", () => {
    expect(
      wallpaperFileName(
        "mandelbrot_0_0_1x",
        exportShapeFor("square"),
        2160,
        2160,
      ),
    ).toBe("mandelbrot_0_0_1x_1x1_2160x2160");
  });

  it("keeps every name a filesystem has to accept", () => {
    const view = "julia_0.285_0.01_1x.png";

    for (const shape of WALLPAPER_SHAPES) {
      for (const size of shape.sizes) {
        expect(wallpaperFileName(view, shape, size.width, size.height)).toMatch(
          /^[A-Za-z0-9._-]+$/,
        );
      }
    }
  });
});
