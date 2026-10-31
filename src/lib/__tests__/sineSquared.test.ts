/**
 * The Sine of z squared set: z -> c sin(z^2), every orbit started at the
 * critical point sqrt(pi / 2).
 *
 * What is held here is what the formula says and what the picture shows, read
 * off the kind a point at a time: where the orbit starts and what its first step
 * is, when it is counted as gone, the symmetries, the lines of the plane that
 * never leave, the shape of the smooth count and that nothing
 * overflows. The count, the probe, the orbit plot and the trap distance are also
 * held to one walk, by this file rather than the shared parity tests, because the
 * kind is not in the picker yet.
 */
import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import { TRAP_SHAPES, trapDistanceOf } from "../orbitTrap";
import {
  SINE_SQUARED_ESCAPE_HEIGHT,
  SINE_SQUARED_START,
  sineSquaredKind,
} from "../sineSquared";
import { sweep } from "./sweep";

const CAP = 400;

const at = (real: number, imaginary: number): ComplexNumber => ({
  real,
  imaginary,
});

/** The whole-number count: steps survived, or the cap when the orbit never left. */
const count = (c: ComplexNumber, cap = CAP) =>
  sineSquaredKind.iterations(c, cap, false);

/** A grid of points over a rectangle, the corners included. */
function grid(
  real0: number,
  real1: number,
  imaginary0: number,
  imaginary1: number,
  steps: number,
): ComplexNumber[] {
  const points: ComplexNumber[] = [];

  for (let row = 0; row <= steps; row++) {
    for (let column = 0; column <= steps; column++) {
      points.push(
        at(
          real0 + ((real1 - real0) * column) / steps,
          imaginary0 + ((imaginary1 - imaginary0) * row) / steps,
        ),
      );
    }
  }

  return points;
}

/** |Im(z^2)| for the point a walk has just landed on. */
const height = (point: ComplexNumber) =>
  Math.abs(2 * point.real * point.imaginary);

describe("the orbit", () => {
  it("starts at sqrt(pi / 2), whatever c is", () => {
    for (const c of [at(0, 0), at(0.3, 0.4), at(-2.5, 1.1), at(40, 40)]) {
      expect(sineSquaredKind.orbit!(c, 5)[0]).toEqual(at(SINE_SQUARED_START, 0));
    }
  });

  it("takes c itself as its first step, since the sine of pi / 2 is 1", () => {
    // The first step squares the start (pi / 2), whose sine is 1, which is why
    // the picture is read like the Mandelbrot set, whose first step lands on c.
    for (const c of [at(0.3, 0.4), at(-2.5, 1.1), at(1.6, 0.1), at(0, 19)]) {
      expect(sineSquaredKind.orbit!(c, 3)[1]).toEqual(c);
    }
  });

  it("takes the next step as c times the sine of the last point squared", () => {
    // From z1 = c = 0.5 + 0.25i, z1^2 = 0.1875 + 0.25i; its sine is
    // sin(0.1875)cosh(0.25) + i cos(0.1875)sinh(0.25), and z2 = c times that.
    const c = at(0.5, 0.25);
    const sineReal = Math.sin(0.1875) * Math.cosh(0.25);
    const sineImaginary = Math.cos(0.1875) * Math.sinh(0.25);
    const second = sineSquaredKind.orbit!(c, 3)[2];

    expect(second.real).toBeCloseTo(0.5 * sineReal - 0.25 * sineImaginary, 12);
    expect(second.imaginary).toBeCloseTo(
      0.5 * sineImaginary + 0.25 * sineReal,
      12,
    );
  });

  it("stops at the cap for a point that never leaves", () => {
    expect(sineSquaredKind.orbit!(at(0, 0), 10)).toHaveLength(11);
  });

  it("ends on the point that left, with every earlier point at or under the height", () => {
    function* samples() {
      for (const c of grid(-3, 3, 0.5, 3, 12)) {
        const orbit = sineSquaredKind.orbit!(c, 60);
        const last = orbit[orbit.length - 1];
        if (!(height(last) > SINE_SQUARED_ESCAPE_HEIGHT)) continue;

        let highest = -Infinity;
        for (const point of orbit.slice(0, -1)) {
          highest = Math.max(highest, height(point) - SINE_SQUARED_ESCAPE_HEIGHT);
        }
        yield {
          at: c,
          value: Math.max(
            highest,
            Math.abs(orbit.length - (count(c, 60) + 2)),
          ),
        };
      }
    }

    const { offenders, checked } = sweep(samples(), (value) => value <= 0);

    // A grid that never ended an orbit would prove nothing.
    expect(checked).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});

describe("when a point is gone", () => {
  it("counts a c whose product 2xy is over the height as gone on the first step", () => {
    expect(count(at(3, SINE_SQUARED_ESCAPE_HEIGHT + 1))).toBe(0);
    expect(count(at(-7, 25))).toBe(0);
    expect(count(at(SINE_SQUARED_ESCAPE_HEIGHT + 1, -3))).toBe(0);
  });

  it("reads the height as the product 2xy, so a c on either axis stays in the set however high", () => {
    // An imaginary c keeps the orbit imaginary, so 2xy is zero at every step: a
    // rule on |y| alone would call these gone on the first step.
    expect(count(at(0, 25))).toBe(CAP);
    expect(count(at(0, 1e6))).toBe(CAP);
    expect(count(at(0, -1e9))).toBe(CAP);
  });

  // Counts at a cap of 100, from a throwaway reference loop written from the
  // formula by hand (not this code): seven c in the set and seven in the bands
  // around it.
  const PINNED: [string, ComplexNumber, number][] = [
    ["c = 0", at(0, 0), 100],
    ["c = 0.5", at(0.5, 0), 100],
    ["c = 2", at(2, 0), 100],
    ["c = 0.3 + 0.3i", at(0.3, 0.3), 100],
    ["c = 2i", at(0, 2), 100],
    ["c = 3i", at(0, 3), 100],
    ["c = 1.5i", at(0, 1.5), 100],
    ["c = 1 + i", at(1, 1), 1],
    ["c = 2 + i", at(2, 1), 1],
    ["c = 3 + i", at(3, 1), 1],
    ["c = 1 + 2i", at(1, 2), 1],
    ["c = 2.5 + 0.4i", at(2.5, 0.4), 1],
    ["c = 1.5 + 0.5i", at(1.5, 0.5), 2],
    // Its orbit passes through a height of 19.18 on the third step, so the
    // constant is read to the unit here: at 19 it leaves a step earlier.
    ["c = 3.24 + 0.02i", at(3.24, 0.02), 3],
  ];

  it.each(PINNED)("%s, at a cap of 100", (_name, c, steps) => {
    expect(count(c, 100)).toBe(steps);
  });
});

describe("the axes are in the set", () => {
  it("keeps every point of the real axis, because a real c keeps the orbit real", () => {
    // The square of a real point is real, its sine is real, and c times a real
    // number is real: 2xy is zero at every step.
    function* samples() {
      for (let x = -30; x <= 30; x += 0.37) {
        yield { at: x, value: count(at(x, 0)) - CAP };
      }
    }

    const { offenders, checked } = sweep(samples(), (value) => value === 0);

    expect(checked).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it("keeps every point of the imaginary axis, because an imaginary c keeps the orbit imaginary", () => {
    // c = iy: the square of an imaginary point is real, its sine is real, and c
    // times a real number is imaginary, so 2xy stays zero.
    function* samples() {
      for (let y = -30; y <= 30; y += 0.37) {
        yield { at: y, value: count(at(0, y)) - CAP };
      }
      for (const y of [-1e6, 1e6, -1e9, 1e9]) {
        yield { at: y, value: count(at(0, y)) - CAP };
      }
    }

    const { offenders, checked } = sweep(samples(), (value) => value === 0);

    expect(checked).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it("never lets c = 0 leave: every point goes to 0 and stays", () => {
    expect(count(at(0, 0))).toBe(CAP);
    expect(sineSquaredKind.orbit!(at(0, 0), 4).slice(1)).toEqual([
      at(0, 0),
      at(0, 0),
      at(0, 0),
      at(0, 0),
    ]);
  });
});

describe("the symmetries", () => {
  // The orbit of -c is the negative of the orbit of c from the first step on,
  // and |2xy| is unchanged, so the count is the same either side of the
  // imaginary axis. Conjugating c conjugates every point (the start is real) and
  // leaves the height unchanged again. The two orbits are the same numbers up to
  // the last bit, so they are compared where a bit cannot yet matter.
  const SHORT = 40;
  const points = grid(-3.4, 3.4, 0.05, 2.4, 24);

  it("is the same under conjugation of c", () => {
    function* samples() {
      for (const c of points) {
        yield {
          at: c,
          value:
            count(at(c.real, -c.imaginary), SHORT) - count(c, SHORT),
        };
      }
    }

    const { offenders, checked } = sweep(samples(), (value) => value === 0);

    expect(checked).toBeGreaterThan(500);
    expect(offenders).toEqual([]);
  });

  it("is the same under negation of c", () => {
    function* samples() {
      for (const c of points) {
        yield {
          at: c,
          value: count(at(-c.real, -c.imaginary), SHORT) - count(c, SHORT),
        };
      }
    }

    const { offenders, checked } = sweep(samples(), (value) => value === 0);

    expect(checked).toBeGreaterThan(500);
    expect(offenders).toEqual([]);
  });
});

describe("the smooth count", () => {
  const escaping = grid(-3.4, 3.4, 0.3, 3.4, 30).filter(
    (c) => count(c, 60) < 60,
  );

  it("falls between the whole count and the next one for every point that leaves", () => {
    function* samples() {
      for (const c of escaping) {
        const whole = count(c, 60);
        const smooth = sineSquaredKind.iterations(c, 60, true);

        yield { at: c, value: Math.max(whole - smooth, smooth - whole - 1) };
      }
    }

    const { offenders, checked } = sweep(samples(), (value) => value <= 0);

    expect(checked).toBeGreaterThan(200);
    expect(offenders).toEqual([]);
  });

  it("counts an orbit that has only just left as the next whole step", () => {
    // The first step lands on c, so c a hair over the height has barely left:
    // the band it would have joined had it left one step later.
    const c = at(0.5, SINE_SQUARED_ESCAPE_HEIGHT + 1e-6);
    const whole = sineSquaredKind.iterations(c, CAP, false);

    expect(whole).toBe(0);
    expect(sineSquaredKind.iterations(c, CAP, true)).toBeCloseTo(whole + 1, 6);
  });

  it("counts an orbit thrown nearly as far as it can go as the whole step", () => {
    // -1.62 + 0.57i leaves on the third step at a height within a thousandth of
    // |c|^2 cosh(20)^2, the most a step from below the height can reach.
    const c = at(-1.62, 0.57);
    const whole = sineSquaredKind.iterations(c, CAP, false);

    expect(whole).toBe(2);
    expect(sineSquaredKind.iterations(c, CAP, true)).toBeLessThan(whole + 0.05);
  });

  it("meets across a band edge, where the whole count steps and the smooth one does not", () => {
    // Along c = 0.5 + iy the first step lands on c, so the orbit leaves at the
    // height y: the band edge is y = 20. Either side of it the smooth count is
    // 1, while the whole count steps from 1 to 0.
    const below = at(0.5, SINE_SQUARED_ESCAPE_HEIGHT - 0.001);
    const above = at(0.5, SINE_SQUARED_ESCAPE_HEIGHT + 1e-6);
    const wholeBelow = sineSquaredKind.iterations(below, CAP, false);
    const wholeAbove = sineSquaredKind.iterations(above, CAP, false);

    expect(wholeBelow).toBe(wholeAbove + 1);
    expect(
      Math.abs(
        sineSquaredKind.iterations(below, CAP, true) -
          sineSquaredKind.iterations(above, CAP, true),
      ),
    ).toBeLessThan(1e-2);
  });

  it("gives the cap for a point that never leaves, smooth or not", () => {
    expect(sineSquaredKind.iterations(at(0.3, 0.4), CAP, true)).toBe(CAP);
  });

  it("varies within a band, so the colours do not step", () => {
    const fractions = new Set(
      escaping.map((c) => {
        const smooth = sineSquaredKind.iterations(c, 60, true);

        return Math.round((smooth - Math.floor(smooth)) * 10);
      }),
    );

    expect(fractions.size).toBeGreaterThan(5);
  });
});

describe("a count that is always a number", () => {
  it("never overflows for a c of any size the page can reach", () => {
    // exp is only ever handed a height of at most 20, so however large c is the
    // numbers stay finite; and a c so large that even its magnitude overflows
    // must not turn the smooth count into NaN.
    const magnitudes = [1e-300, 1e-12, 1, 1e6, 1e12, 1e160, 1e200, 1e300, 1.7e308];

    function* samples() {
      for (const real of magnitudes) {
        for (const imaginary of magnitudes) {
          for (const signedReal of [-real, real]) {
            for (const signedImaginary of [-imaginary, imaginary]) {
              const c = at(signedReal, signedImaginary);

              for (const smooth of [false, true]) {
                yield {
                  at: { c, smooth },
                  value: sineSquaredKind.iterations(c, 200, smooth),
                };
              }
            }
          }
        }
      }
    }

    const { offenders, checked } = sweep(
      samples(),
      (value) => value >= 0 && value <= 200,
    );

    expect(checked).toBeGreaterThan(600);
    expect(offenders).toEqual([]);
  });
});

describe("the opening frame", () => {
  it("is 19.81 percent in the set over a 160 by 90 grid at a cap of 200", () => {
    let inSet = 0;

    for (let row = 0; row < 90; row++) {
      for (let column = 0; column < 160; column++) {
        const c = at(-3 + (6 * column) / 159, -1.6 + (3.2 * row) / 89);
        if (count(c, 200) === 200) inSet++;
      }
    }

    const share = (100 * inSet) / (160 * 90);

    expect(share).toBeGreaterThan(18.81);
    expect(share).toBeLessThan(20.81);
  });
});

describe("the count, the probe and the orbit are one walk", () => {
  const POINTS = grid(-3, 3, 0.15, 2, 14);

  it("agree across a grid", () => {
    function* samples() {
      for (const c of POINTS) {
        const steps = sineSquaredKind.iterations(c, 80, false);
        const info = sineSquaredKind.escapeInfo!(c, 80);
        const orbit = sineSquaredKind.orbit!(c, 80);
        const expectedLength = info.escaped ? info.steps + 2 : 81;

        yield {
          at: c,
          value:
            Math.abs(info.steps - steps) +
            (info.escaped === (steps < 80) ? 0 : 1) +
            Math.abs(orbit.length - expectedLength),
        };
      }
    }

    const { offenders, checked } = sweep(samples(), (value) => value === 0);

    // A grid with both endings in it, so the loop above said something.
    const escaped = POINTS.filter((c) => count(c, 80) < 80).length;
    expect(escaped).toBeGreaterThan(0);
    expect(escaped).toBeLessThan(POINTS.length);
    expect(checked).toBe(POINTS.length);
    expect(offenders).toEqual([]);
  });
});

describe("the trap distance", () => {
  const GRID = grid(-3, 3, 0.2, 1.6, 8);

  it("equals the least distance over the orbit's own points from the second on", () => {
    function* samples() {
      for (const c of GRID) {
        const orbit = sineSquaredKind.orbit!(c, 120);

        for (const shape of TRAP_SHAPES) {
          let least = Infinity;
          for (let index = 1; index < orbit.length; index++) {
            const distance = trapDistanceOf(
              shape,
              orbit[index].real,
              orbit[index].imaginary,
            );
            if (distance < least) least = distance;
          }

          yield {
            at: { c, shape },
            value: sineSquaredKind.trapDistance!(c, 120, shape) - least,
          };
        }
      }
    }

    const { offenders, checked } = sweep(
      samples(),
      (value) => Math.abs(value) <= 1e-9,
    );

    expect(checked).toBe(GRID.length * TRAP_SHAPES.length);
    expect(offenders).toEqual([]);
  });

  it("measures the step it lands on, not the one it starts from", () => {
    // c = 0: the orbit is sqrt(pi / 2) and then 0 for ever. The start is more
    // than a unit from the point trap, and the walk never gets further from 0.
    expect(sineSquaredKind.trapDistance!(at(0, 0), CAP, "point")).toBe(0.5);
    expect(sineSquaredKind.trapDistance!(at(0, 0), CAP, "line")).toBe(0);
    expect(sineSquaredKind.trapDistance!(at(0, 0), CAP, "circle")).toBe(0.5);
  });

  it("answers Infinity when there is no step to measure", () => {
    for (const shape of TRAP_SHAPES) {
      expect(sineSquaredKind.trapDistance!(at(0.5, 0.5), 0, shape)).toBe(
        Infinity,
      );
    }
  });

  it("stops on the fixed point it settles on, so a huge cap is as good as a modest one", () => {
    // Both c settle at 0 (quadratically), so the walk notices the fixed point
    // and breaks: a cap of a billion steps is not a billion steps of work.
    for (const c of [at(0, 0), at(0.3, 0.3)]) {
      for (const shape of TRAP_SHAPES) {
        const huge = sineSquaredKind.trapDistance!(c, 1e9, shape);

        expect(Number.isFinite(huge)).toBe(true);
        expect(huge).toBe(sineSquaredKind.trapDistance!(c, 5000, shape));
      }
    }
  });
});
