import { describe, expect, it } from "vitest";

import {
  BASE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  boundsToView,
  calculateZoomBounds,
  getDefaultBounds,
  pixelToComplex,
} from "../mandelbrot";
import {
  pinchFactor,
  scaleAboutPoint,
  touchDistance,
  touchMidpoint,
} from "../pinch";

const WIDTH = 800;
const HEIGHT = 600;
const BOUNDS = getDefaultBounds();
const DEEP = calculateZoomBounds(-0.7453, 0.1127, 50);

const complexAt = (
  x: number,
  y: number,
  bounds: ReturnType<typeof getDefaultBounds>,
) => pixelToComplex(x, y, WIDTH, HEIGHT, bounds);

describe("touchDistance and touchMidpoint", () => {
  it("measure the segment between two fingers", () => {
    const a = { x: 100, y: 100 };
    const b = { x: 400, y: 500 };

    expect(touchDistance(a, b)).toBe(500);
    expect(touchDistance(b, a)).toBe(500);
    expect(touchMidpoint(a, b)).toEqual({ x: 250, y: 300 });
  });

  it("give a zero distance and the point itself for fingers on one spot", () => {
    const p = { x: 30, y: 40 };

    expect(touchDistance(p, p)).toBe(0);
    expect(touchMidpoint(p, p)).toEqual(p);
  });
});

describe("pinchFactor", () => {
  it("is above 1 when the fingers move apart and below 1 when they close", () => {
    expect(pinchFactor(100, 200)).toBe(2);
    expect(pinchFactor(200, 100)).toBe(0.5);
    expect(pinchFactor(150, 150)).toBe(1);
  });

  it("never divides by a zero distance", () => {
    expect(pinchFactor(0, 100)).toBe(1);
    expect(pinchFactor(100, 0)).toBe(1);
    expect(pinchFactor(0, 0)).toBe(1);
  });

  it("asks for no change from a distance that is not a number", () => {
    expect(pinchFactor(Number.NaN, 100)).toBe(1);
    expect(pinchFactor(100, Number.NaN)).toBe(1);
    expect(pinchFactor(100, Number.POSITIVE_INFINITY)).toBe(1);
    expect(pinchFactor(-5, 100)).toBe(1);
  });
});

describe("scaleAboutPoint", () => {
  it("scales the zoom up by the factor", () => {
    const a = { x: 400, y: 300 };
    const zoomed = scaleAboutPoint(BOUNDS, a, a, 2, WIDTH, HEIGHT);

    expect(boundsToView(zoomed).scale).toBeCloseTo(2, 12);
    expect(zoomed.maxReal - zoomed.minReal).toBeCloseTo(BASE_WIDTH / 2, 12);
  });

  it("scales the zoom down by the factor", () => {
    const a = { x: 400, y: 300 };
    const zoomed = scaleAboutPoint(DEEP, a, a, 0.5, WIDTH, HEIGHT);

    expect(boundsToView(zoomed).scale).toBeCloseTo(25, 9);
  });

  it("keeps the point under the anchor where it was", () => {
    const anchor = { x: 650, y: 120 };
    const before = complexAt(anchor.x, anchor.y, DEEP);

    for (const factor of [0.4, 1.7, 3]) {
      const after = complexAt(
        anchor.x,
        anchor.y,
        scaleAboutPoint(DEEP, anchor, anchor, factor, WIDTH, HEIGHT),
      );

      expect(after.real).toBeCloseTo(before.real, 12);
      expect(after.imaginary).toBeCloseTo(before.imaginary, 12);
    }
  });

  it("carries the point from where the fingers were to where they are", () => {
    const from = { x: 300, y: 200 };
    const to = { x: 420, y: 260 };
    const before = complexAt(from.x, from.y, DEEP);

    const moved = scaleAboutPoint(DEEP, from, to, 1.5, WIDTH, HEIGHT);
    const under = complexAt(to.x, to.y, moved);

    expect(under.real).toBeCloseTo(before.real, 12);
    expect(under.imaginary).toBeCloseTo(before.imaginary, 12);
  });

  it("is a pan alone when the factor is 1", () => {
    // Two fingers sliding 100px right with the same gap pull the picture
    // 100px right: the view's centre moves a hundred pixels' worth left.
    const from = { x: 400, y: 300 };
    const to = { x: 500, y: 300 };

    const moved = scaleAboutPoint(BOUNDS, from, to, 1, WIDTH, HEIGHT);

    expect(boundsToView(moved).scale).toBeCloseTo(1, 12);
    expect(moved.minReal).toBeCloseTo(BOUNDS.minReal - (100 / WIDTH) * 4, 12);
    expect(moved.maxReal).toBeCloseTo(BOUNDS.maxReal - (100 / WIDTH) * 4, 12);
    expect(moved.minImaginary).toBeCloseTo(BOUNDS.minImaginary, 12);
  });

  it("changes nothing for a factor of 1 about a fixed point", () => {
    const p = { x: 123, y: 456 };
    const same = scaleAboutPoint(DEEP, p, p, 1, WIDTH, HEIGHT);

    expect(same.minReal).toBeCloseTo(DEEP.minReal, 12);
    expect(same.maxReal).toBeCloseTo(DEEP.maxReal, 12);
    expect(same.minImaginary).toBeCloseTo(DEEP.minImaginary, 12);
    expect(same.maxImaginary).toBeCloseTo(DEEP.maxImaginary, 12);
  });

  it("holds the zoom at the deepest the explorer offers", () => {
    const deepest = calculateZoomBounds(-0.75, 0, MAX_ZOOM - 1);
    const anchor = { x: 700, y: 100 };
    const before = complexAt(anchor.x, anchor.y, deepest);

    const zoomed = scaleAboutPoint(deepest, anchor, anchor, 50, WIDTH, HEIGHT);
    const after = complexAt(anchor.x, anchor.y, zoomed);

    expect(boundsToView(zoomed).scale).toBeCloseTo(MAX_ZOOM, 6);
    // Held at the limit, the anchor still sits under the fingers.
    expect(after.real).toBeCloseTo(before.real, 12);
    expect(after.imaginary).toBeCloseTo(before.imaginary, 12);
  });

  it("holds the zoom at the widest view the explorer offers", () => {
    const anchor = { x: 100, y: 500 };
    const before = complexAt(anchor.x, anchor.y, BOUNDS);

    const zoomed = scaleAboutPoint(BOUNDS, anchor, anchor, 0.1, WIDTH, HEIGHT);
    const after = complexAt(anchor.x, anchor.y, zoomed);

    expect(boundsToView(zoomed).scale).toBeCloseTo(MIN_ZOOM, 12);
    expect(after.real).toBeCloseTo(before.real, 12);
    expect(after.imaginary).toBeCloseTo(before.imaginary, 12);
  });

  it("keeps the shape of the bounds it is given", () => {
    const zoomed = scaleAboutPoint(
      DEEP,
      { x: 10, y: 20 },
      { x: 30, y: 90 },
      2.5,
      WIDTH,
      HEIGHT,
    );

    expect(
      (zoomed.maxReal - zoomed.minReal) /
        (zoomed.maxImaginary - zoomed.minImaginary),
    ).toBeCloseTo(4 / 3, 12);
  });
});
