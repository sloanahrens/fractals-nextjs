/**
 * The Sine set: z -> c sin(z), every orbit started at the critical point pi / 2.
 *
 * What is held here is what the formula says and what the picture shows, read
 * off the kind a point at a time: where the orbit starts and what its first step
 * is, when it is counted as gone, the two mirror symmetries, the lines of the
 * plane that never leave, the shape of the smooth count and that nothing
 * overflows. That the count, the probe, the orbit plot and the trap distance
 * all walk one orbit is held for every kind together (`escapeInfo.test.ts`,
 * `orbit.test.ts`, `trapDistance.test.ts`).
 */
import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import {
  cycleIsTrapped,
  SINE_ESCAPE_HEIGHT,
  SINE_INTERIOR_RADIUS,
  SINE_START,
  SINE_TRAP_RADII,
  sineKind,
} from "../sine";
import { sweep } from "./sweep";

const CAP = 400;

const at = (real: number, imaginary: number): ComplexNumber => ({
  real,
  imaginary,
});

/** The whole-number count: steps survived, or the cap when the orbit never left. */
const count = (c: ComplexNumber, cap = CAP) =>
  sineKind.iterations(c, cap, false);

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

describe("the orbit", () => {
  it("starts at pi / 2, whatever c is", () => {
    for (const c of [at(0, 0), at(0.3, 0.4), at(-2.5, 1.1), at(40, 40)]) {
      expect(sineKind.orbit!(c, 5)[0]).toEqual(at(SINE_START, 0));
    }
  });

  it("takes c itself as its first step, since sin(pi / 2) is 1", () => {
    // The first point after the start is c, which is why the picture is read
    // like the Mandelbrot set, whose first step also lands on c.
    for (const c of [at(0.3, 0.4), at(-2.5, 1.1), at(1.6, 0.1), at(0, 19)]) {
      expect(sineKind.orbit!(c, 3)[1]).toEqual(c);
    }
  });

  it("takes the next step as c times the sine of the last point", () => {
    // sin(x + iy) = sin x cosh y + i cos x sinh y, multiplied out by hand for
    // c = 0.5 + 0.25i from z1 = c.
    const c = at(0.5, 0.25);
    const sineReal = Math.sin(0.5) * Math.cosh(0.25);
    const sineImaginary = Math.cos(0.5) * Math.sinh(0.25);
    const second = sineKind.orbit!(c, 3)[2];

    expect(second.real).toBeCloseTo(0.5 * sineReal - 0.25 * sineImaginary, 12);
    expect(second.imaginary).toBeCloseTo(
      0.5 * sineImaginary + 0.25 * sineReal,
      12,
    );
  });

  it("stops at the cap for a point that never leaves", () => {
    expect(sineKind.orbit!(at(0, 0), 10)).toHaveLength(11);
  });

  it("ends on the point that left, with every earlier point at or under the height", () => {
    let ended = 0;

    for (const c of grid(-3, 3, 0.5, 3, 12)) {
      const orbit = sineKind.orbit!(c, 60);
      const last = orbit[orbit.length - 1];

      if (Math.abs(last.imaginary) <= SINE_ESCAPE_HEIGHT) continue;

      ended++;
      expect(orbit.length, `${c.real},${c.imaginary}`).toBe(count(c, 60) + 2);
      for (const point of orbit.slice(0, -1)) {
        expect(Math.abs(point.imaginary)).toBeLessThanOrEqual(
          SINE_ESCAPE_HEIGHT,
        );
      }
    }

    // A grid that never ended an orbit would prove nothing.
    expect(ended).toBeGreaterThan(50);
  });
});

describe("when a point is gone", () => {
  it("counts a c more than the height off the real axis as gone on the first step", () => {
    expect(count(at(0, SINE_ESCAPE_HEIGHT + 1))).toBe(0);
    expect(count(at(3, -(SINE_ESCAPE_HEIGHT + 1)))).toBe(0);
    expect(count(at(-7, 25))).toBe(0);
  });

  it("reads the height with its sign dropped, so above and below the axis agree", () => {
    for (const c of grid(-3, 3, 0.2, 3, 10)) {
      expect(count(at(c.real, -c.imaginary), 40)).toBe(count(c, 40));
    }
  });

  it("is a step or two for most of the plane", () => {
    // Away from the set the sine puts the height through an exponential, so the
    // orbit is thrown out almost at once; the count is what the colours show.
    expect(count(at(3, 2))).toBe(2);
    expect(count(at(-4, 3))).toBeLessThanOrEqual(3);
  });
});

describe("the lines that never leave", () => {
  it("keeps every point of the real axis in the set, because an orbit that starts real stays real", () => {
    for (let x = -30; x <= 30; x += 0.37) {
      expect(count(at(x, 0)), String(x)).toBe(CAP);
    }
  });

  it("keeps a point of the imaginary axis in the set while its height is under the limit", () => {
    // c = iy: the first step is iy, the second is real, the third is
    // i y sin(that), whose height is at most y, and so on; the height never
    // passes y. So the black line up the middle of the picture is real.
    for (const y of [0.4, 5.3, -12.5, 19.9]) {
      expect(count(at(0, y)), String(y)).toBe(CAP);
    }
    expect(count(at(0, 20.5))).toBe(0);
  });

  it("never lets c = 0 leave: every point goes to 0 and stays", () => {
    expect(count(at(0, 0))).toBe(CAP);
    expect(sineKind.orbit!(at(0, 0), 4).slice(1)).toEqual([
      at(0, 0),
      at(0, 0),
      at(0, 0),
      at(0, 0),
    ]);
  });
});

describe("the bulbs of the set", () => {
  // Measured on a 0.002 grid at a cap of 400 along y = 0.1 (the real axis is all
  // in the set, so the run is read just off it): the central disc is |c| < 1,
  // where the fixed point 0 attracts because its multiplier is c, and the other
  // runs are the discs beside it.
  it("holds the central disc: every point with |c| under 0.95 stays", () => {
    for (const c of grid(-0.95, 0.95, -0.95, 0.95, 16)) {
      if (Math.hypot(c.real, c.imaginary) >= 0.95) continue;

      expect(count(c), `${c.real},${c.imaginary}`).toBe(CAP);
    }
  });

  it.each([
    ["the disc beside the central one", at(1.6, 0.1)],
    ["the small disc after it", at(2.4, 0.1)],
    ["the far bead", at(4.7, 0.1)],
  ])("holds %s", (_name, c) => {
    expect(count(c)).toBe(CAP);
  });

  it.each([
    ["between the beads", at(3.5, 0.1)],
    ["above the central disc", at(0.5, 1.4)],
  ])("lets the plane %s go", (_name, c) => {
    expect(count(c)).toBeLessThan(CAP);
  });
});

describe("the interior known in closed form", () => {
  /** The count the orbit walk gives: no shortcut, the path read for itself. */
  function walked(c: ComplexNumber, cap: number): number {
    const orbit = sineKind.orbit!(c, cap);
    const last = orbit[orbit.length - 1];

    return Math.abs(last.imaginary) > SINE_ESCAPE_HEIGHT
      ? orbit.length - 2
      : cap;
  }

  it("is the disc of radius asinh(1), where sinh of the radius is 1", () => {
    expect(Math.sinh(SINE_INTERIOR_RADIUS)).toBeCloseTo(1, 12);
  });

  it("keeps every orbit inside the disc of radius |c|, which is why it never leaves", () => {
    // |sin z| <= sinh |z|, so from a point of modulus at most |c| a step lands at
    // modulus at most |c| sinh |c| <= |c|: the orbit is held in that disc.
    // Every orbit point is checked, in one assertion over the lot (see
    // sweep.ts); the value is how far past |c| the point went, and a point that
    // is not a number fails whatever the bound says.
    function* samples() {
      for (const c of grid(-0.88, 0.88, -0.88, 0.88, 14)) {
        const size = Math.hypot(c.real, c.imaginary);
        if (size >= SINE_INTERIOR_RADIUS) continue;

        for (const point of sineKind.orbit!(c, 120).slice(1)) {
          yield {
            at: { c, point },
            value: Math.hypot(point.real, point.imaginary) - size,
          };
        }
      }
    }

    const { offenders, checked } = sweep(
      samples(),
      (excess) => excess <= 1e-12,
    );

    // An empty grid would prove nothing.
    expect(checked).toBeGreaterThan(10000);
    expect(offenders).toEqual([]);
  });

  it("gives the same count as walking the orbit, inside the disc and well past its edge", () => {
    // A disc that was wrongly large would change a count somewhere in this
    // grid, which reaches out to |c| = 1.8, where the set has holes.
    let escaped = 0;

    for (const c of grid(-1.3, 1.3, -1.3, 1.3, 32)) {
      expect(count(c, 150), `${c.real},${c.imaginary}`).toBe(walked(c, 150));
      if (count(c, 150) < 150) escaped++;
    }

    expect(escaped).toBeGreaterThan(50);
  });
});

describe("the symmetries", () => {
  // Conjugating c conjugates every point of the orbit (the start is real), and
  // the height |Im z| is unchanged, so the count is the same above and below the
  // real axis. Negating c gives the even points of the orbit of c and the
  // negatives of the odd ones, so the heights agree and the count is the same
  // left and right of the imaginary axis. The two orbits are the same numbers
  // up to the last bit, so they are compared where a bit cannot yet matter:
  // within a dozen steps.
  const SHORT = 12;
  const points = grid(-3.4, 3.4, 0.05, 2.4, 24);

  it("is the same under conjugation of c", () => {
    for (const c of points) {
      expect(count(at(c.real, -c.imaginary), SHORT)).toBe(count(c, SHORT));
    }
  });

  it("is the same under negation of c", () => {
    for (const c of points) {
      expect(
        count(at(-c.real, -c.imaginary), SHORT),
        `${c.real},${c.imaginary}`,
      ).toBe(count(c, SHORT));
    }
  });
});

describe("the walk cut short", () => {
  /** The loop with no shortcut at all: every step to the cap, the count as it was. */
  function plainWalk(c: ComplexNumber, cap: number): number {
    let real = SINE_START;
    let imaginary = 0;

    for (let iterations = 0; iterations < cap; iterations++) {
      const up = Math.exp(imaginary);
      const down = 1 / up;
      const sineReal = (Math.sin(real) * (up + down)) / 2;
      const sineImaginary = (Math.cos(real) * (up - down)) / 2;
      real = c.real * sineReal - c.imaginary * sineImaginary;
      imaginary = c.real * sineImaginary + c.imaginary * sineReal;

      if (Math.abs(imaginary) > SINE_ESCAPE_HEIGHT) return iterations;
    }

    return cap;
  }

  it("gives the count the whole walk gives, over a grid that crosses the annulus and the band", () => {
    // Two grids: one through the annulus between the closed-form disc and the
    // unit disc, where the ball does its work, and one along the band around
    // the real axis, where only the cycle proof ends a walk early.
    function* samples() {
      for (const cap of [50, 100, 400, 1000]) {
        for (const c of [
          ...grid(-1, 1, -1, 1, 48),
          ...grid(-2, 2, -0.4, 0.4, 40),
        ]) {
          yield { at: { c, cap }, value: count(c, cap) - plainWalk(c, cap) };
        }
      }
    }

    const { offenders, checked } = sweep(
      samples(),
      (difference) => difference === 0,
    );

    // A grid that touched no shortcut would prove nothing.
    expect(checked).toBeGreaterThan(16000);
    expect(offenders).toEqual([]);
  });

  it("is exercised by that grid: it holds points in both shortcut regions", () => {
    const annulus = grid(-1, 1, -1, 1, 48).filter((c) => {
      const squared = c.real * c.real + c.imaginary * c.imaginary;

      return (
        squared >= SINE_INTERIOR_RADIUS * SINE_INTERIOR_RADIUS &&
        squared < 1 &&
        count(c, 200) === 200
      );
    });
    const band = grid(-2, 2, -0.4, 0.4, 40).filter(
      (c) =>
        c.real * c.real + c.imaginary * c.imaginary >= 1 &&
        count(c, 200) === 200,
    );

    expect(annulus.length).toBeGreaterThan(20);
    expect(band.length).toBeGreaterThan(20);
  });
});

describe("the balls that hold an orbit", () => {
  it("starts past the closed-form disc, whose points never read the table", () => {
    // A row for an |c| the disc already answers would never be selected, since
    // the disc returns before the walk begins. The widest row must therefore
    // sit outside it.
    expect(SINE_TRAP_RADII[0][0]).toBeGreaterThan(
      SINE_INTERIOR_RADIUS * SINE_INTERIOR_RADIUS,
    );
  });

  it("keeps |c| sinh R at or under R in every row, which is what traps the orbit", () => {
    expect(SINE_TRAP_RADII.length).toBeGreaterThan(0);

    for (const [cMaxSquared, radiusSquared] of SINE_TRAP_RADII) {
      const cMax = Math.sqrt(cMaxSquared);
      const radius = Math.sqrt(radiusSquared);

      expect(
        cMax * Math.sinh(radius),
        `|c| up to ${cMax}, R ${radius}`,
      ).toBeLessThanOrEqual(radius);
      // A ball taller than the escape height would not be a proof of staying.
      expect(radius).toBeLessThan(SINE_ESCAPE_HEIGHT);
    }
  });

  it("runs from the widest ball to the narrowest, each for a smaller |c|", () => {
    for (let index = 1; index < SINE_TRAP_RADII.length; index++) {
      expect(SINE_TRAP_RADII[index][1]).toBeLessThan(
        SINE_TRAP_RADII[index - 1][1],
      );
      expect(SINE_TRAP_RADII[index][0]).toBeGreaterThan(
        SINE_TRAP_RADII[index - 1][0],
      );
    }
  });
});

describe("the proof that a walk comes back to stay", () => {
  it("holds the ball for an orbit that has settled, and the walk it stands for never leaves", () => {
    // c = 1.6 is in the bulb beside the central disc. Its orbit comes in on a
    // fixed point: by the fifth step it has moved less than a millionth, and
    // the proof carries the ball round that step and finds it kept. The walk
    // the count stands for is checked the whole way: four thousand steps, and
    // it never leaves.
    const c = at(1.6, 0);
    const points = sineKind.orbit!(c, 100);
    const returned = points.findIndex(
      (point, index) =>
        index > 0 &&
        Math.abs(point.real - points[index - 1].real) < 1e-6 &&
        Math.abs(point.imaginary - points[index - 1].imaginary) < 1e-6,
    );

    expect(returned).toBeGreaterThan(0);
    const from = points[returned - 1];
    const to = points[returned];

    expect(
      cycleIsTrapped(
        1.6,
        0,
        1.6,
        from.real,
        from.imaginary,
        to.real,
        to.imaginary,
        1,
      ),
    ).toBe(true);
    expect(sineKind.orbit!(c, 4000)).toHaveLength(4001);
  });

  it("refuses a ball the map does not keep", () => {
    // c = 3 throws a neighbourhood of 1 apart: over four steps the ball round
    // it is wider than it started, so the bound says nothing and the proof
    // says no. The orbit there is in the set anyway -- a real c keeps an orbit
    // on the real line -- but a proof that cannot show it leaves the count to
    // the plain walk rather than guess.
    expect(cycleIsTrapped(3, 0, 3, 1, 0, 1 + 1e-7, 0, 4)).toBe(false);
  });
});

describe("the smooth count", () => {
  const escaping = grid(-3.4, 3.4, 0.3, 3.4, 30).filter(
    (c) => count(c, 60) < 60,
  );

  it("falls between the whole count and the next one for every point that leaves", () => {
    expect(escaping.length).toBeGreaterThan(200);

    for (const c of escaping) {
      const whole = sineKind.iterations(c, 60, false);
      const smooth = sineKind.iterations(c, 60, true);

      expect(smooth, `${c.real},${c.imaginary}`).toBeGreaterThanOrEqual(whole);
      expect(smooth, `${c.real},${c.imaginary}`).toBeLessThanOrEqual(whole + 1);
    }
  });

  it("counts an orbit that has only just left as the next whole step", () => {
    // The first step lands on c, so c a hair above the height has barely left:
    // the band it would have joined had it left one step later.
    const smooth = sineKind.iterations(
      at(0, SINE_ESCAPE_HEIGHT + 1e-6),
      CAP,
      true,
    );

    expect(smooth).toBeCloseTo(1, 3);
  });

  it("counts an orbit thrown as far as it can go as the whole step", () => {
    // c = (pi / 2, 19.9) is under the height on the first step, and the second
    // step puts sin on its largest, Im(c sin z1) = 19.9 cosh(19.9) roughly, near
    // the most a step from under the height can reach. The count is then the
    // step it left on, one more is for orbits that left by a hair.
    const c = at(Math.PI / 2, 19.9);
    const whole = sineKind.iterations(c, CAP, false);

    expect(whole).toBe(1);
    expect(sineKind.iterations(c, CAP, true)).toBeLessThan(whole + 0.05);
  });

  it("gives the cap for a point that never leaves, smooth or not", () => {
    expect(sineKind.iterations(at(0.3, 0.4), CAP, true)).toBe(CAP);
  });

  it("varies within a band, so the colours do not step", () => {
    const fractions = new Set(
      escaping.map((c) => {
        const smooth = sineKind.iterations(c, 60, true);

        return Math.round((smooth - Math.floor(smooth)) * 10);
      }),
    );

    expect(fractions.size).toBeGreaterThan(5);
  });
});

describe("a count that is always a number", () => {
  it("never overflows for a c of any size the page can reach", () => {
    // exp is only ever handed a height of at most 20 plus the step that left, so
    // however large c is the numbers stay finite.
    for (const c of [
      at(1e6, 0.5),
      at(-1e6, 19.5),
      at(1e12, 1e-3),
      at(1e300, 1),
      at(1e-300, 1e-300),
      at(1e6, 1e6),
    ]) {
      for (const smooth of [false, true]) {
        const value = sineKind.iterations(c, CAP, smooth);

        expect(Number.isFinite(value), `${c.real},${c.imaginary}`).toBe(true);
      }
      for (const point of sineKind.orbit!(c, 30)) {
        expect(Number.isFinite(point.real)).toBe(true);
        expect(Number.isFinite(point.imaginary)).toBe(true);
      }
    }
  });
});
