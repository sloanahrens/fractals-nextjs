import { describe, expect, it } from "vitest";

import { defaultViewFor, resolveFractalKind } from "../fractalTypes";
import { createJuliaKind } from "../julia";
import { escapeTimeIterations } from "../mandelbrot";
import {
  PHOENIX_CONSTANTS,
  createPhoenixKind,
  parsePhoenixConstant,
} from "../phoenix";

const CAP = 200;

const CLASSIC = { real: 0.5667, imaginary: -0.5 };
const HOURGLASS = { real: 0.5667, imaginary: -0.55 };

const classicKind = createPhoenixKind(CLASSIC);
const hourglassKind = createPhoenixKind(HOURGLASS);

/** A grid over the part of the plane every named constant's set sits in. */
function grid(): { real: number; imaginary: number }[] {
  const points: { real: number; imaginary: number }[] = [];

  for (let row = 0; row <= 30; row++) {
    for (let column = 0; column <= 30; column++) {
      points.push({
        real: -1.5 + (column * 3) / 30,
        imaginary: -1.5 + (row * 3) / 30,
      });
    }
  }

  return points;
}

describe("the named constants", () => {
  it("lead with the Classic one, c = 0.5667 and p = -0.5", () => {
    expect(PHOENIX_CONSTANTS[0]).toEqual({ name: "Classic", constant: CLASSIC });
  });

  it("are three, each with a name of its own", () => {
    expect(PHOENIX_CONSTANTS.map((entry) => entry.name)).toEqual([
      "Classic",
      "Spirals",
      "Hourglass",
    ]);
  });

  it("are read by exactly their names", () => {
    for (const entry of PHOENIX_CONSTANTS) {
      expect(parsePhoenixConstant(entry.name)).toEqual(entry.constant);
    }
    for (const value of ["classic", " Classic", "Classic ", "", "1", "Dendrite"]) {
      expect(parsePhoenixConstant(value), value).toBeNull();
    }
    expect(parsePhoenixConstant(null)).toBeNull();
    expect(parsePhoenixConstant(undefined)).toBeNull();
  });
});

describe("createPhoenixKind", () => {
  it("names itself phoenix whatever the constant", () => {
    for (const entry of PHOENIX_CONSTANTS) {
      expect(createPhoenixKind(entry.constant).id).toBe("phoenix");
    }
  });

  it("is what the picker resolves a phoenix id to, falling back to Classic", () => {
    const points = grid();

    for (const entry of PHOENIX_CONSTANTS) {
      const resolved = resolveFractalKind("phoenix", entry.name);
      const expected = createPhoenixKind(entry.constant);

      expect(resolved.id).toBe("phoenix");
      for (const point of points) {
        expect(resolved.iterations(point, CAP, true)).toBe(
          expected.iterations(point, CAP, true),
        );
      }
    }

    for (const variant of ["", "Dendrite", "3", "custom:0.5,0.5"]) {
      const resolved = resolveFractalKind("phoenix", variant);

      for (const point of grid()) {
        expect(resolved.iterations(point, CAP, true), variant).toBe(
          classicKind.iterations(point, CAP, true),
        );
      }
    }
  });

  it("keeps a point inside the set for the whole cap", () => {
    // 0.5i is inside the Hourglass set: its orbit never leaves the radius.
    const inside = { real: 0, imaginary: 0.5 };

    expect(hourglassKind.iterations(inside, CAP, false)).toBe(CAP);
    expect(hourglassKind.iterations(inside, CAP, true)).toBe(CAP);
  });

  it("escapes a point already outside the radius on the first step", () => {
    // z1 = 9 + 0.5667 is far past 2: no step completed before the escape.
    const outside = { real: 3, imaginary: 0 };

    expect(classicKind.iterations(outside, CAP, false)).toBe(0);
  });

  it("counts the steps of a point on the real axis, worked by hand", () => {
    // Classic, c = 0.5667 and p = -0.5, from z0 = 1 (z(-1) = 0):
    //   z1 = 1 + 0.5667 - 0.5 * 0       = 1.5667   (|z|^2 = 2.45, stays)
    //   z2 = 2.4545 + 0.5667 - 0.5 * 1  = 2.5212   (|z|^2 = 6.36, escapes)
    // One step completed before the one that escaped.
    expect(classicKind.iterations({ real: 1, imaginary: 0 }, CAP, false)).toBe(
      1,
    );
    // From z0 = 0.8 the memory term holds the orbit in a step longer:
    //   z1 = 0.64 + 0.5667 - 0         = 1.2067
    //   z2 = 1.4561 + 0.5667 - 0.4     = 1.6228   (|z|^2 = 2.63, stays)
    //   z3 = 2.6335 + 0.5667 - 0.6034  = 2.5968   (escapes)
    expect(
      classicKind.iterations({ real: 0.8, imaginary: 0 }, CAP, false),
    ).toBe(2);
  });

  it("depends on the point before the last: dropping z(n-1) changes a count", () => {
    // Without the memory term the same step is the Julia step with c alone, and
    // 0.8 leaves one step sooner: z2 = 1.4561 + 0.5667 = 2.0228 is past 2.
    const point = { real: 0.8, imaginary: 0 };
    const withMemory = classicKind.iterations(point, CAP, false);
    const without = escapeTimeIterations(
      point,
      { real: CLASSIC.real, imaginary: 0 },
      CAP,
      false,
    );

    expect(without).toBe(1);
    expect(withMemory).toBe(2);
    expect(withMemory).not.toBe(without);

    // And over the plane it is not a one-point accident.
    let differing = 0;
    for (const sample of grid()) {
      if (
        classicKind.iterations(sample, CAP, false) !==
        escapeTimeIterations(
          sample,
          { real: CLASSIC.real, imaginary: 0 },
          CAP,
          false,
        )
      ) {
        differing++;
      }
    }
    expect(differing).toBeGreaterThan(100);
  });

  it("is the Julia kind of c exactly when p is nought", () => {
    // With p = 0 the memory term vanishes, so the step is z^2 + c from the
    // pixel and every count, smooth ones included, is Julia's.
    const phoenix = createPhoenixKind({ real: -0.8, imaginary: 0 });
    const julia = createJuliaKind({ real: -0.8, imaginary: 0 });

    for (const point of grid()) {
      expect(phoenix.iterations(point, CAP, false)).toBe(
        julia.iterations(point, CAP, false),
      );
      expect(phoenix.iterations(point, CAP, true)).toBe(
        julia.iterations(point, CAP, true),
      );
    }
  });

  it("takes the Julia step first, since z(-1) is nought", () => {
    // The first step cannot feel p, so a point that escapes on it counts what
    // a Julia set of the same c counts, and the orbit's second point is Julia's.
    const point = { real: 1.3, imaginary: 0.4 };

    expect(classicKind.orbit!(point, 1)).toEqual(
      createJuliaKind({ real: CLASSIC.real, imaginary: 0 }).orbit!(point, 1),
    );
  });

  it("is mirrored about the real axis, bit for bit", () => {
    // c and p are real, z(-1) starts at 0, and a conjugated orbit takes the
    // conjugated step: x' and the memory's x are untouched by flipping y, and y'
    // changes sign. So the count at a point and at its reflection are one.
    for (const kind of [classicKind, hourglassKind]) {
      for (const point of grid()) {
        const mirrored = { real: point.real, imaginary: -point.imaginary };

        expect(kind.iterations(mirrored, CAP, false)).toBe(
          kind.iterations(point, CAP, false),
        );
        expect(kind.iterations(mirrored, CAP, true)).toBe(
          kind.iterations(point, CAP, true),
        );
      }
    }
  });

  it("is not mirrored about the imaginary axis", () => {
    let differing = 0;
    for (const point of grid()) {
      const flipped = { real: -point.real, imaginary: point.imaginary };

      if (
        classicKind.iterations(flipped, CAP, false) !==
        classicKind.iterations(point, CAP, false)
      ) {
        differing++;
      }
    }

    expect(differing).toBeGreaterThan(0);
  });

  it("gives a fractional count to a smooth read of an escaping point", () => {
    const point = { real: 0.9, imaginary: 0.3 };
    const whole = classicKind.iterations(point, CAP, false);
    const smooth = classicKind.iterations(point, CAP, true);

    expect(whole).toBeGreaterThan(0);
    expect(whole).toBeLessThan(CAP);
    expect(smooth).not.toBe(whole);
    expect(smooth).toBeGreaterThan(whole - 1);
    expect(smooth).toBeLessThan(whole + 1);
  });

  it("is continuous in the smooth count where the whole count steps", () => {
    // Along a line outside the set the whole count steps from one band to the
    // next; the smooth count must run through those steps without a jump, which
    // is what lets every colour scheme draw smooth bands.
    const at = (real: number) => ({ real, imaginary: 0 });

    // Find where the whole count first steps on the real axis past 0.8...
    let edge = 0.8;
    while (
      classicKind.iterations(at(edge), CAP, false) ===
      classicKind.iterations(at(edge + 0.0004), CAP, false)
    ) {
      edge += 0.0004;
      expect(edge).toBeLessThan(1.6);
    }

    // ...and walk across it a hundred-thousandth at a time. The shared
    // smoothing is the Mandelbrot formula with escape radius 2, exact only as
    // the radius grows, so a count that steps is allowed a small seam; away
    // from a step the smooth count must move by almost nothing.
    let previous: { whole: number; smooth: number } | null = null;
    let largestSteadyJump = 0;
    let largestSeam = 0;
    let steps = 0;
    for (let step = -100; step <= 500; step++) {
      const point = at(edge + step * 1e-5);
      const sample = {
        whole: classicKind.iterations(point, CAP, false),
        smooth: classicKind.iterations(point, CAP, true),
      };
      if (previous !== null) {
        const jump = Math.abs(sample.smooth - previous.smooth);
        if (sample.whole === previous.whole) {
          largestSteadyJump = Math.max(largestSteadyJump, jump);
        } else {
          steps++;
          largestSeam = Math.max(largestSeam, jump);
        }
      }
      previous = sample;
    }

    expect(steps).toBeGreaterThanOrEqual(1);
    expect(largestSteadyJump).toBeLessThan(0.01);
    expect(largestSeam).toBeLessThan(0.5);
  });

  it("stops at the cap for a point that has not escaped by then", () => {
    const point = { real: 0.3, imaginary: 0.5 };
    const escapes = classicKind.iterations(point, CAP, false);

    expect(escapes).toBeGreaterThan(0);
    expect(escapes).toBeLessThan(CAP);
    expect(classicKind.iterations(point, escapes, false)).toBe(escapes);
    expect(classicKind.iterations(point, escapes, true)).toBe(escapes);
    expect(classicKind.iterations(point, escapes + 1, false)).toBe(escapes);
    expect(classicKind.iterations(point, 0, false)).toBe(0);
  });

  it("answers the cap for a point that is not a number", () => {
    for (const point of [
      { real: Number.NaN, imaginary: 0 },
      { real: 0, imaginary: Number.NaN },
      { real: Number.POSITIVE_INFINITY, imaginary: 0 },
    ]) {
      const count = classicKind.iterations(point, CAP, false);

      expect(Number.isFinite(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(CAP);
    }
  });

  it("agrees with its own escapeInfo", () => {
    for (const point of grid()) {
      const steps = classicKind.iterations(point, CAP, false);

      expect(classicKind.escapeInfo!(point, CAP)).toEqual({
        steps,
        escaped: steps < CAP,
      });
    }
  });

  it("walks an orbit that carries z(n-1), worked by hand", () => {
    // From z0 = 1 on the Classic constant: 1, 1.5667, 2.5212 (the escape).
    const path = classicKind.orbit!({ real: 1, imaginary: 0 }, 10);

    expect(path).toHaveLength(3);
    expect(path[0]).toEqual({ real: 1, imaginary: 0 });
    expect(path[1].real).toBeCloseTo(1.5667, 9);
    expect(path[2].real).toBeCloseTo(2.52124889, 6);
    expect(path[2].imaginary).toBe(0);
  });
});

describe("the default view", () => {
  it("holds every named constant's set across, with room above and below", () => {
    const view = defaultViewFor("phoenix");

    expect(view).toEqual({ centerX: 0, centerY: 0, zoom: 1 });

    // The frame is x -2..2 by y -1.5..1.5; look for a point that is slow to
    // leave (30 steps or more) outside the frame's inner 0.1 border, which
    // would say the set runs off it.
    for (const entry of PHOENIX_CONSTANTS) {
      const kind = createPhoenixKind(entry.constant);

      for (let step = 0; step <= 400; step++) {
        const along = -2 + (step * 4) / 400;
        const vertical = -1.5 + (step * 3) / 400;

        for (const point of [
          { real: along, imaginary: -1.4 },
          { real: along, imaginary: 1.4 },
          { real: -1.9, imaginary: vertical },
          { real: 1.9, imaginary: vertical },
        ]) {
          expect(kind.iterations(point, CAP, false), entry.name).toBeLessThan(
            30,
          );
        }
      }
    }
  });
});
