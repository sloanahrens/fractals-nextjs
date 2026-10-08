import { describe, expect, it } from "vitest";

import {
  DEFAULT_FRACTAL_KIND,
  FRACTAL_KINDS,
  getFractalKind,
} from "../fractalKinds";
import { mandelbrotKind } from "../mandelbrot";

describe("getFractalKind", () => {
  it("finds the Mandelbrot kind by id", () => {
    expect(getFractalKind("mandelbrot")).toBe(mandelbrotKind);
  });

  it("falls back to the Mandelbrot kind for an unknown id", () => {
    // A preset or a saved link from a version that knows a fractal this build
    // does not must still draw something, not nothing.
    expect(getFractalKind("nope")).toBe(mandelbrotKind);
    expect(getFractalKind("")).toBe(mandelbrotKind);
  });

  it("holds Mandelbrot and nothing else, and defaults to it", () => {
    // Step (a) of the chain adds the abstraction only: a second entry here
    // would be a second fractal, which is a later bead.
    expect(FRACTAL_KINDS).toEqual([mandelbrotKind]);
    expect(DEFAULT_FRACTAL_KIND).toBe(mandelbrotKind);
  });

  it("gives every registered kind a unique id", () => {
    const ids = FRACTAL_KINDS.map((kind) => kind.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
