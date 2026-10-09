import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import { FRACTAL_KINDS, getFractalKind } from "../fractalKinds";
import {
  CUSTOM_CONSTANT_PREFIX,
  JULIA_CONSTANTS,
  MAX_CUSTOM_CONSTANT_LENGTH,
  createJuliaKind,
  customConstantName,
  isJuliaConstantName,
  parseJuliaConstant,
} from "../julia";
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

  it("runs the orbit from a point inside the Mandelbrot cardioid", () => {
    // 0 is in the main cardioid, so the Mandelbrot functions answer it with
    // the cap without running anything. A Julia orbit from that point is a
    // different orbit -- it starts at the point rather than at 0 -- and with a
    // constant outside the set it escapes on its first step, so the count is
    // small. A kind that took the Mandelbrot shortcut would report the cap.
    const julia = createJuliaKind({ real: 1, imaginary: 1 });
    const origin = { real: 0, imaginary: 0 };

    expect(julia.iterations(origin, CAP, false)).toBe(1);
    expect(mandelbrotKind.iterations(origin, CAP, false)).toBe(CAP);
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

describe("customConstantName", () => {
  it("writes a point as the prefix and its two parts", () => {
    expect(CUSTOM_CONSTANT_PREFIX).toBe("custom:");
    expect(customConstantName(-0.8, 0.156)).toBe("custom:-0.8,0.156");
    expect(customConstantName(0, 0)).toBe("custom:0,0");
  });

  it("includes both ends of the range a name covers", () => {
    // The range is inclusive, and the two ends are the shortest names there
    // are: neither is a point a rounding could carry out of the range.
    expect(customConstantName(-2, 2)).toBe("custom:-2,2");
    expect(customConstantName(2, -2)).toBe("custom:2,-2");
  });

  it("rounds to six decimals instead of truncating", () => {
    // Rounded, so a point a hair off the grid of a millionth is written as the
    // nearest point on it rather than as one a whole step away, and no part is
    // ever written with more places than the format carries.
    expect(customConstantName(-0.8000004, 0.1559996)).toBe("custom:-0.8,0.156");
    expect(customConstantName(0.3333334, -0.3333334)).toBe(
      "custom:0.333333,-0.333333",
    );
    expect(customConstantName(0.3333336, -0.3333336)).toBe(
      "custom:0.333334,-0.333334",
    );
  });

  it("drops the zero a float carries behind the last digit", () => {
    // 0.1 + 0.2 is 0.30000000000000004, which rounds to the 0.3 the sum was
    // meant to be; a part written that way stays a short name.
    expect(customConstantName(0.1 + 0.2, 0)).toBe("custom:0.3,0");
    expect(customConstantName(1 / 8, -1 / 3)).toBe("custom:0.125,-0.333333");
  });

  it("has no name for a part the format cannot carry", () => {
    for (const part of [
      NaN,
      Infinity,
      -Infinity,
      2.000001,
      -2.000001,
      1e6,
      -1e6,
    ]) {
      expect(customConstantName(part, 0), `real ${part}`).toBeNull();
      expect(customConstantName(0, part), `imaginary ${part}`).toBeNull();
    }
  });

  it("writes no name longer than the reader reads", () => {
    // The longest name the writer can produce spends every decimal place on
    // both parts, which is well under the cap the reader enforces — the room
    // above it is for the shapes a hand-written name can take.
    const longest = customConstantName(-1.999999, -1.999999);

    expect(longest).toBe("custom:-1.999999,-1.999999");
    expect((longest as string).length).toBeLessThanOrEqual(
      MAX_CUSTOM_CONSTANT_LENGTH,
    );
  });
});

describe("parseJuliaConstant", () => {
  it("reads a named constant as its own point", () => {
    for (const { name, constant } of JULIA_CONSTANTS) {
      expect(parseJuliaConstant(name)).toEqual(constant);
      expect(isJuliaConstantName(name)).toBe(true);
    }
  });

  it("reads back the point every name it writes came from", () => {
    // The round trip the whole spelling exists for: a name made from a point
    // is a name that reads as that point. Every part here is on the grid of a
    // millionth, which is where the writer puts one.
    const points: ComplexNumber[] = [
      { real: 0, imaginary: 0 },
      { real: -2, imaginary: 2 },
      { real: 2, imaginary: -2 },
      { real: -0.8, imaginary: 0.156 },
      { real: -0.123, imaginary: 0.745 },
      { real: -0.391, imaginary: -0.587 },
      { real: 0.333333, imaginary: -0.666667 },
      { real: -1.999999, imaginary: 1.999999 },
    ];

    for (const point of points) {
      const name = customConstantName(point.real, point.imaginary);

      expect(name, `${point.real},${point.imaginary}`).not.toBeNull();
      expect(parseJuliaConstant(name)).toEqual(point);
      expect(isJuliaConstantName(name)).toBe(true);
    }
  });

  it("reads a hand-written name the way a hand-written number reads", () => {
    // The parts are read as the number fields of a link are read, so a point
    // written without a leading or a trailing digit still names that point.
    expect(parseJuliaConstant("custom:.5,1.")).toEqual({
      real: 0.5,
      imaginary: 1,
    });
    expect(parseJuliaConstant("custom:-0,0")).toEqual({
      real: -0,
      imaginary: 0,
    });
  });

  it("refuses a string that is not a name rather than reading part of it", () => {
    const notNames = [
      "",
      " ",
      "Classic ",
      "classic",
      "Not a constant",
      "custom:",
      "custom:0",
      "custom:0,",
      "custom:,0",
      "custom:0,0,0",
      "custom:,,",
      "custom:0.5,0.5x",
      "custom:x,y",
      "custom:1e3,0",
      "custom:0x10,0",
      "custom:NaN,0",
      "custom:Infinity,0",
      "Custom:0,0",
      " custom:0,0",
      "custom: 0,0",
      "custom:-0.8, 0.156",
      "custom:3,0",
      "custom:0,-3",
      "custom:2.000001,0",
    ];

    for (const value of notNames) {
      expect(parseJuliaConstant(value), value).toBeNull();
      expect(isJuliaConstantName(value), value).toBe(false);
    }
  });

  it("reads a name up to the length it accepts, and refuses one past it", () => {
    // The longest name the writer writes is 26 characters, so the rest of the
    // room is for the shapes a hand-written name can take. A part padded with
    // zeros is the same number and a longer string, which separates the length
    // rule from every other one.
    const prefix = "custom:0,";
    const padded = (length: number) =>
      prefix + "0".repeat(length - prefix.length);

    expect(padded(MAX_CUSTOM_CONSTANT_LENGTH)).toHaveLength(
      MAX_CUSTOM_CONSTANT_LENGTH,
    );
    expect(parseJuliaConstant(padded(MAX_CUSTOM_CONSTANT_LENGTH))).toEqual({
      real: 0,
      imaginary: 0,
    });
    expect(
      parseJuliaConstant(padded(MAX_CUSTOM_CONSTANT_LENGTH + 1)),
    ).toBeNull();
  });

  it("has no answer for a value that is not a string at all", () => {
    // The page's state, a stored view and a link all hold the name, and a
    // stored view that has none holds undefined. Nothing here throws.
    expect(parseJuliaConstant(undefined)).toBeNull();
    expect(parseJuliaConstant(null)).toBeNull();
    expect(isJuliaConstantName(undefined)).toBe(false);
    expect(isJuliaConstantName(null)).toBe(false);
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
