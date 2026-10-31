/**
 * The Cosine set: z -> c cos(z), every orbit started at 0, the critical point
 * of cos.
 *
 * What is held here is what the formula says and what the picture shows, read
 * off the kind a point at a time: where the orbit starts and what its first
 * step is, when it is counted as gone, the counts pinned from an independent
 * reference loop, the two mirror symmetries, the real axis that never leaves,
 * the interior disc known in closed form, the shape of the smooth count and
 * that nothing overflows. Because the kind is not in the picker yet, the
 * agreement of the count, the probe, the orbit plot and the trap distance —
 * which `escapeInfo.test.ts`, `orbit.test.ts` and `trapDistance.test.ts` hold
 * for every registered kind — is held here too.
 */
import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import { TRAP_SHAPES, trapDistanceFor, trapDistanceOf } from "../orbitTrap";
import {
  COSINE_ESCAPE_HEIGHT,
  COSINE_INTERIOR_RADIUS,
  COSINE_INVARIANT_RADIUS,
  cosineKind,
  smoothCount,
} from "../cosine";
import { sweep } from "./sweep";

const CAP = 400;

const at = (real: number, imaginary: number): ComplexNumber => ({
  real,
  imaginary,
});

/** The whole-number count: steps survived, or the cap when the orbit never left. */
const count = (c: ComplexNumber, cap = CAP) =>
  cosineKind.iterations(c, cap, false);

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

describe("one walk", () => {
  // The kind ships its own trap loop and its own count loop beside `orbit`.
  // Without a registry entry the shared parity tests do not see it, so the
  // agreement is held here: count, probe, path and trap are the same orbit.
  const points = grid(-2.8, 2.8, -1.5, 1.5, 20);

  it("gives the same steps from the count and the probe, ended exactly when under the cap", () => {
    const { offenders, checked } = sweep(
      points.map((c) => {
        const steps = count(c, 120);
        const info = cosineKind.escapeInfo!(c, 120);
        const disagreement =
          info.steps !== steps ? 1 : info.escaped !== steps < 120 ? 2 : 0;

        return { at: c, value: disagreement };
      }),
      (value) => value === 0,
    );

    expect(checked).toBe(points.length);
    expect(offenders).toEqual([]);
  });

  it("draws the path the count was read from, ending on the point that left", () => {
    const { offenders, checked } = sweep(
      points.map((c) => {
        const steps = count(c, 120);
        const orbit = cosineKind.orbit!(c, 120);
        const last = orbit[orbit.length - 1];
        const expectedLength = steps < 120 ? steps + 2 : 121;
        const startsRight = orbit[0].real === 0 && orbit[0].imaginary === 0;
        const endsRight =
          steps === 120 || Math.abs(last.imaginary) > COSINE_ESCAPE_HEIGHT;

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
      grid(-2.8, 2.8, -1.5, 1.5, 12).flatMap((c) =>
        TRAP_SHAPES.map((shape) => {
          const path = cosineKind.orbit!(c, trapCap);
          let walked = Infinity;

          for (let index = 1; index < path.length; index++) {
            const distance = trapDistanceOf(
              shape,
              path[index].real,
              path[index].imaginary,
            );
            if (distance < walked) walked = distance;
          }

          const answered = trapDistanceFor(cosineKind, c, trapCap, shape);
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

    expect(checked).toBe(13 * 13 * TRAP_SHAPES.length);
    expect(offenders).toEqual([]);
  });
});

describe("the orbit", () => {
  it("starts at 0, the critical point of cos, whatever c is", () => {
    for (const c of [at(0, 0), at(0.3, 0.4), at(-2.5, 1.1), at(40, 40)]) {
      expect(cosineKind.orbit!(c, 5)[0]).toEqual(at(0, 0));
    }
  });

  it("takes c itself as its first step, since cos(0) is 1", () => {
    // The first point after the start is c, which is why the picture is read
    // like the Mandelbrot set, whose first step also lands on c.
    for (const c of [at(0.3, 0.4), at(-2.5, 1.1), at(1.6, 0.1), at(0, 19)]) {
      expect(cosineKind.orbit!(c, 3)[1]).toEqual(c);
    }
  });

  it("takes the next step as c times the cosine of the last point", () => {
    // cos(x + iy) = cos x cosh y - i sin x sinh y, multiplied out by hand for
    // c = 0.5 + 0.25i from z1 = c.
    const c = at(0.5, 0.25);
    const cosineReal = Math.cos(0.5) * Math.cosh(0.25);
    const cosineImaginary = -Math.sin(0.5) * Math.sinh(0.25);
    const second = cosineKind.orbit!(c, 3)[2];

    expect(second.real).toBeCloseTo(
      0.5 * cosineReal - 0.25 * cosineImaginary,
      12,
    );
    expect(second.imaginary).toBeCloseTo(
      0.5 * cosineImaginary + 0.25 * cosineReal,
      12,
    );
  });

  it("stops at the cap for a point that never leaves", () => {
    expect(cosineKind.orbit!(at(0, 0), 10)).toHaveLength(11);
  });

  it("ends on the point that left, with every earlier point at or under the height", () => {
    const ended = grid(-3, 3, 0.5, 3, 12).flatMap((c) => {
      const orbit = cosineKind.orbit!(c, 60);
      const last = orbit[orbit.length - 1];

      return Math.abs(last.imaginary) > COSINE_ESCAPE_HEIGHT
        ? [{ c, orbit }]
        : [];
    });

    // A grid that never ended an orbit would prove nothing.
    expect(ended.length).toBeGreaterThan(50);

    const { offenders } = sweep(
      ended.map(({ c, orbit }) => {
        const over = orbit
          .slice(0, -1)
          .filter(
            (point) => Math.abs(point.imaginary) > COSINE_ESCAPE_HEIGHT,
          ).length;

        return {
          at: c,
          value: orbit.length - (count(c, 60) + 2) + over,
        };
      }),
      (value) => value === 0,
    );

    expect(offenders).toEqual([]);
  });
});

describe("when a point is gone", () => {
  it("counts a c more than the height off the real axis as gone on the first step", () => {
    expect(count(at(0, COSINE_ESCAPE_HEIGHT + 1))).toBe(0);
    expect(count(at(3, -(COSINE_ESCAPE_HEIGHT + 1)))).toBe(0);
    expect(count(at(-7, 25))).toBe(0);
  });

  it("reads the height with its sign dropped, so above and below the axis agree", () => {
    const { offenders } = sweep(
      grid(-3, 3, 0.2, 3, 10).map((c) => ({
        at: c,
        value: count(at(c.real, -c.imaginary), 40) - count(c, 40),
      })),
      (value) => value === 0,
    );

    expect(offenders).toEqual([]);
  });

  it("is the height of 20, not some other height", () => {
    // c = 19.5i is under the height on its first step, so it survives that one
    // and is thrown out by the second; a limit of 19 would drop it at once.
    expect(count(at(0, 19.5))).toBe(1);
    expect(count(at(0, 20.5))).toBe(0);
  });
});

describe("the lines that never leave", () => {
  it("keeps every point of the real axis in the set, because a real c gives a real orbit bounded by |c|", () => {
    const { offenders } = sweep(
      Array.from({ length: 163 }, (_, index) => at(-30 + 0.37 * index, 0)).map(
        (c) => ({ at: c, value: CAP - count(c) }),
      ),
      (value) => value === 0,
    );

    expect(offenders).toEqual([]);
  });

  it("never lets c = 0 leave: every point goes to 0 and stays", () => {
    expect(count(at(0, 0))).toBe(CAP);
    expect(cosineKind.orbit!(at(0, 0), 4).slice(1)).toEqual([
      at(0, 0),
      at(0, 0),
      at(0, 0),
      at(0, 0),
    ]);
  });
});

describe("the interior known in closed form", () => {
  /** The count the orbit walk gives: no shortcut, the path read for itself. */
  function walked(c: ComplexNumber, cap: number): number {
    const orbit = cosineKind.orbit!(c, cap);
    const last = orbit[orbit.length - 1];

    return Math.abs(last.imaginary) > COSINE_ESCAPE_HEIGHT
      ? orbit.length - 2
      : cap;
  }

  it("is the disc of radius r / cosh r, where r tanh r = 1", () => {
    expect(
      COSINE_INVARIANT_RADIUS * Math.tanh(COSINE_INVARIANT_RADIUS),
    ).toBeCloseTo(1, 12);
    expect(COSINE_INTERIOR_RADIUS).toBeCloseTo(
      COSINE_INVARIANT_RADIUS / Math.cosh(COSINE_INVARIANT_RADIUS),
      12,
    );
  });

  it("keeps every orbit inside the invariant disc, which is why it never leaves", () => {
    // |cos z| <= cosh |z|, so from a point of modulus at most ρ a step lands at
    // modulus at most |c| cosh ρ <= ρ for every ρ up to r, by the choice of r.
    // Every orbit point is checked, in one assertion over the lot (see
    // sweep.ts); the value is how far past r the point went, and a point that
    // is not a number fails whatever the bound says.
    function* samples() {
      for (const c of grid(-0.6, 0.6, -0.6, 0.6, 14)) {
        if (Math.hypot(c.real, c.imaginary) >= COSINE_INTERIOR_RADIUS) continue;

        for (const point of cosineKind.orbit!(c, 120).slice(1)) {
          yield {
            at: { c, point },
            value:
              Math.hypot(point.real, point.imaginary) - COSINE_INVARIANT_RADIUS,
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
    // A disc that was wrongly large would answer the cap where the walk
    // escapes: this grid reaches out to |c| = 1.3, where it does (0.8i, for
    // one), and keeps points inside the disc too.
    const points = grid(-1.3, 1.3, -1.3, 1.3, 32);
    let escaped = 0;

    for (const c of points) {
      if (count(c, 150) < 150) escaped++;
    }

    expect(escaped).toBeGreaterThan(50);

    const { offenders } = sweep(
      points.map((c) => ({
        at: c,
        value: count(c, 150) - walked(c, 150),
      })),
      (value) => value === 0,
    );

    expect(offenders).toEqual([]);
  });
});

describe("the symmetries", () => {
  // Conjugating c conjugates every point of the orbit (the start is real), and
  // the height |Im z| is unchanged. cos is even, so the orbit of -c is the
  // negative of the orbit of c from the first step on, and the heights agree.
  // The two orbits are the same numbers up to the last bit, so they are
  // compared where a bit cannot yet matter: within a dozen steps.
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

describe("the smooth count", () => {
  const escaping = grid(-3.4, 3.4, 0.3, 3.4, 30).filter(
    (c) => count(c, 60) < 60,
  );

  it("falls between the whole count and the next one for every point that leaves", () => {
    expect(escaping.length).toBeGreaterThan(200);

    const { offenders } = sweep(
      escaping.map((c) => {
        const whole = cosineKind.iterations(c, 60, false);
        const smooth = cosineKind.iterations(c, 60, true);

        return {
          at: c,
          value: Math.max(whole - smooth, smooth - (whole + 1)),
        };
      }),
      (value) => value <= 0,
    );

    expect(offenders).toEqual([]);
  });

  it("counts an orbit that has only just left as the next whole step", () => {
    // The first step lands on c, so c a hair above the height has barely left:
    // the band it would have joined had it left one step later.
    const smooth = cosineKind.iterations(
      at(0, COSINE_ESCAPE_HEIGHT + 1e-6),
      CAP,
      true,
    );

    expect(smooth).toBeCloseTo(1, 3);
  });

  it("counts an orbit thrown as far as it can go as the whole step", () => {
    // c = 19.9i is under the height on the first step, and the second puts cos
    // at its largest, cosh(19.9), so the orbit jumps about as far as a step
    // from under the height can. The count is then the step it left on; the
    // little left over is the gap between cosh(19.9) and the bound's cosh(20).
    const c = at(0, 19.9);
    const whole = cosineKind.iterations(c, CAP, false);

    expect(whole).toBe(1);
    expect(cosineKind.iterations(c, CAP, true)).toBeLessThan(whole + 0.05);
  });

  it("gives the cap for a point that never leaves, smooth or not", () => {
    expect(cosineKind.iterations(at(0.3, 0.4), CAP, true)).toBe(CAP);
  });

  it("varies within a band, so the colours do not step", () => {
    const fractions = new Set(
      escaping.map((c) => {
        const smooth = cosineKind.iterations(c, 60, true);

        return Math.round((smooth - Math.floor(smooth)) * 10);
      }),
    );

    expect(fractions.size).toBeGreaterThan(5);
  });

  it("clamps a fraction off the ends of its range back into [n, n + 1]", () => {
    // The clamp is a guard: an orbit only ever leaves with a height between the
    // limit and |c| cosh(20), so the logarithm's fraction is already in [0, 1],
    // and the clamp only catches a value that rounding or a call outside the
    // formula's domain pushed past an end. Dropping it is what this holds:
    // a height below the limit would count above n + 1, one far past the bound
    // would count far below n.
    expect(smoothCount(3, 10, 2)).toBe(4);
    expect(smoothCount(3, 1e300, 1)).toBe(3);
  });
});

describe("the pinned counts", () => {
  // From a throwaway reference loop written and run on 31 October 2026, an
  // implementation independent of the kind, so a test that pins them also
  // checks the kind's loop against it. Cap 100, non-smooth.
  it.each([
    ["c = 0", 0, 0, 100],
    ["c = 0.5", 0.5, 0, 100],
    ["c = 2", 2, 0, 100],
    ["c = 1 + i", 1, 1, 100],
    ["c = 0.3 + 0.3i", 0.3, 0.3, 100],
    ["c = 2i", 0, 2, 2],
    ["c = 3i", 0, 3, 1],
    ["c = 1.5i", 0, 1.5, 2],
    ["c = 2 + i", 2, 1, 3],
    ["c = 3 + i", 3, 1, 3],
    ["c = 1 + 2i", 1, 2, 7],
    ["c = 1.5 + 0.5i", 1.5, 0.5, 6],
    ["c = 2.5 + 0.4i", 2.5, 0.4, 4],
  ])("holds %s at %d + %di", (_name, real, imaginary, expected) => {
    expect(count(at(real, imaginary), 100)).toBe(expected);
  });
});

describe("the opening frame", () => {
  it("holds 29.25 percent of a 160 by 90 frame across re -2.8..2.8 and im -1.5..1.5", () => {
    // This is the picture that was looked at: the share is what makes it that
    // one, so no later checksum can freeze a different frame.
    let inside = 0;

    for (let row = 0; row < 90; row++) {
      for (let column = 0; column < 160; column++) {
        const c = at(-2.8 + (5.6 * column) / 159, -1.5 + (3 * row) / 89);
        if (count(c, 200) === 200) inside++;
      }
    }

    const share = (100 * inside) / (160 * 90);

    expect(share).toBeGreaterThanOrEqual(28.25);
    expect(share).toBeLessThanOrEqual(30.25);
  });
});

describe("a count that is always a number", () => {
  // exp is only ever handed a height of at most 20 plus the step that left, so
  // however large c is the count stays finite. c = 1e300 + 19.9i is the far
  // corner: its second step overflows to an infinity, which the clamp in the
  // smooth count absorbs, and both counts are still numbers.
  const huge = [
    at(1e6, 0.5),
    at(-1e6, 19.5),
    at(1e12, 1e-3),
    at(1e300, 1),
    at(1e300, 19.9),
    at(1e-300, 1e-300),
    at(1e6, 1e6),
  ];

  it("never overflows the count for a c of any size the page can reach", () => {
    const { offenders } = sweep(
      huge.flatMap((c) => [
        {
          at: { c, smooth: false },
          value: cosineKind.iterations(c, CAP, false),
        },
        { at: { c, smooth: true }, value: cosineKind.iterations(c, CAP, true) },
      ]),
      () => true,
    );

    expect(offenders).toEqual([]);
  });

  it("walks finite points while the step has not overflowed", () => {
    const { offenders } = sweep(
      huge
        .filter((c) => Math.abs(c.imaginary) < 19.5)
        .flatMap((c) =>
          cosineKind.orbit!(c, 30).flatMap((point) => [
            { at: { c, point, part: "real" }, value: point.real },
            { at: { c, point, part: "imaginary" }, value: point.imaginary },
          ]),
        ),
      () => true,
    );

    expect(offenders).toEqual([]);
  });
});
