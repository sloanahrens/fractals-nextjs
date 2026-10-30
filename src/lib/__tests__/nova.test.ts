import { describe, expect, it } from "vitest";

import {
  NOVA_BAILOUT,
  NOVA_START,
  NOVA_TOLERANCE,
  novaKind,
} from "../nova";
import { FRACTAL_TYPES, defaultViewFor, resolveFractalKind } from "../fractalTypes";
import type { ComplexNumber } from "../../types/fractal";
import { largestJump } from "./sweep";

const CAP = 200;
const ORIGIN: ComplexNumber = { real: 0, imaginary: 0 };

const at = (real: number, imaginary = 0): ComplexNumber => ({
  real,
  imaginary,
});

const count = (point: ComplexNumber, cap = CAP, smooth = false) =>
  novaKind.iterations(point, cap, smooth);

/**
 * Newton's method for z^3 - 1 with c added, written the textbook way: the
 * quotient p(z)/p'(z) formed by complex division, where the kind writes the
 * step as (2z + 1/z^2) / 3. The two are the same map, so they must agree on
 * the step count of every point whose orbit does not land within rounding of
 * the tolerance.
 */
function oracleSteps(c: ComplexNumber, cap: number): number {
  let real = 1;
  let imaginary = 0;

  for (let steps = 1; steps < cap; steps++) {
    const squareReal = real * real - imaginary * imaginary;
    const squareImaginary = 2 * real * imaginary;
    const cubeReal = squareReal * real - squareImaginary * imaginary;
    const cubeImaginary = squareReal * imaginary + squareImaginary * real;
    const denominatorReal = 3 * squareReal;
    const denominatorImaginary = 3 * squareImaginary;
    const size = denominatorReal ** 2 + denominatorImaginary ** 2;
    if (size === 0) return steps - 1;

    const quotientReal =
      ((cubeReal - 1) * denominatorReal + cubeImaginary * denominatorImaginary) /
      size;
    const quotientImaginary =
      (cubeImaginary * denominatorReal -
        (cubeReal - 1) * denominatorImaginary) /
      size;
    const nextReal = real - quotientReal + c.real;
    const nextImaginary = imaginary - quotientImaginary + c.imaginary;
    const length = Math.hypot(nextReal - real, nextImaginary - imaginary);
    real = nextReal;
    imaginary = nextImaginary;

    if (!(Math.hypot(real, imaginary) <= NOVA_BAILOUT)) return steps;
    if (length < NOVA_TOLERANCE) return steps;
  }

  return cap;
}

/** A grid across the part of the plane the picture is made in, at a spacing that avoids special points. */
function grid(): ComplexNumber[] {
  const points: ComplexNumber[] = [];

  for (let row = 0; row < 40; row++) {
    for (let column = 0; column < 60; column++) {
      points.push({
        real: -2.43 + column * 0.0731,
        imaginary: -1.51 + row * 0.0773,
      });
    }
  }

  return points;
}

describe("the Nova kind", () => {
  it("has the id the picker and the link carry", () => {
    expect(novaKind.id).toBe("nova");
  });

  it("is registered, and resolves by its id whatever variant is beside it", () => {
    expect(FRACTAL_TYPES).toContainEqual({ id: "nova", label: "Nova" });
    expect(resolveFractalKind("nova", "")).toBe(novaKind);
    expect(resolveFractalKind("nova", "Dendrite")).toBe(novaKind);
  });

  it("starts every orbit at z = 1 and settles when a step is under 1e-6", () => {
    expect(NOVA_START).toEqual({ real: 1, imaginary: 0 });
    expect(NOVA_TOLERANCE).toBe(1e-6);
    expect(NOVA_BAILOUT).toBe(1e6);
  });
});

describe("counts at points worked out by hand", () => {
  it("settles c = 0 in one step, because z = 1 is a root and Newton's step leaves it there", () => {
    // N(1) = 1 - 0/3 = 1, so the first step has length 0.
    expect(count(ORIGIN)).toBe(1);
    expect(count(ORIGIN, CAP, true)).toBe(1);
    expect(novaKind.escapeInfo!(ORIGIN, CAP)).toEqual({
      steps: 1,
      escaped: true,
      settled: true,
    });
    expect(novaKind.orbit!(ORIGIN, 10)).toEqual([at(1), at(1)]);
  });

  it("settles c = -1.5 in two steps, on the fixed point -0.5", () => {
    // z1 = N(1) + c = -0.5; N(-0.5) = (-1 + 4) / 3 = 1, so z2 = 1 - 1.5 = -0.5
    // again: the second step has length 0.
    const c = at(-1.5);

    expect(count(c)).toBe(2);
    expect(count(c, CAP, true)).toBe(2);
    expect(novaKind.orbit!(c, 10)).toEqual([at(1), at(-0.5), at(-0.5)]);
    expect(novaKind.escapeInfo!(c, CAP)).toEqual({
      steps: 2,
      escaped: true,
      settled: true,
    });
  });

  it("sends c = -1 to the pole at 0: z1 = 0, which Newton's step cannot leave", () => {
    // z1 = 1 - 1 = 0, and 3 z^2 = 0 there. The map takes 0 to infinity, so that
    // is an escape, counted as the one step completed to get there.
    const c = at(-1);

    expect(count(c)).toBe(1);
    expect(count(c, CAP, true)).toBe(1);
    expect(novaKind.escapeInfo!(c, CAP)).toEqual({
      steps: 1,
      escaped: true,
      settled: false,
    });
    expect(novaKind.orbit!(c, 10)).toEqual([at(1), at(0)]);
  });

  it("escapes a constant past the bailout on the first step", () => {
    // z1 = 1 + 2e6 is outside 1e6.
    const c = at(2e6);

    expect(count(c)).toBe(1);
    expect(novaKind.escapeInfo!(c, CAP)).toEqual({
      steps: 1,
      escaped: true,
      settled: false,
    });
    expect(novaKind.orbit!(c, 10)).toEqual([at(1), at(2000001)]);
  });

  it("never settles c = -0.5, however high the cap", () => {
    for (const cap of [CAP, 2000]) {
      expect(count(at(-0.5), cap)).toBe(cap);
      expect(count(at(-0.5), cap, true)).toBe(cap);
      expect(novaKind.escapeInfo!(at(-0.5), cap)).toEqual({
        steps: cap,
        escaped: false,
        settled: false,
      });
    }
    expect(novaKind.orbit!(at(-0.5), 25)).toHaveLength(26);
  });

  it("never settles points along the real axis from about -1.45 to -0.4", () => {
    for (const real of [-1.4, -1.1, -0.9, -0.7, -0.45]) {
      expect(count(at(real), 400), String(real)).toBe(400);
    }
  });

  it("settles the plane far from the origin in about forty steps", () => {
    // Far out the map is z -> 2z/3 + c, which contracts by a third a step, so
    // every point there takes about the same time: the flat field of the picture.
    for (const point of [at(3), at(-3), at(0, 3), at(2, -2), at(10)]) {
      const steps = count(point);

      expect(steps).toBeGreaterThan(25);
      expect(steps).toBeLessThan(60);
    }
  });

  it("is the cap for a cap too low to settle", () => {
    expect(count(at(0.5), 10)).toBe(10);
    expect(count(at(0.5), 10, true)).toBe(10);
    expect(count(at(0.5))).toBeLessThan(CAP);
    expect(count(ORIGIN, 1)).toBe(1);
    expect(count(ORIGIN, 0)).toBe(0);
  });
});

describe("agreement with the textbook formula", () => {
  it("counts the same steps as Newton's quotient with c added, across the plane", () => {
    const points = grid();
    let compared = 0;
    let settled = 0;
    let unsettled = 0;

    for (const point of points) {
      const expected = oracleSteps(point, CAP);

      expect(count(point), `${point.real}, ${point.imaginary}`).toBe(expected);
      compared++;
      if (expected < CAP) settled++;
      else unsettled++;
    }

    // A grid with both outcomes in it, so the loop above said something.
    expect(compared).toBe(2400);
    expect(settled).toBeGreaterThan(1000);
    expect(unsettled).toBeGreaterThan(0);
  });
});

describe("the smooth count", () => {
  it("is the whole count plus a fraction in [0, 1] for a settled point", () => {
    let fractions = 0;

    for (const point of grid()) {
      const whole = count(point);
      const smooth = count(point, CAP, true);

      expect(Number.isFinite(smooth)).toBe(true);
      if (whole >= CAP) {
        expect(smooth).toBe(CAP);
        continue;
      }
      expect(smooth).toBeGreaterThanOrEqual(whole);
      expect(smooth).toBeLessThanOrEqual(whole + 1);
      if (smooth > whole) fractions++;
    }

    // Most points carry a real fraction, so the bounds above are not vacuous.
    expect(fractions).toBeGreaterThan(1000);
  });

  it("carries no fraction for an escape or a point that never settles", () => {
    for (const point of [at(-1), at(2e6), at(-0.5)]) {
      expect(count(point, CAP, true)).toBe(count(point, CAP, false));
    }
  });

  it("is continuous across a place where the whole count steps", () => {
    // Walk out along the real axis, where the count rises a step at a time, find
    // each place it steps by bisection, and compare the smooth count a hair
    // either side: the fraction has to take over exactly where the whole count
    // lets go. Pairs 1e-11 apart should differ by about 1e-11 times the slope.
    const smoothAt = (real: number) => count(at(real), CAP, true);
    const wholeAt = (real: number) => count(at(real));
    let checked = 0;

    for (let real = 0.4; real < 3; real += 0.05) {
      const next = real + 0.05;
      if (wholeAt(real) === wholeAt(next)) continue;

      // The count is non-decreasing along this stretch, so bisecting on
      // "still the lower count" finds the step.
      const lower = wholeAt(real);
      let low = real;
      let high = next;
      for (let i = 0; i < 60; i++) {
        const middle = (low + high) / 2;
        if (wholeAt(middle) === lower) low = middle;
        else high = middle;
      }

      expect(wholeAt(high)).toBeGreaterThan(wholeAt(low));
      expect(Math.abs(smoothAt(high) - smoothAt(low))).toBeLessThan(1e-4);
      // And the fraction sits where the argument says it does: nearly all of a
      // step below the boundary, none of one above.
      expect(smoothAt(low) - wholeAt(low)).toBeGreaterThan(0.99);
      expect(smoothAt(high) - wholeAt(high)).toBeLessThan(0.01);
      checked++;
    }

    expect(checked).toBeGreaterThan(5);
  });

  it("moves by under a tenth of a step between samples 1e-4 apart along a line", () => {
    // 26,000 samples along the line, swept in one assertion (see sweep.ts): the
    // largest jump and where it was. A sample that is not a finite number is an
    // infinite jump, so it cannot hide among small ones.
    let samples = 0;
    function* line() {
      yield { at: 0.4, value: count(at(0.4), CAP, true) };

      for (let real = 0.4001; real < 3; real += 1e-4) {
        samples++;
        yield { at: real, value: count(at(real), CAP, true) };
      }
    }

    const { jump, at: where } = largestJump(line());

    expect(samples).toBeGreaterThan(25000);
    expect(jump, `at c = ${where}`).toBeLessThan(0.1);
  });

  it("is continuous across the first step's boundary, where |c| crosses the tolerance", () => {
    // The first step has length |c| and no step before it; it is credited
    // ln(tolerance) / ln(|c|), which is 1 at the tolerance.
    const below = at(NOVA_TOLERANCE * 0.999999);
    const above = at(NOVA_TOLERANCE * 1.000001);

    expect(count(below)).toBe(1);
    expect(count(above)).toBe(2);
    expect(Math.abs(count(below, CAP, true) - count(above, CAP, true))).toBeLessThan(
      1e-3,
    );
  });
});

describe("a zero derivative never puts a NaN in the picture", () => {
  it("answers a finite count in 0..cap for every point of a grid that includes the pole's neighbourhood", () => {
    const points = [...grid(), at(-1), at(-1, 1e-300), at(-1 + 1e-14), at(-1, 1e-8)];

    for (const point of points) {
      for (const smooth of [false, true]) {
        const result = count(point, CAP, smooth);

        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(CAP);
      }
    }
  });

  it("walks no NaN into an orbit, whatever the constant", () => {
    for (const point of [at(-1), at(-1, 1e-300), at(2e6), at(-0.5), at(1e300)]) {
      for (const p of novaKind.orbit!(point, 60)) {
        expect(Number.isNaN(p.real)).toBe(false);
        expect(Number.isNaN(p.imaginary)).toBe(false);
      }
    }
  });

  it("is the cap, with no orbit beyond the start, for a point that is not a number", () => {
    for (const point of [
      { real: Number.NaN, imaginary: 0 },
      { real: 0, imaginary: Number.NaN },
      { real: Infinity, imaginary: 0 },
      { real: 0, imaginary: -Infinity },
    ]) {
      expect(count(point)).toBe(CAP);
      expect(count(point, CAP, true)).toBe(CAP);
      expect(novaKind.escapeInfo!(point, CAP)).toEqual({
        steps: CAP,
        escaped: false,
        settled: false,
      });
      expect(novaKind.orbit!(point, 30)).toEqual([at(1)]);
    }
  });
});

describe("the mirror about the real axis", () => {
  it("counts a point and its conjugate alike, bit for bit", () => {
    // The recurrence has real coefficients and starts on the real axis, so
    // conjugating c conjugates every step.
    for (const point of grid()) {
      const mirror = at(point.real, -point.imaginary);

      expect(count(mirror, CAP, true)).toBe(count(point, CAP, true));
      expect(count(mirror)).toBe(count(point));
    }
  });

  it("walks the conjugate path", () => {
    const point = at(0.3, 0.4);
    const path = novaKind.orbit!(point, 40);
    const mirrored = novaKind.orbit!(at(0.3, -0.4), 40);

    expect(mirrored).toHaveLength(path.length);
    path.forEach((p, index) => {
      expect(mirrored[index].real).toBe(p.real);
      expect(Math.abs(mirrored[index].imaginary + p.imaginary)).toBe(0);
    });
  });
});

describe("the orbit", () => {
  it("starts at z = 1 and ends on the point that settled", () => {
    const point = at(0.5, 0.2);
    const orbit = novaKind.orbit!(point, 60);
    const info = novaKind.escapeInfo!(point, CAP);
    const last = orbit[orbit.length - 1];
    const before = orbit[orbit.length - 2];

    expect(orbit[0]).toEqual(at(1));
    expect(info.settled).toBe(true);
    expect(orbit).toHaveLength(info.steps + 1);
    expect(Math.hypot(last.real - before.real, last.imaginary - before.imaginary)).toBeLessThan(
      NOVA_TOLERANCE,
    );
  });

  it("stops at the window when the orbit has not ended by then", () => {
    expect(novaKind.orbit!(at(0.5), 5)).toHaveLength(6);
  });
});

describe("the default view", () => {
  it("holds the whole set, so every point of its border settles quickly", () => {
    const { centerX, centerY, zoom } = defaultViewFor("nova");
    const halfWidth = 2 / zoom;
    const halfHeight = 1.5 / zoom;
    const cap = 300;

    expect({ centerX, centerY, zoom }).toEqual({
      centerX: -0.55,
      centerY: 0,
      zoom: 1.5,
    });

    for (let i = 0; i <= 40; i++) {
      const along = i / 40;
      const border = [
        at(centerX - halfWidth + 2 * halfWidth * along, centerY - halfHeight),
        at(centerX - halfWidth + 2 * halfWidth * along, centerY + halfHeight),
        at(centerX - halfWidth, centerY - halfHeight + 2 * halfHeight * along),
        at(centerX + halfWidth, centerY - halfHeight + 2 * halfHeight * along),
      ];

      for (const point of border) {
        // The plane beyond the set takes about 35 steps; the set's own
        // structure takes far more than that.
        expect(count(point, cap), `${point.real}, ${point.imaginary}`).toBeLessThan(
          45,
        );
      }
    }
  });
});
