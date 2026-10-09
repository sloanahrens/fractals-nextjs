import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import { FRACTAL_KINDS, getFractalKind } from "../fractalKinds";
import { JULIA_CONSTANTS, createJuliaKind } from "../julia";
import { mandelbrotKind } from "../mandelbrot";

const CAP = 200;

/** A 10 x 10 spread of constants reaching both inside and outside the set. */
function sampledConstants(): ComplexNumber[] {
  const constants: ComplexNumber[] = [];
  for (let column = 0; column < 10; column++) {
    for (let row = 0; row < 10; row++) {
      constants.push({
        real: -2 + (3 * column) / 9,
        imaginary: -1.2 + (2.4 * row) / 9,
      });
    }
  }
  return constants;
}

describe("createJuliaKind", () => {
  it("names itself julia", () => {
    expect(createJuliaKind({ real: 0, imaginary: 1 }).id).toBe("julia");
  });

  it("counts exactly what the Mandelbrot kind counts, constants for points", () => {
    // A Julia orbit from z0 = 0 spends its first step at c, which is where a
    // Mandelbrot orbit for that c starts, and the two loops are one loop from
    // there on. So the counts agree exactly -- smoothing included -- which is
    // what says the Julia kind reuses the Mandelbrot formula rather than
    // something that merely looks like it.
    const constants = sampledConstants();
    expect(constants.length).toBe(100);

    // Both sides of the set have to be in the sample, or the parity above only
    // ever compares orbits that never escape.
    const bounded = constants.filter(
      (constant) => mandelbrotKind.iterations(constant, CAP, false) === CAP,
    );
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.length).toBeLessThan(constants.length);

    for (const constant of constants) {
      const julia = createJuliaKind(constant);
      expect(julia.iterations({ real: 0, imaginary: 0 }, CAP, false)).toBe(
        mandelbrotKind.iterations(constant, CAP, false),
      );
      expect(julia.iterations({ real: 0, imaginary: 0 }, CAP, true)).toBe(
        mandelbrotKind.iterations(constant, CAP, true),
      );
    }
  });

  it("draws the closed unit disk when the constant is zero", () => {
    // c = 0 reduces the orbit to z -> z^2, so a point inside the unit disk is
    // pulled towards 0 and never escapes while a point outside it is thrown
    // past the radius-2 test on its first step.
    const julia = createJuliaKind({ real: 0, imaginary: 0 });

    for (const point of [
      { real: 0, imaginary: 0 },
      { real: 0.5, imaginary: 0.5 },
      { real: -0.9, imaginary: 0.1 },
    ]) {
      expect(julia.iterations(point, CAP, false)).toBe(CAP);
    }

    expect(
      julia.iterations({ real: 3, imaginary: 0 }, CAP, false),
    ).toBeLessThan(3);
    expect(
      julia.iterations({ real: 0, imaginary: -2.5 }, CAP, false),
    ).toBeLessThan(3);
  });
});

describe("JULIA_CONSTANTS", () => {
  it("carries the named classics with their exact values", () => {
    expect(JULIA_CONSTANTS).toEqual([
      { name: "Classic", constant: { real: -0.8, imaginary: 0.156 } },
      { name: "Dendrite", constant: { real: 0, imaginary: 1 } },
      { name: "Douady rabbit", constant: { real: -0.123, imaginary: 0.745 } },
      { name: "Siegel disk", constant: { real: -0.391, imaginary: -0.587 } },
    ]);
  });

  it("gives every constant a picture with both bounded and escaping points", () => {
    // A 40 x 30 grid over the plane's Julia box, stepped by a fortieth of the
    // width and a thirtieth of the height. Every named constant has to reach
    // the grid twice over: a constant whose points all escape draws nothing
    // but sky, and one whose points all stay bounded draws a solid blob.
    //
    // This is the weaker half of the check for the Dendrite. Its set is a
    // dendrite, with no interior at all, so the bounded points here are the
    // few lattice points that land exactly on it (0, the points of its
    // 2-cycle, and the preimages on the same 0.1 lattice) rather than an area.
    // That the grid still reaches the set is what the assertion is worth for
    // that constant.
    const columns = 40;
    const rows = 30;
    const counts = JULIA_CONSTANTS.map(({ name, constant }) => {
      const julia = createJuliaKind(constant);
      let bounded = 0;
      let escaped = 0;

      for (let column = 0; column < columns; column++) {
        for (let row = 0; row < rows; row++) {
          const point = {
            real: -2 + (4 * column) / columns,
            imaginary: -1.5 + (3 * row) / rows,
          };
          if (julia.iterations(point, CAP, false) === CAP) {
            bounded++;
          } else {
            escaped++;
          }
        }
      }

      return { name, bounded, escaped };
    });

    for (const { name, bounded, escaped } of counts) {
      expect(bounded, `${name} drew no bounded point`).toBeGreaterThan(0);
      expect(escaped, `${name} drew no escaping point`).toBeGreaterThan(0);
    }
  });
});

describe("the kind registry", () => {
  it("still holds Mandelbrot alone, and falls back to it for julia", () => {
    // Julia needs a constant, so how a parameterised kind is registered is the
    // picker bead's decision; until it makes one, the id is not in the
    // registry and the fallback draws the familiar set rather than nothing.
    expect(FRACTAL_KINDS).toEqual([mandelbrotKind]);
    expect(getFractalKind("julia")).toBe(mandelbrotKind);
  });
});
