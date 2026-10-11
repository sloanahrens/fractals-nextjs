/**
 * `orbit`, every kind's answer to "what path did this point take?".
 *
 * The Math card's plot draws these points (`src/components/ui/OrbitPlot.tsx`),
 * so what is held here is that the path is the real one: it starts where the
 * kind says the orbit starts, it is the sequence the count was read from, it
 * ends on the point that ended it, and it stops at the cap. A few of the paths
 * are worked out by hand — the Mandelbrot set's c = 1 and c = -1, the escape
 * step of the four other escape-time kinds, Newton's -0.5 — because "the path
 * the kind's own loop would take" is exactly the thing under test.
 */
import { describe, expect, it } from "vitest";

import { burningShipKind } from "../burningShip";
import { createJuliaKind } from "../julia";
import { escapeTimeOrbit, mandelbrotKind } from "../mandelbrot";
import { ORBIT_MAX_STEPS, orbitFor } from "../mathProbe";
import { MULTIBROT_POWERS, createMultibrotKind } from "../multibrot";
import { NEWTON_ROOTS, NEWTON_TOLERANCE, newtonKind } from "../newton";
import { celticKind } from "../celtic";
import { tricornKind } from "../tricorn";
import type { ComplexNumber, FractalKind } from "../../types/fractal";

const CAP = 200;
const ORIGIN: ComplexNumber = { real: 0, imaginary: 0 };

interface KindCase {
  name: string;
  kind: FractalKind;
  /** Where every orbit of this kind starts. */
  starts: (point: ComplexNumber) => ComplexNumber;
  /** A point that runs the whole cap. */
  neverEnds: ComplexNumber;
  /** How many points the plot gets for that point, for a given cap. */
  neverEndsLength: (maxSteps: number) => number;
  /** A point whose orbit ends, and the step the count says it ended on. */
  endsAt: { point: ComplexNumber; steps: number };
  /**
   * How many points an ended orbit has beyond `steps`. The escape-time kinds
   * report the index of the step that left the radius, so the point that left
   * sits one past it and the start one before: `steps + 2`. Newton's steps
   * count the steps taken to arrive, so its path is `steps + 1`.
   */
  endedLength: (steps: number) => number;
  /** Whether the kind's end is an escape (it left the radius) or an arrival. */
  escapes: boolean;
}

const atOrigin = (): ComplexNumber => ORIGIN;
const atPoint = (point: ComplexNumber): ComplexNumber => point;

const CASES: KindCase[] = [
  {
    name: "mandelbrot",
    kind: mandelbrotKind,
    starts: atOrigin,
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    // c = 2 leaves the radius on the second step, counted as step 1.
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "julia",
    kind: createJuliaKind({ real: 0, imaginary: 1 }),
    starts: atPoint,
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    endsAt: { point: { real: 3, imaginary: 0 }, steps: 0 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "burning-ship",
    kind: burningShipKind,
    starts: atOrigin,
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "tricorn",
    kind: tricornKind,
    starts: atOrigin,
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "celtic",
    kind: celticKind,
    starts: atOrigin,
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "multibrot 3",
    kind: createMultibrotKind(3),
    starts: atOrigin,
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "newton",
    kind: newtonKind,
    starts: atPoint,
    // z = 0 has no step at all (the derivative vanishes), so its path is the
    // one point and stops there rather than walking the cap.
    neverEnds: ORIGIN,
    neverEndsLength: () => 1,
    // -0.5 is sent to the root 1 in one step; 1 is already a root.
    endsAt: { point: { real: -0.5, imaginary: 0 }, steps: 1 },
    endedLength: (steps) => steps + 1,
    escapes: false,
  },
];

/** One point of a path, for a readable failure. */
function at(point: ComplexNumber): ComplexNumber {
  return { real: point.real, imaginary: point.imaginary };
}

describe.each(CASES)("$name", (kindCase) => {
  const { kind, starts, neverEnds, neverEndsLength, endsAt, endedLength } =
    kindCase;

  it("starts where the kind starts its orbit", () => {
    expect(kind.orbit!(endsAt.point, ORBIT_MAX_STEPS)[0]).toEqual(
      starts(endsAt.point),
    );
  });

  it("walks the whole cap in points when nothing ends the orbit", () => {
    expect(kind.orbit!(neverEnds, ORBIT_MAX_STEPS)).toHaveLength(
      neverEndsLength(ORBIT_MAX_STEPS),
    );
    expect(kind.escapeInfo!(neverEnds, CAP).escaped).toBe(false);
  });

  it("is as long as the count's step says, and ends on the point that ended it", () => {
    const info = kind.escapeInfo!(endsAt.point, CAP);
    const orbit = kind.orbit!(endsAt.point, ORBIT_MAX_STEPS);

    expect(info.escaped).toBe(true);
    expect(info.steps).toBe(endsAt.steps);
    // The walk stopped on its own rather than at the cap: the last point is
    // the one that ended it.
    expect(orbit.length).toBeLessThan(ORBIT_MAX_STEPS + 1);
    expect(orbit).toHaveLength(endedLength(info.steps));
  });

  it("stops at the cap when the orbit has not ended by then", () => {
    // A short cap is a short path: the plot draws what it asked for and no
    // step beyond it, whatever the orbit would have done.
    expect(kind.orbit!(neverEnds, 5)).toHaveLength(neverEndsLength(5));
  });
});

describe("the Mandelbrot set's own paths", () => {
  it("walks c = 1 out of the radius in three steps, with the values written out", () => {
    // 0 -> 1 -> 2 -> 5, and 5 is the first point outside the radius of 2.
    expect(mandelbrotKind.orbit!({ real: 1, imaginary: 0 }, 6)).toEqual([
      { real: 0, imaginary: 0 },
      { real: 1, imaginary: 0 },
      { real: 2, imaginary: 0 },
      { real: 5, imaginary: 0 },
    ]);
  });

  it("walks c = -1 round and round between 0 and -1, never ending", () => {
    expect(mandelbrotKind.orbit!({ real: -1, imaginary: 0 }, 5)).toEqual([
      { real: 0, imaginary: 0 },
      { real: -1, imaginary: 0 },
      { real: 0, imaginary: 0 },
      { real: -1, imaginary: 0 },
      { real: 0, imaginary: 0 },
      { real: -1, imaginary: 0 },
    ]);
    expect(mandelbrotKind.escapeInfo!({ real: -1, imaginary: 0 }, CAP).escaped)
      .toBe(false);
  });

  it("is the shared z -> z^2 + c walk, which Julia starts from the other end", () => {
    const point = { real: -0.3, imaginary: 0.6 };

    expect(mandelbrotKind.orbit!(point, 12)).toEqual(
      escapeTimeOrbit(ORIGIN, point, 12),
    );
  });
});

describe("a Julia orbit", () => {
  it("starts at the pixel and adds the kind's constant", () => {
    // The Dendrite's c = i: from 3 the first step is 9 + i, already outside
    // the radius, so the path is the two points.
    const orbit = createJuliaKind({ real: 0, imaginary: 1 }).orbit!(
      { real: 3, imaginary: 0 },
      8,
    );

    expect(orbit).toEqual([
      { real: 3, imaginary: 0 },
      { real: 9, imaginary: 1 },
    ]);
  });

  it("shares the walker with the Mandelbrot kind, roles swapped", () => {
    const constant = { real: -0.8, imaginary: 0.156 };
    const point = { real: 0.25, imaginary: -0.4 };

    expect(createJuliaKind(constant).orbit!(point, 10)).toEqual(
      escapeTimeOrbit(point, constant, 10),
    );
  });
});

describe("the escape-time kinds' first step", () => {
  it("sends c = 2 to 2 and then out, each in its own arithmetic", () => {
    // The ship folds nothing at 0, the Tricorn conjugates nothing at 0, the
    // Celtic fold has nothing negative to flip, and z^3 of 2 is 8, so all four
    // reach 2 and then leave the radius: the Mandelbrot path is the same two
    // steps.
    const expected = [
      { real: 0, imaginary: 0 },
      { real: 2, imaginary: 0 },
    ];

    for (const kind of [burningShipKind, tricornKind, celticKind]) {
      expect(kind.orbit!({ real: 2, imaginary: 0 }, 4).slice(0, 2)).toEqual(
        expected,
      );
      expect(kind.orbit!({ real: 2, imaginary: 0 }, 4)).toHaveLength(3);
    }

    // z^3 + 2 leaves the radius from 10, one step further out than the others.
    expect(createMultibrotKind(3).orbit!({ real: 2, imaginary: 0 }, 4)).toEqual(
      [
        { real: 0, imaginary: 0 },
        { real: 2, imaginary: 0 },
        { real: 10, imaginary: 0 },
      ],
    );
  });
});

describe("a Newton orbit", () => {
  it("ends on the root it settles at, one step from -0.5", () => {
    const orbit = newtonKind.orbit!({ real: -0.5, imaginary: 0 }, 10);

    expect(orbit).toEqual([
      { real: -0.5, imaginary: 0 },
      { real: 1, imaginary: 0 },
    ]);
    expect(newtonKind.escapeInfo!({ real: -0.5, imaginary: 0 }, CAP)).toEqual({
      steps: 1,
      escaped: true,
      root: 0,
    });
  });

  it("is one point for a point already at a root", () => {
    NEWTON_ROOTS.forEach((root, index) => {
      expect(newtonKind.orbit!(root, 10)).toEqual([at(root)]);
      expect(newtonKind.escapeInfo!(root, CAP).root).toBe(index);
    });
  });

  it("ends within the tolerance of a cube root of 1", () => {
    const orbit = newtonKind.orbit!({ real: -0.2, imaginary: 0.9 }, 40);
    const last = orbit[orbit.length - 1];
    const cube = {
      real: last.real ** 3 - 3 * last.real * last.imaginary ** 2 - 1,
      imaginary: 3 * last.real ** 2 * last.imaginary - last.imaginary ** 3,
    };

    expect(Math.hypot(cube.real, cube.imaginary)).toBeLessThan(
      NEWTON_TOLERANCE,
    );
    // And it is one of the three roots, not merely near the set of them.
    const nearest = Math.min(
      ...NEWTON_ROOTS.map((root) =>
        Math.hypot(last.real - root.real, last.imaginary - root.imaginary),
      ),
    );
    expect(nearest).toBeLessThan(NEWTON_TOLERANCE);
  });

  it("gives up where the count does: z = 0 has no step", () => {
    expect(newtonKind.orbit!(ORIGIN, 40)).toEqual([ORIGIN]);
    expect(newtonKind.escapeInfo!(ORIGIN, CAP).escaped).toBe(false);
    // An iterate that stops being finite stops the walk at the point before it.
    const orbit = newtonKind.orbit!({ real: Infinity, imaginary: 0 }, 5);

    expect(orbit).toEqual([{ real: Infinity, imaginary: 0 }]);
  });
});

describe("every kind this app ships", () => {
  it("answers for itself rather than falling back to the point alone", () => {
    const kinds: FractalKind[] = [
      mandelbrotKind,
      createJuliaKind({ real: -0.8, imaginary: 0.156 }),
      burningShipKind,
      tricornKind,
      celticKind,
      ...MULTIBROT_POWERS.map(createMultibrotKind),
      newtonKind,
    ];

    for (const kind of kinds) {
      expect(typeof kind.orbit).toBe("function");
      expect(kind.orbit!({ real: -0.4, imaginary: 0.3 }, 6).length)
        .toBeGreaterThan(1);
    }
  });
});

describe("orbitFor", () => {
  it("asks the kind when it can answer", () => {
    const point = { real: 2, imaginary: 0 };

    expect(orbitFor(mandelbrotKind, point, 8)).toEqual(
      mandelbrotKind.orbit!(point, 8),
    );
  });

  it("answers the point alone for a kind that cannot", () => {
    // A kind from outside this app still probes: without an orbit there is no
    // path to walk, and one dot is honest where a made-up spiral is not.
    const bare: FractalKind = {
      id: "bare",
      iterations: (point, maxIterations) =>
        point.real > 0 ? 3 : maxIterations,
    };

    expect(orbitFor(bare, { real: 1, imaginary: 0 }, 8)).toEqual([
      { real: 1, imaginary: 0 },
    ]);
  });
});
