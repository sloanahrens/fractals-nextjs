/**
 * The Julia map's arithmetic: the inset's pixels and the plane's points
 *
 * What the component draws and what the page does with a pick are panel tests'
 * business. This drives the two mappings, which are each other's inverse, and
 * the arrow-key step, so a pick lands where the pointer is and a ring sits where
 * the constant is.
 */
import { describe, expect, it } from "vitest";

import { JULIA_CONSTANTS, customConstantName } from "../julia";
import {
  JULIA_MAP_ARROW_STEP,
  JULIA_MAP_HEIGHT,
  JULIA_MAP_ITERATIONS,
  JULIA_MAP_LABEL,
  JULIA_MAP_WIDTH,
  complexToInsetPoint,
  insetPointToComplex,
  juliaMapBounds,
  stepJuliaMapPoint,
} from "../juliaMap";
import { calculateZoomBounds } from "../mandelbrot";
import type { ComplexNumber, FractalBounds } from "../../types/fractal";

const BOUNDS = juliaMapBounds();

/** The plane distance one pixel covers, on each axis. */
const PIXEL_REAL = (BOUNDS.maxReal - BOUNDS.minReal) / JULIA_MAP_WIDTH;
const PIXEL_IMAGINARY =
  (BOUNDS.maxImaginary - BOUNDS.minImaginary) / JULIA_MAP_HEIGHT;

describe("the map's frame", () => {
  it("is the base view centred on the origin", () => {
    expect(BOUNDS).toEqual(calculateZoomBounds(0, 0, 1));
    expect(BOUNDS.minReal).toBe(-2);
    expect(BOUNDS.maxReal).toBe(2);
    expect(BOUNDS.minImaginary).toBe(-1.5);
    expect(BOUNDS.maxImaginary).toBe(1.5);
  });

  it("holds the whole Mandelbrot set", () => {
    // The set spans x -2..0.25 and y about +-1.15: the left tip sits on the
    // frame's left edge, which is where the picture of the set has always ended.
    expect(BOUNDS.minReal).toBeLessThanOrEqual(-2);
    expect(BOUNDS.maxReal).toBeGreaterThanOrEqual(0.25);
    expect(BOUNDS.maxImaginary).toBeGreaterThan(1.2);
    expect(BOUNDS.minImaginary).toBeLessThan(-1.2);
  });

  it("is the region a constant may name, so every point of it is pickable", () => {
    // Every corner and every named constant has to come back as a name, because
    // a pick the app refuses would leave the picture where it was under a
    // pointer that looks like it is doing something.
    const corners: ComplexNumber[] = [
      { real: BOUNDS.minReal, imaginary: BOUNDS.minImaginary },
      { real: BOUNDS.maxReal, imaginary: BOUNDS.maxImaginary },
      { real: BOUNDS.minReal, imaginary: BOUNDS.maxImaginary },
      { real: BOUNDS.maxReal, imaginary: BOUNDS.minImaginary },
      ...JULIA_CONSTANTS.map((named) => named.constant),
    ];

    for (const point of corners) {
      expect(customConstantName(point.real, point.imaginary)).not.toBeNull();
    }
  });

  it("draws at a cap low enough to stay a chart", () => {
    // The map is drawn once per scheme and sits in the drawer, so its cap is
    // the point of whether it is cheap: a boundary point of the set is a pixel
    // wide at 160 x 120 whatever the count.
    expect(JULIA_MAP_ITERATIONS).toBeGreaterThan(0);
    expect(JULIA_MAP_ITERATIONS).toBeLessThanOrEqual(100);
  });

  it("is the inset's own shape, so the map is not stretched", () => {
    expect(JULIA_MAP_WIDTH / JULIA_MAP_HEIGHT).toBeCloseTo(
      (BOUNDS.maxReal - BOUNDS.minReal) /
        (BOUNDS.maxImaginary - BOUNDS.minImaginary),
      10,
    );
  });

  it("names what it is for anyone who cannot see it", () => {
    expect(JULIA_MAP_LABEL).toBe(
      "Pick the Julia constant on the Mandelbrot map",
    );
  });
});

describe("a pixel of the inset", () => {
  it("is the plane point it covers", () => {
    expect(insetPointToComplex(0, 0, 160, 120, BOUNDS)).toEqual({
      real: BOUNDS.minReal,
      imaginary: BOUNDS.minImaginary,
    });
    expect(
      insetPointToComplex(JULIA_MAP_WIDTH, JULIA_MAP_HEIGHT, 160, 120, BOUNDS),
    ).toEqual({
      real: BOUNDS.maxReal,
      imaginary: BOUNDS.maxImaginary,
    });
    // The middle of the inset is the middle of the frame.
    expect(insetPointToComplex(80, 60, 160, 120, BOUNDS)).toEqual({
      real: 0,
      imaginary: 0,
    });
  });

  it("moves by one pixel a step across, and up the picture for the plane's up", () => {
    const here = insetPointToComplex(40, 30, 160, 120, BOUNDS);
    const right = insetPointToComplex(41, 30, 160, 120, BOUNDS);
    const down = insetPointToComplex(40, 31, 160, 120, BOUNDS);

    expect(right.real - here.real).toBeCloseTo(PIXEL_REAL, 12);
    expect(right.imaginary).toBeCloseTo(here.imaginary, 12);
    // Row 31 is further down the picture, and this app draws the plane with its
    // imaginary part growing down the canvas (`pixelToComplex`), so the point
    // below is the one with the larger imaginary part. The map is drawn by that
    // same rule, which is what puts the ring where the constant really is.
    expect(down.imaginary - here.imaginary).toBeCloseTo(PIXEL_IMAGINARY, 12);
  });

  it("is held inside the inset when it is outside", () => {
    const held = insetPointToComplex(-10, -10, 160, 120, BOUNDS);
    const far = insetPointToComplex(1e6, 1e6, 160, 120, BOUNDS);

    expect(held).toEqual({
      real: BOUNDS.minReal,
      imaginary: BOUNDS.minImaginary,
    });
    expect(far).toEqual({
      real: BOUNDS.maxReal,
      imaginary: BOUNDS.maxImaginary,
    });
  });

  it("reads a pixel that is not a number as the start of the axis", () => {
    // A NaN or an infinity from a box with no size could otherwise put one into
    // a constant's name, and a name is what the app stores.
    expect(insetPointToComplex(NaN, Infinity, 160, 120, BOUNDS)).toEqual({
      real: BOUNDS.minReal,
      imaginary: BOUNDS.minImaginary,
    });
  });

  it("survives an inset with no extent", () => {
    const point = insetPointToComplex(5, 5, 0, 0, BOUNDS);

    expect(point.real).toBe(BOUNDS.minReal);
    expect(point.imaginary).toBe(BOUNDS.minImaginary);
    expect(Number.isNaN(point.real)).toBe(false);
    expect(Number.isNaN(point.imaginary)).toBe(false);
  });
});

describe("a point of the plane", () => {
  it("is the pixel it sits on", () => {
    expect(complexToInsetPoint({ real: 0, imaginary: 0 }, 160, 120, BOUNDS)).toEqual(
      { x: 80, y: 60 },
    );
  });

  it("round trips through a pixel within one pixel", () => {
    // Every pixel of a coarse walk, and the four named constants on top of it.
    for (let x = 0; x <= JULIA_MAP_WIDTH; x += 7) {
      for (let y = 0; y <= JULIA_MAP_HEIGHT; y += 5) {
        const point = insetPointToComplex(x, y, 160, 120, BOUNDS);
        const back = complexToInsetPoint(point, 160, 120, BOUNDS);

        expect(Math.abs(back.x - x)).toBeLessThan(1e-9);
        expect(Math.abs(back.y - y)).toBeLessThan(1e-9);
      }
    }

    for (const named of JULIA_CONSTANTS) {
      const pixel = complexToInsetPoint(named.constant, 160, 120, BOUNDS);
      const back = insetPointToComplex(
        pixel.x,
        pixel.y,
        160,
        120,
        BOUNDS,
      );

      expect(back.real).toBeCloseTo(named.constant.real, 12);
      expect(back.imaginary).toBeCloseTo(named.constant.imaginary, 12);
    }
  });

  it("each named constant is on the map", () => {
    for (const named of JULIA_CONSTANTS) {
      const pixel = complexToInsetPoint(named.constant, 160, 120, BOUNDS);

      expect(pixel.x).toBeGreaterThan(0);
      expect(pixel.x).toBeLessThan(JULIA_MAP_WIDTH);
      expect(pixel.y).toBeGreaterThan(0);
      expect(pixel.y).toBeLessThan(JULIA_MAP_HEIGHT);
    }
  });

  it("is held on the edge when the frame does not hold it", () => {
    // Nothing a pick produces, but a link can name any point in the constant
    // box, and the ring has to be somewhere rather than outside the picture.
    expect(
      complexToInsetPoint({ real: 5, imaginary: -5 }, 160, 120, BOUNDS),
    ).toEqual({ x: JULIA_MAP_WIDTH, y: 0 });
    expect(
      complexToInsetPoint({ real: -5, imaginary: 5 }, 160, 120, BOUNDS),
    ).toEqual({ x: 0, y: JULIA_MAP_HEIGHT });
  });

  it("reads a point that is not a number as the top left corner", () => {
    expect(
      complexToInsetPoint({ real: NaN, imaginary: NaN }, 160, 120, BOUNDS),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe("an arrow key", () => {
  /** The map's step in the plane, in the constant's own units. */
  const STEP = (BOUNDS.maxReal - BOUNDS.minReal) * JULIA_MAP_ARROW_STEP;

  it("moves a fiftieth of the width across", () => {
    const here: ComplexNumber = { real: 0, imaginary: 0 };
    const right = stepJuliaMapPoint(here, 1, 0, 160, 120, BOUNDS);
    const left = stepJuliaMapPoint(here, -1, 0, 160, 120, BOUNDS);

    expect(right.real).toBeCloseTo(STEP, 12);
    expect(right.imaginary).toBeCloseTo(0, 12);
    expect(left.real).toBeCloseTo(-STEP, 12);
  });

  it("moves the same distance up, the plane being square in pixels", () => {
    const up = stepJuliaMapPoint({ real: 0, imaginary: 0 }, 0, -1, 160, 120, BOUNDS);
    const down = stepJuliaMapPoint(
      { real: 0, imaginary: 0 },
      0,
      1,
      160,
      120,
      BOUNDS,
    );

    // Up the picture is a smaller row, and — this app's plane growing down the
    // canvas — a smaller imaginary part. The ring moves the way the key says.
    expect(up.imaginary).toBeCloseTo(-STEP, 12);
    expect(up.real).toBeCloseTo(0, 12);
    expect(down.imaginary).toBeCloseTo(STEP, 12);
  });

  it("holds the constant on the edge rather than stepping off the map", () => {
    // The bottom right corner of the plane, stepped further right and further
    // down: both axes are held, so the constant stays a constant the map holds.
    const corner: ComplexNumber = {
      real: BOUNDS.maxReal,
      imaginary: BOUNDS.maxImaginary,
    };
    const off = stepJuliaMapPoint(corner, 1, 1, 160, 120, BOUNDS);

    expect(off.real).toBeCloseTo(BOUNDS.maxReal, 12);
    expect(off.imaginary).toBeCloseTo(BOUNDS.maxImaginary, 12);

    const other: ComplexNumber = {
      real: BOUNDS.minReal,
      imaginary: BOUNDS.minImaginary,
    };
    const back = stepJuliaMapPoint(other, -1, -1, 160, 120, BOUNDS);

    expect(back.real).toBeCloseTo(BOUNDS.minReal, 12);
    expect(back.imaginary).toBeCloseTo(BOUNDS.minImaginary, 12);
  });

  it("names a constant, so a keyboard pick reaches the same state a drag does", () => {
    const moved = stepJuliaMapPoint(
      { real: -0.8, imaginary: 0.156 },
      1,
      0,
      160,
      120,
      BOUNDS,
    );

    expect(customConstantName(moved.real, moved.imaginary)).not.toBeNull();
  });

  it("stays put for a key that asks for no step", () => {
    const here: ComplexNumber = { real: -0.123, imaginary: 0.745 };
    const still = stepJuliaMapPoint(here, 0, 0, 160, 120, BOUNDS);

    expect(still.real).toBeCloseTo(here.real, 12);
    expect(still.imaginary).toBeCloseTo(here.imaginary, 12);
  });

  it("works for any bounds it is handed, not only the map's own", () => {
    const elsewhere: FractalBounds = calculateZoomBounds(-0.5, 0.25, 8);
    const moved = stepJuliaMapPoint(
      { real: -0.5, imaginary: 0.25 },
      1,
      0,
      160,
      120,
      elsewhere,
    );
    const span = elsewhere.maxReal - elsewhere.minReal;

    expect(moved.real - -0.5).toBeCloseTo(span * JULIA_MAP_ARROW_STEP, 12);
  });
});
