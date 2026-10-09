import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import {
  FRACTAL_TYPES,
  defaultViewFor,
  resolveFractalKind,
} from "../fractalTypes";
import { JULIA_CONSTANTS, createJuliaKind } from "../julia";
import { mandelbrotKind } from "../mandelbrot";

const CAP = 200;

/** A 10 x 10 spread of points reaching both inside and outside the set. */
function sampledPoints(): ComplexNumber[] {
  const points: ComplexNumber[] = [];
  for (let column = 0; column < 10; column++) {
    for (let row = 0; row < 10; row++) {
      points.push({
        real: -2 + (3 * column) / 9,
        imaginary: -1.2 + (2.4 * row) / 9,
      });
    }
  }
  return points;
}

describe("FRACTAL_TYPES", () => {
  it("offers Mandelbrot first and Julia second, each once", () => {
    // The first entry is the one the explorer opens on, so the order is part
    // of the contract and not just how the list happens to read.
    expect(FRACTAL_TYPES).toEqual([
      { id: "mandelbrot", label: "Mandelbrot" },
      { id: "julia", label: "Julia" },
    ]);

    const ids = FRACTAL_TYPES.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("resolveFractalKind", () => {
  it("draws the named constant as its own Julia kind", () => {
    const resolved = resolveFractalKind("julia", "Dendrite");
    const expected = createJuliaKind({ real: 0, imaginary: 1 });
    const points = sampledPoints();

    for (const point of points) {
      expect(resolved.iterations(point, CAP, true)).toBe(
        expected.iterations(point, CAP, true),
      );
    }
  });

  it("draws the Mandelbrot set for its own id", () => {
    expect(resolveFractalKind("mandelbrot", "Dendrite")).toBe(mandelbrotKind);
  });

  it("falls back to the Mandelbrot set for an unknown id", () => {
    // A picker choice from a version that knows a fractal this build does not
    // renders the familiar set rather than a blank canvas.
    expect(resolveFractalKind("burning-ship", "Dendrite")).toBe(mandelbrotKind);
    expect(resolveFractalKind("", "")).toBe(mandelbrotKind);
  });

  it("falls back to the first constant for an unknown name", () => {
    const resolved = resolveFractalKind("julia", "Not a constant");
    const expected = createJuliaKind(JULIA_CONSTANTS[0].constant);
    const points = sampledPoints();

    for (const point of points) {
      expect(resolved.iterations(point, CAP, true)).toBe(
        expected.iterations(point, CAP, true),
      );
    }
  });
});

describe("defaultViewFor", () => {
  it("frames the Mandelbrot set where the whole of it sits", () => {
    expect(defaultViewFor("mandelbrot")).toEqual({
      centerX: -0.75,
      centerY: 0,
      zoom: 1,
    });
  });

  it("frames a Julia set about the origin", () => {
    // A Julia set is symmetric about the origin whatever its constant, so
    // centring it anywhere else shows a corner of it.
    expect(defaultViewFor("julia")).toEqual({ centerX: 0, centerY: 0, zoom: 1 });
  });

  it("falls back to the Mandelbrot view for an unknown id", () => {
    expect(defaultViewFor("burning-ship")).toEqual({
      centerX: -0.75,
      centerY: 0,
      zoom: 1,
    });
  });
});
