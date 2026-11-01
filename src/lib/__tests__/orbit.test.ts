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
import {
  NEWTON_ROOTS,
  NEWTON_TOLERANCE,
  createNewtonKind,
  newtonKind,
} from "../newton";
import { celticKind } from "../celtic";
import { createMagnetKind } from "../magnet";
import { novaKind } from "../nova";
import { sineKind } from "../sine";
import { cosineKind } from "../cosine";
import { SINE_SQUARED_START, sineSquaredKind } from "../sineSquared";
import { sineZKind, sineZStart } from "../sineZ";
import { createPhoenixKind } from "../phoenix";
import { perpendicularShipKind } from "../perpendicularShip";
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
    name: "perpendicular-ship",
    kind: perpendicularShipKind,
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
    name: "magnet type 1",
    kind: createMagnetKind(1),
    starts: atOrigin,
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    // The first step of c = 1.91 is (0.91 / -0.09)^2, about 102.2, past the
    // bailout of 100, so the walk is the start and the point that left it.
    endsAt: { point: { real: 1.91, imaginary: 0 }, steps: 0 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "magnet type 2",
    kind: createMagnetKind(2),
    starts: atOrigin,
    // Type II's orbit of c = 0 is drawn into the fixed point 1 in about 35
    // steps, so it does not walk a 60-step window; -0.2 + 0.6i is a point
    // whose orbit does neither within the window.
    neverEnds: { real: -0.2, imaginary: 0.6 },
    neverEndsLength: (maxSteps) => maxSteps + 1,
    // Type II's bailout is the same 100, and its first step from 1.45 + 0.85i
    // is about 116.6 across.
    endsAt: { point: { real: 1.45, imaginary: 0.85 }, steps: 0 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "phoenix hourglass",
    kind: createPhoenixKind({ real: 0.5667, imaginary: -0.55 }),
    // A Phoenix orbit starts at the pixel, as Julia's does; z(-1) = 0 is the
    // memory's start and is not a point of the path.
    starts: atPoint,
    // 0.5i is inside the Hourglass set, so its orbit never leaves the radius.
    neverEnds: { real: 0, imaginary: 0.5 },
    neverEndsLength: (maxSteps) => maxSteps + 1,
    // From 1 the first step is 1.5667 and the second 2.5212 (the memory term
    // takes 0.55 off), which is outside the radius.
    endsAt: { point: { real: 1, imaginary: 0 }, steps: 1 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "sine",
    kind: sineKind,
    // Every Sine orbit starts at the critical point pi / 2, whatever c is.
    starts: () => ({ real: Math.PI / 2, imaginary: 0 }),
    // c = 0 sends every point to 0 and keeps it there.
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    // The first step lands on c, so a c more than 20 off the real axis leaves on
    // the first step: the start and that one point.
    endsAt: { point: { real: 0, imaginary: 21 }, steps: 0 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "cosine",
    kind: cosineKind,
    // Every Cosine orbit starts at the critical point 0, whatever c is.
    starts: atOrigin,
    // c = 0 sends every point to 0 and keeps it there.
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    // The first step lands on c, so a c more than 20 off the real axis leaves on
    // the first step: the start and that one point.
    endsAt: { point: { real: 0, imaginary: 21 }, steps: 0 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "sin-z-squared",
    kind: sineSquaredKind,
    // Every Sine of z squared orbit starts at sqrt(pi / 2), whatever c is.
    starts: () => ({ real: SINE_SQUARED_START, imaginary: 0 }),
    // c = 0 sends every point to 0 and keeps it there.
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    // The first step lands on c, so a c whose square has an imaginary part
    // above 20 (5 + 5i gives 50) leaves on the first step: the start and that
    // one point.
    endsAt: { point: { real: 5, imaginary: 5 }, steps: 0 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "sine-plus-z",
    kind: sineZKind,
    // Every orbit starts at its critical point, arccos(-1/c) on the principal
    // branch, which depends on c.
    starts: (point) => sineZStart(point),
    // A real c of modulus 1 or more keeps the orbit on the real axis for good.
    neverEnds: { real: 2, imaginary: 0 },
    neverEndsLength: (maxSteps) => maxSteps + 1,
    // 3 + 4i leaves on the second step, counted as step 1: the start, the
    // first step and the point that left.
    endsAt: { point: { real: 3, imaginary: 4 }, steps: 1 },
    endedLength: (steps) => steps + 2,
    escapes: true,
  },
  {
    name: "nova",
    kind: novaKind,
    // Every Nova orbit starts at z = 1, whatever the pixel is.
    starts: () => ({ real: 1, imaginary: 0 }),
    // c = -0.5 is inside the set: the orbit never settles.
    neverEnds: { real: -0.5, imaginary: 0 },
    neverEndsLength: (maxSteps) => maxSteps + 1,
    // c = -1.5 settles on -0.5 on the second step (z1 = -0.5, and N(-0.5) = 1
    // takes z2 back to -0.5). The path is the start and one point per step, as
    // Newton's is, and ends on the point that settled.
    endsAt: { point: { real: -1.5, imaginary: 0 }, steps: 2 },
    endedLength: (steps) => steps + 1,
    escapes: false,
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
  {
    name: "newton z^4 - 1",
    kind: createNewtonKind("4"),
    starts: atPoint,
    // The derivative 4z^3 vanishes at the origin, where there is no step.
    neverEnds: ORIGIN,
    neverEndsLength: () => 1,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 6 },
    endedLength: (steps) => steps + 1,
    escapes: false,
  },
  {
    name: "newton z^5 - 1",
    kind: createNewtonKind("5"),
    starts: atPoint,
    neverEnds: ORIGIN,
    neverEndsLength: () => 1,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 7 },
    endedLength: (steps) => steps + 1,
    escapes: false,
  },
  {
    name: "newton z^3 - 2z + 2",
    kind: createNewtonKind("cycle"),
    starts: atPoint,
    // The origin is on the map's two-step loop, 0 -> 1 -> 0, so the walk never
    // ends on its own: it is the one Newton polynomial whose path goes the
    // whole window, hopping between the two points.
    neverEnds: ORIGIN,
    neverEndsLength: (maxSteps) => maxSteps + 1,
    endsAt: { point: { real: 0.5, imaginary: 0 }, steps: 8 },
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
    // Celtic fold has nothing negative to flip, the Perpendicular Ship's fold
    // multiplies by y = 0, and z^3 of 2 is 8, so all four reach 2 and then
    // leave the radius: the Mandelbrot path is the same two steps.
    const expected = [
      { real: 0, imaginary: 0 },
      { real: 2, imaginary: 0 },
    ];

    for (const kind of [
      burningShipKind,
      tricornKind,
      celticKind,
      perpendicularShipKind,
    ]) {
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

describe("a magnet orbit", () => {
  it("is the one point it started at when the first step has no value", () => {
    // c = 2 is Type I's pole at the orbit's own start, where 2z + c - 2 is
    // zero: the walk stops on the point before the step it cannot take.
    expect(createMagnetKind(1).orbit!({ real: 2, imaginary: 0 }, 20)).toEqual([
      ORIGIN,
    ]);
  });

  it("ends on the fixed point 1 when the first step lands there", () => {
    // c = 1.5: the fraction is 0.5 / -0.5 = -1, squared to 1, and 1 is a fixed
    // point of the map, so the path is those two points and stops.
    expect(createMagnetKind(1).orbit!({ real: 1.5, imaginary: 0 }, 10)).toEqual(
      [
        { real: 0, imaginary: 0 },
        { real: 1, imaginary: 0 },
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
      perpendicularShipKind,
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
