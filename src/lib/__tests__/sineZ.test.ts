/**
 * The sin z + z set: z -> c sin z + z, every orbit started at the critical
 * point arccos(-1/c) on the principal branch (real part in [0, pi]).
 *
 * What is held here is what the formula says, read off the kind a point at a
 * time: that the start really is a critical point on the named branch, what the
 * first step is, when the orbit is counted as gone, the counts pinned against a
 * reference loop written from the formula with complex arithmetic and a bailout
 * it can change, the real axis that never leaves, the c that have no orbit, the
 * shape of the smooth count and that nothing overflows. Because the kind is not
 * in the picker yet, the agreement of the count, the probe, the orbit plot and
 * the trap distance, which `escapeInfo.test.ts`, `orbit.test.ts` and
 * `trapDistance.test.ts` hold for every registered kind, is held here too.
 */
import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import { TRAP_SHAPES, trapDistanceFor, trapDistanceOf } from "../orbitTrap";
import {
  SINE_Z_ESCAPE_HEIGHT,
  sineZKind,
  sineZStart,
  smoothCount,
} from "../sineZ";
import { sweep } from "./sweep";

const CAP = 200;

const at = (real: number, imaginary: number): ComplexNumber => ({
  real,
  imaginary,
});

/** The whole-number count: steps survived, or the cap when the orbit never left. */
const count = (c: ComplexNumber, cap = CAP) =>
  sineZKind.iterations(c, cap, false);

/** A grid of columns by rows points over a rectangle, the corners included. */
function grid(
  real0: number,
  real1: number,
  imaginary0: number,
  imaginary1: number,
  columns: number,
  rows = columns,
): ComplexNumber[] {
  const points: ComplexNumber[] = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      points.push(
        at(
          real0 + ((real1 - real0) * column) / (columns - 1),
          imaginary0 + ((imaginary1 - imaginary0) * row) / (rows - 1),
        ),
      );
    }
  }

  return points;
}

/**
 * The count written straight from the formula with complex arithmetic, from a
 * start given to it and a bailout it can change. It shares no code with the
 * kind beyond Math.
 */
function referenceCount(
  c: ComplexNumber,
  start: ComplexNumber,
  height: number,
  cap: number,
  keepZ = true,
): number {
  let x = start.real;
  let y = start.imaginary;

  for (let step = 0; step < cap; step++) {
    // sin(x + iy) = sin x cosh y + i cos x sinh y
    const sinReal = Math.sin(x) * Math.cosh(y);
    const sinImaginary = Math.cos(x) * Math.sinh(y);
    const nextX =
      c.real * sinReal - c.imaginary * sinImaginary + (keepZ ? x : 0);
    const nextY =
      c.real * sinImaginary + c.imaginary * sinReal + (keepZ ? y : 0);
    x = nextX;
    y = nextY;
    if (Math.abs(y) > height) return step;
  }

  return cap;
}

/** Whether the c has an orbit to walk: the reference's own answer, from the kind's start. */
const referenceFor = (c: ComplexNumber, height = 20, keepZ = true) =>
  referenceCount(c, sineZStart(c), height, CAP, keepZ);

describe("the start", () => {
  const points = grid(-9, 9, -5, 5, 61, 35).filter(
    (c) => c.real !== 0 || c.imaginary !== 0,
  );

  it("is a critical point of the map: cos of it is -1/c", () => {
    const { offenders, checked } = sweep(
      points.map((c) => {
        const z = sineZStart(c);
        // cos(x + iy) = cos x cosh y - i sin x sinh y, against -1/c.
        const cosReal = Math.cos(z.real) * Math.cosh(z.imaginary);
        const cosImaginary = -Math.sin(z.real) * Math.sinh(z.imaginary);
        const squared = c.real * c.real + c.imaginary * c.imaginary;
        const wantReal = -c.real / squared;
        const wantImaginary = c.imaginary / squared;
        const wrong = Math.hypot(
          cosReal - wantReal,
          cosImaginary - wantImaginary,
        );

        return {
          at: c,
          value: wrong / Math.max(1, Math.hypot(wantReal, wantImaginary)),
        };
      }),
      (value) => value < 1e-9,
    );

    expect(checked).toBe(points.length);
    expect(offenders).toEqual([]);
  });

  it("is on the principal branch: the real part lies in [0, pi]", () => {
    const { offenders, checked } = sweep(
      points.map((c) => ({ at: c, value: sineZStart(c).real })),
      (value) => value >= 0 && value <= Math.PI,
    );

    expect(checked).toBe(points.length);
    expect(offenders).toEqual([]);
  });

  it("is the one worked case: c = 1 starts at pi, c = 2 at 2 pi / 3, c = -2 at pi / 3", () => {
    expect(sineZStart(at(1, 0))).toEqual(at(Math.PI, 0));
    expect(sineZStart(at(2, 0)).real).toBeCloseTo((2 * Math.PI) / 3, 12);
    expect(sineZStart(at(-2, 0)).real).toBeCloseTo(Math.PI / 3, 12);
  });

  it("is real, with an imaginary part of exactly 0, for a real c of modulus 1 or more", () => {
    for (const real of [1, -1, 1.5, -2.5, 7, -40, 1e6]) {
      const start = sineZStart(at(real, 0));
      expect(start.imaginary).toBe(0);
      expect(Number.isFinite(start.real)).toBe(true);
    }
  });

  it("keeps its height right when c is small and -1/c is huge", () => {
    // For c = i s, cos z = i / s, so |Im z0| = asinh(1 / s) exactly.
    for (const size of [1e-1, 1e-3, 1e-5, 1e-7, 1e-8]) {
      const start = sineZStart(at(0, size));

      expect(Math.abs(start.imaginary)).toBeCloseTo(Math.asinh(1 / size), 9);
    }
  });
});

describe("the first step", () => {
  it("adds c sin z to z, multiplied out by hand for c = 0.5 + 0.25i", () => {
    const c = at(0.5, 0.25);
    const [z0, z1] = sineZKind.orbit!(c, 3);
    const sinReal = Math.sin(z0.real) * Math.cosh(z0.imaginary);
    const sinImaginary = Math.cos(z0.real) * Math.sinh(z0.imaginary);

    expect(z1.real).toBeCloseTo(
      0.5 * sinReal - 0.25 * sinImaginary + z0.real,
      12,
    );
    expect(z1.imaginary).toBeCloseTo(
      0.5 * sinImaginary + 0.25 * sinReal + z0.imaginary,
      12,
    );
  });

  it("leaves the critical point's slope at zero: the step barely moves the next point's neighbours", () => {
    // f'(z0) = c cos z0 + 1 = 0, so a small nudge d from z0 lands about
    // f(z0) + O(d^2) away from f(z0).
    const c = at(1.3, 0.4);
    const z0 = sineZStart(c);
    const f = (x: number, y: number) => ({
      real:
        c.real * Math.sin(x) * Math.cosh(y) -
        c.imaginary * Math.cos(x) * Math.sinh(y) +
        x,
      imaginary:
        c.real * Math.cos(x) * Math.sinh(y) +
        c.imaginary * Math.sin(x) * Math.cosh(y) +
        y,
    });
    const here = f(z0.real, z0.imaginary);
    const nudged = f(z0.real + 1e-4, z0.imaginary);

    expect(
      Math.hypot(nudged.real - here.real, nudged.imaginary - here.imaginary),
    ).toBeLessThan(1e-6);
  });
});

describe("the count", () => {
  it("matches a reference loop written from the formula, on a grid over the opening frame", () => {
    const points = grid(-9, 9, -5, 5, 80, 45);

    const { offenders, checked } = sweep(
      points.map((c) => ({
        at: c,
        value: Math.abs(count(c) - referenceFor(c)),
      })),
      (value) => value === 0,
    );

    expect(checked).toBe(points.length);
    expect(offenders).toEqual([]);
  });

  it("changes no in-set pixel when the bailout is 10, 20 or 40", () => {
    const points = grid(-9, 9, -5, 5, 160, 90);

    for (const height of [10, 40]) {
      const { offenders, checked } = sweep(
        points.map((c) => {
          const inAt20 = referenceFor(c, 20) === CAP;
          const inAtOther = referenceFor(c, height) === CAP;

          return { at: { c, height }, value: inAt20 === inAtOther ? 0 : 1 };
        }),
        (value) => value === 0,
      );

      expect(checked).toBe(points.length);
      expect(offenders).toEqual([]);
    }
  });

  it("is not the count of z -> c sin z: the + z is in the step", () => {
    const points = grid(-9, 9, -5, 5, 40, 24);
    let differing = 0;

    for (const c of points) {
      if (count(c) !== referenceFor(c, 20, false)) differing++;
    }

    expect(differing).toBeGreaterThan(points.length / 4);
  });

  it("pins the share of c in the set over re -9..9, im -5..5 at cap 200 (principal branch, 160 by 90)", () => {
    const points = grid(-9, 9, -5, 5, 160, 90);
    let inside = 0;

    for (const c of points) {
      if (referenceFor(c) === CAP) inside++;
    }

    expect(inside).toBe(PINNED_INSIDE);
    expect(points.filter((c) => count(c) === CAP)).toHaveLength(PINNED_INSIDE);
  });

  it("leaves the whole real axis in the set for |c| >= 1: a real orbit stays real", () => {
    const { offenders, checked } = sweep(
      [1, 1.0001, 1.7, 2.5, 5, 9, -1, -1.7, -4.25, -9].map((real) => ({
        at: real,
        value: count(at(real, 0)),
      })),
      (value) => value === CAP,
    );

    expect(checked).toBe(10);
    expect(offenders).toEqual([]);

    for (const real of [1.7, -4.25, 9]) {
      const orbit = sineZKind.orbit!(at(real, 0), 30);
      expect(orbit.every((point) => point.imaginary === 0)).toBe(true);
    }
  });
});

describe("a c with no orbit to walk", () => {
  it("answers the cap, with no NaN, for c = 0, a c that is not finite and a c so small the start is above the height", () => {
    const cases = [
      at(0, 0),
      at(Number.NaN, 1),
      at(1, Number.NaN),
      at(Infinity, 0),
      at(0, -Infinity),
      at(1e-12, 0),
      at(0, 1e-12),
      at(1e-300, 1e-300),
      at(5e-324, 0),
    ];

    const { offenders, checked } = sweep(
      cases.map((c) => ({ at: c, value: count(c) })),
      (value) => value === CAP,
    );

    expect(checked).toBe(cases.length);
    expect(offenders).toEqual([]);

    for (const c of cases) {
      const info = sineZKind.escapeInfo!(c, CAP);
      expect(info).toEqual({ steps: CAP, escaped: false });
      expect(Number.isNaN(sineZKind.iterations(c, CAP, true))).toBe(false);
      expect(sineZKind.orbit!(c, 10)).toEqual([at(0, 0)]);
      for (const shape of TRAP_SHAPES) {
        expect(Number.isNaN(trapDistanceFor(sineZKind, c, 20, shape))).toBe(
          false,
        );
      }
    }
  });

  it("does not take a c just above the guard for one that has none", () => {
    // |c| = 1e-8 starts at height ln(2e8) = 19.1, under the 20 bailout.
    const c = at(1e-8, 0);

    expect(Math.abs(sineZStart(c).imaginary)).toBeLessThan(
      SINE_Z_ESCAPE_HEIGHT,
    );
    expect(sineZKind.orbit!(c, 3).length).toBe(4);
  });
});

describe("the smooth count", () => {
  it("stays between the whole count and the next, over a grid and a spread of c", () => {
    const points = grid(-9, 9, -5, 5, 60, 34);

    const { offenders, checked } = sweep(
      points.map((c) => {
        const whole = count(c);
        const smooth = sineZKind.iterations(c, CAP, true);

        return { at: c, value: smooth - whole };
      }),
      (value) => value >= 0 && value <= 1,
    );

    expect(checked).toBe(points.length);
    expect(offenders).toEqual([]);
  });

  it("gives n + 1 for an orbit that left by a hair and n for one that jumped as far as it can", () => {
    const c = 3;
    const far = c * Math.cosh(SINE_Z_ESCAPE_HEIGHT) + SINE_Z_ESCAPE_HEIGHT;

    expect(smoothCount(7, SINE_Z_ESCAPE_HEIGHT, c)).toBeCloseTo(8, 12);
    expect(smoothCount(7, far, c)).toBeCloseTo(7, 9);
  });

  it("is held in [n, n + 1] by the clamp for a height outside the formula's range", () => {
    // Below the bailout the fraction would be negative and past the far end it
    // would exceed 1; the clamp is the only thing that keeps the answer inside.
    expect(smoothCount(5, 1, 2)).toBe(6);
    expect(smoothCount(5, 1e30, 2)).toBe(5);
  });

  it("answers an end, not a NaN, for a c of 0 and for an infinite height", () => {
    expect(smoothCount(5, 25, 0)).toBe(6);
    expect(smoothCount(5, Infinity, 2)).toBe(5);
    expect(smoothCount(5, 25, Infinity)).toBe(5);
  });

  it("falls with the height the orbit left at", () => {
    const heights = [21, 40, 1e3, 1e6, 1e8];
    const values = heights.map((height) => smoothCount(9, height, 2));

    for (let index = 1; index < values.length; index++) {
      expect(values[index]).toBeLessThan(values[index - 1]);
    }
  });
});

describe("nothing overflows", () => {
  it("returns a finite count for large and awkward c", () => {
    const cases = [
      at(40, 40),
      at(1e3, -1e3),
      at(1e100, 0),
      at(-1e300, 1e300),
      at(0.5, 1e5),
    ];

    const { offenders, checked } = sweep(
      cases.map((c) => ({ at: c, value: sineZKind.iterations(c, CAP, true) })),
      (value) => value >= 0 && value <= CAP + 1,
    );

    expect(checked).toBe(cases.length);
    expect(offenders).toEqual([]);
  });
});

describe("conjugation", () => {
  it("gives the same picture for c and its conjugate on all but a rounding's worth of points", () => {
    // The start of the conjugate is the conjugate of the start and the step
    // commutes with conjugation, so the heights match step for step; only
    // floating-point noise in a chaotic map can separate the two counts.
    const points = grid(-9, 9, 0.05, 5, 80, 24);
    let apart = 0;

    for (const c of points) {
      if (count(c) !== count(at(c.real, -c.imaginary))) apart++;
    }

    expect(apart).toBeLessThanOrEqual(Math.ceil(points.length * 0.005));
  });
});

describe("one walk", () => {
  // The kind ships its own trap loop and its own count loop beside `orbit`.
  // Without a registry entry the shared parity tests do not see it, so the
  // agreement is held here: count, probe, path and trap are the same orbit.
  const points = grid(-9, 9, -5, 5, 24, 14);

  it("gives the same steps from the count and the probe, ended exactly when under the cap", () => {
    const { offenders, checked } = sweep(
      points.map((c) => {
        const steps = count(c, 120);
        const info = sineZKind.escapeInfo!(c, 120);
        const disagreement =
          info.steps !== steps ? 1 : info.escaped !== steps < 120 ? 2 : 0;

        return { at: c, value: disagreement };
      }),
      (value) => value === 0,
    );

    expect(checked).toBe(points.length);
    expect(offenders).toEqual([]);
  });

  it("draws the path the count was read from, from the start to the point that left", () => {
    const { offenders, checked } = sweep(
      points.map((c) => {
        const steps = count(c, 120);
        const orbit = sineZKind.orbit!(c, 120);
        const last = orbit[orbit.length - 1];
        const start = sineZStart(c);
        const hasOrbit = steps < 120 || orbit.length > 1;
        const startsRight = !hasOrbit
          ? orbit[0].real === 0 && orbit[0].imaginary === 0
          : orbit[0].real === start.real &&
            orbit[0].imaginary === start.imaginary;
        const expectedLength = steps < 120 ? steps + 2 : orbit.length;
        const endsRight =
          steps === 120 || Math.abs(last.imaginary) > SINE_Z_ESCAPE_HEIGHT;

        return {
          at: c,
          value: !startsRight
            ? 1
            : orbit.length !== expectedLength
              ? 2
              : endsRight
                ? 0
                : 3,
        };
      }),
      (value) => value === 0,
    );

    expect(checked).toBe(points.length);
    expect(offenders).toEqual([]);
  });

  it("answers the trap with the least distance over the orbit's own points from the second on", () => {
    const trapCap = 100;

    const { offenders, checked } = sweep(
      grid(-9, 9, -5, 5, 12, 8).flatMap((c) =>
        TRAP_SHAPES.map((shape) => {
          const path = sineZKind.orbit!(c, trapCap);
          let walked = Infinity;

          for (let index = 1; index < path.length; index++) {
            const distance = trapDistanceOf(
              shape,
              path[index].real,
              path[index].imaginary,
            );
            if (distance < walked) walked = distance;
          }

          const answered = trapDistanceFor(sineZKind, c, trapCap, shape);
          // The trap loop may stop at a closed cycle where the walk keeps
          // going; it comes back within a tolerance, which is the slack.
          const value =
            walked === Infinity
              ? answered === Infinity
                ? 0
                : Infinity
              : Math.abs(answered - walked);

          return { at: { c, shape }, value };
        }),
      ),
      (value) => value < 1e-9,
    );

    expect(checked).toBe(12 * 8 * TRAP_SHAPES.length);
    expect(offenders).toEqual([]);
  });
});

/**
 * The number of c on a 160 by 90 grid over re -9..9, im -5..5 whose critical
 * orbit on the principal branch does not leave in 200 steps. Measured with the
 * reference loop above, not read off the kind (the share test checks both).
 */
const PINNED_INSIDE = 752;
