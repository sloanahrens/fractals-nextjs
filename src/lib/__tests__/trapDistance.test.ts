/**
 * `trapDistance`, every kind's answer to "how close did this orbit come to the
 * trap?" (`trapDistanceFor` in `src/lib/orbitTrap.ts`).
 *
 * The eight escape-time kinds ship a loop of their own, a fourth hand-written
 * copy of each kind's step beside `iterations`, `escapeInfo` and `orbit`. The
 * `orbit` walk is the oracle that holds the copies to one another: for every
 * kind and variant over a grid, the distance equals the least distance over the
 * walk's points from the second on, within 1e-9, which is the slack the cycle
 * check is allowed (it stops when the orbit has come back to within 1e-12 of a
 * point it saved). Newton, Nova and Magnet ship no method and are answered by
 * that walk itself, which ends where their own counts end.
 */
import { describe, expect, it } from "vitest";

import type { ComplexNumber, FractalKind } from "../../types/fractal";
import {
  FRACTAL_TYPES,
  defaultViewFor,
  fractalVariants,
  resolveFractalKind,
} from "../fractalTypes";
import { TRAP_SHAPES, trapDistanceFor, trapDistanceOf } from "../orbitTrap";
import { calculateZoomBounds, pixelToComplex } from "../mandelbrot";

const CAP = 200;
const TOLERANCE = 1e-9;

/** Every fractal in the picker with every variant it can be drawn with. */
const KINDS: [string, string, string, FractalKind][] = [
  ...FRACTAL_TYPES.flatMap((type): [string, string, string, FractalKind][] => {
    const options = fractalVariants(type.id)?.options.map((o) => o.value);

    return (options ?? [""]).map((variant) => [
      `${type.id} ${variant}`.trim(),
      type.id,
      variant,
      resolveFractalKind(type.id, variant),
    ]);
  }),
  [
    "julia custom",
    "julia",
    "custom:-0.8,0.156",
    resolveFractalKind("julia", "custom:-0.8,0.156"),
  ],
];

/** Kinds that end by settling and ship no method of their own. */
const WALKED = new Set(["newton", "nova", "magnet"]);

/** The least distance over the orbit's points from the second on. */
function walked(
  kind: FractalKind,
  point: ComplexNumber,
  cap: number,
  shape: (typeof TRAP_SHAPES)[number],
): number {
  const path = kind.orbit!(point, cap);
  let least = Infinity;

  for (let index = 1; index < path.length; index++) {
    const distance = trapDistanceOf(
      shape,
      path[index].real,
      path[index].imaginary,
    );
    if (distance < least) least = distance;
  }

  return least;
}

function expectAgree(actual: number, expected: number): void {
  if (expected === Infinity) {
    expect(actual).toBe(Infinity);
  } else {
    expect(Math.abs(actual - expected)).toBeLessThan(TOLERANCE);
  }
}

/** A 9x7 grid over the fractal's opening frame, corners included. */
function gridFor(fractalId: string): ComplexNumber[] {
  const view = defaultViewFor(fractalId);
  const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);
  const points: ComplexNumber[] = [];

  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 9; x++) {
      points.push(pixelToComplex(x, y, 8, 6, bounds));
    }
  }

  return points;
}

/**
 * Three points that exist for every kind: one in the heart of its opening view
 * and not a singular point of any map (the exact centre of Newton's is the
 * origin, which the map sends to infinity), a far one and one on the real axis.
 */
function samplePoints(fractalId: string): Record<string, ComplexNumber> {
  const view = defaultViewFor(fractalId);

  return {
    inside: { real: view.centerX + 0.013, imaginary: view.centerY + 0.007 },
    outside: { real: 1.9, imaginary: 1.4 },
    axis: { real: -0.3, imaginary: 0 },
  };
}

describe("trapDistance: the dedicated loops against the orbit walk", () => {
  it("covers every fractal in the picker, and every variant", () => {
    for (const type of FRACTAL_TYPES) {
      expect(KINDS.some(([, id]) => id === type.id)).toBe(true);
    }
  });

  it.each(KINDS)(
    "%s: equals the least distance over the walked orbit, for all three shapes",
    (_name, id, _variant, kind) => {
      for (const shape of TRAP_SHAPES) {
        for (const point of gridFor(id)) {
          expectAgree(
            trapDistanceFor(kind, point, CAP, shape),
            walked(kind, point, CAP, shape),
          );
        }
      }
    },
  );

  it.each(KINDS)(
    "%s: agrees at a deep cap, where the cycle check earns its keep",
    (_name, id, _variant, kind) => {
      const grid = gridFor(id).filter((_p, index) => index % 5 === 0);

      for (const shape of TRAP_SHAPES) {
        for (const point of grid) {
          expectAgree(
            trapDistanceFor(kind, point, 1000, shape),
            walked(kind, point, 1000, shape),
          );
        }
      }
    },
  );

  it.each(KINDS)(
    "%s: agrees at the caps that leave nothing, one step or a few",
    (_name, id, _variant, kind) => {
      const grid = gridFor(id).filter((_p, index) => index % 11 === 0);

      for (const cap of [0, 1, 2, 3, 7]) {
        for (const shape of TRAP_SHAPES) {
          for (const point of grid) {
            expectAgree(
              trapDistanceFor(kind, point, cap, shape),
              walked(kind, point, cap, shape),
            );
          }
        }
      }
    },
  );

  it.each(KINDS)(
    "%s: a point that is not a number, or is infinite, never throws and agrees",
    (_name, _id, _variant, kind) => {
      const odd: ComplexNumber[] = [
        { real: Number.NaN, imaginary: 0 },
        { real: 0, imaginary: Number.NaN },
        { real: Infinity, imaginary: 0 },
        { real: 0, imaginary: -Infinity },
        { real: Infinity, imaginary: Infinity },
      ];

      for (const shape of TRAP_SHAPES) {
        for (const point of odd) {
          const actual = trapDistanceFor(kind, point, 50, shape);
          expect(Number.isNaN(actual)).toBe(false);
          expectAgree(actual, walked(kind, point, 50, shape));
        }
      }
    },
  );

  it("ships a method for exactly the eight escape-time kinds", () => {
    for (const [name, id, , kind] of KINDS) {
      expect([name, typeof kind.trapDistance]).toEqual([
        name,
        WALKED.has(id) ? "undefined" : "function",
      ]);
    }
  });
});

describe("trapDistance for every kind in the picker", () => {
  it.each(KINDS)(
    "%s: is finite for an inside point, an outside point and a point on an axis",
    (_name, id, _variant, kind) => {
      const points = samplePoints(id);

      for (const shape of TRAP_SHAPES) {
        for (const [where, point] of Object.entries(points)) {
          const distance = trapDistanceFor(kind, point, CAP, shape);
          expect([where, shape, Number.isFinite(distance)]).toEqual([
            where,
            shape,
            true,
          ]);
          expect(distance).toBeGreaterThanOrEqual(0);
        }
      }
    },
  );
});

describe("trapDistance by hand", () => {
  const mandelbrot = resolveFractalKind("mandelbrot", "");

  it("c = 0 stays at 0, which the point and circle traps are 0.5 from and the line is on", () => {
    const origin = { real: 0, imaginary: 0 };

    expect(trapDistanceFor(mandelbrot, origin, CAP, "point")).toBe(0.5);
    expect(trapDistanceFor(mandelbrot, origin, CAP, "line")).toBe(0);
    expect(trapDistanceFor(mandelbrot, origin, CAP, "circle")).toBe(0.5);
  });

  it("c = -1 alternates -1 and 0 (period 2): the same at any cap from 2", () => {
    const c = { real: -1, imaginary: 0 };

    for (const cap of [2, 3, 10, 1000]) {
      expect(trapDistanceFor(mandelbrot, c, cap, "point")).toBe(0.5);
      expect(trapDistanceFor(mandelbrot, c, cap, "line")).toBe(0);
      expect(trapDistanceFor(mandelbrot, c, cap, "circle")).toBe(0.5);
    }
    // One step has only visited -1.
    expect(trapDistanceFor(mandelbrot, c, 1, "line")).toBe(1);
  });

  it("c = 2 leaves the radius on the first step, and that point is the only one measured", () => {
    const c = { real: 2, imaginary: 0 };

    // z1 = 2: 2.5 from the point, 2 from the line, 1.5 outside the circle.
    expect(trapDistanceFor(mandelbrot, c, CAP, "point")).toBe(2.5);
    expect(trapDistanceFor(mandelbrot, c, CAP, "line")).toBe(2);
    expect(trapDistanceFor(mandelbrot, c, CAP, "circle")).toBe(1.5);
  });

  it("does not stop at the cardioid shortcut: an interior point is measured, not the cap's answer", () => {
    const inside = { real: -0.1, imaginary: 0.1 };

    // The count answers the cap for it in closed form, with no orbit...
    expect(mandelbrot.iterations(inside, CAP, false)).toBe(CAP);
    // ...the trap needs the orbit, which is a real one.
    const distance = trapDistanceFor(mandelbrot, inside, CAP, "point");
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(1);
    expectAgree(distance, walked(mandelbrot, inside, CAP, "point"));
  });

  it("a Julia orbit starts at the pixel and the start is not measured", () => {
    const julia = resolveFractalKind("julia", "Classic");
    // The pixel sits exactly on the point trap; the orbit's first step moves off.
    const pixel = { real: -0.5, imaginary: 0 };

    expect(trapDistanceFor(julia, pixel, 1, "point")).toBeGreaterThan(0);
  });
});

describe("trapDistance stops on a cycle or a fixed point", () => {
  // A cap of a billion steps is minutes of work if the walk does not notice the
  // orbit has closed on itself, and nothing here asserts a time: a loop that
  // forgot the check would run past the test's timeout.
  const HUGE_CAP = 1e9;

  it("the Mandelbrot set's period 2 and period 3 orbits, and the same at a modest cap", () => {
    const mandelbrot = resolveFractalKind("mandelbrot", "");
    const period3 = { real: -0.12256117, imaginary: 0.74486177 };

    for (const c of [{ real: -1, imaginary: 0 }, period3]) {
      for (const shape of TRAP_SHAPES) {
        expectAgree(
          trapDistanceFor(mandelbrot, c, HUGE_CAP, shape),
          walked(mandelbrot, c, 3000, shape),
        );
      }
    }
  });

  // Points that never escape and settle onto a cycle or a fixed point, found by
  // scanning each kind's opening region for ones that run the cap.
  const SETTLING: [string, string, ComplexNumber][] = [
    ["phoenix", "Classic", { real: -0.48, imaginary: 0.82 }],
    ["phoenix", "Hourglass", { real: -0.56, imaginary: -0.72 }],
    ["julia", "Siegel disk", { real: -1.2, imaginary: -0.44 }],
    ["multibrot", "3", { real: -0.56, imaginary: -0.51 }],
    ["burning-ship", "", { real: -1.2, imaginary: -0.09 }],
    ["tricorn", "", { real: -1.2, imaginary: 0.05 }],
    ["celtic", "", { real: -1.2, imaginary: -0.09 }],
    ["perpendicular-ship", "", { real: -1.04, imaginary: -0.09 }],
    // Inside the central disc (|c| < 1) the orbit settles on the fixed point 0;
    // inside the next disc, on a cycle.
    ["sine", "", { real: 0.3, imaginary: 0.4 }],
    ["sine", "", { real: 1.6, imaginary: 0.1 }],
    // Inside the disc of the invariant radius the orbit settles on a fixed
    // point (about 0.351 + 0.362i here); inside the small disc out along the
    // axis it settles on a 4-cycle (about 1.578, -0.015, 1.883, -0.576).
    ["cosine", "", { real: 0.3, imaginary: 0.4 }],
    ["cosine", "", { real: 1.88, imaginary: 0.02 }],
  ];

  it.each(SETTLING)(
    "%s %s: a huge cap is as good as a modest one",
    (id, variant, point) => {
      const kind = resolveFractalKind(id, variant);
      // Check the point really does run the cap, or this proves nothing.
      expect(kind.escapeInfo!(point, 500).escaped).toBe(false);

      for (const shape of TRAP_SHAPES) {
        const huge = trapDistanceFor(kind, point, HUGE_CAP, shape);
        expect(Number.isFinite(huge)).toBe(true);
        expectAgree(huge, walked(kind, point, 5000, shape));
      }
    },
  );

  it("Phoenix compares the pair (z, the point before it), not z alone", () => {
    // z(n+1) depends on z(n-1), so z repeating once does not make the next step
    // repeat. The kind agrees with its own walk on a grid at a deep cap, which a
    // check on z alone would break wherever z revisits a value with a different
    // predecessor.
    const phoenix = resolveFractalKind("phoenix", "Spirals");

    for (const point of gridFor("phoenix")) {
      for (const shape of TRAP_SHAPES) {
        expectAgree(
          trapDistanceFor(phoenix, point, 1500, shape),
          walked(phoenix, point, 1500, shape),
        );
      }
    }
  });
});

describe("the kinds that settle are answered by their own walk", () => {
  const newton = resolveFractalKind("newton", "3");
  const nova = resolveFractalKind("nova", "");

  it("Newton's -0.5 reaches the root 1 in one step, and the root counts", () => {
    const point = { real: -0.5, imaginary: 0 };

    // The path is -0.5, 1. The start is not measured; the root is.
    expect(trapDistanceFor(newton, point, CAP, "point")).toBe(1.5);
    expect(trapDistanceFor(newton, point, CAP, "line")).toBe(1);
    expect(trapDistanceFor(newton, point, CAP, "circle")).toBe(0.5);
    // And it is the same at any cap from 1: the walk ended where Newton's count does.
    expect(trapDistanceFor(newton, point, 1, "point")).toBe(1.5);
    expect(trapDistanceFor(newton, point, 5000, "point")).toBe(1.5);
    expect(trapDistanceFor(newton, point, 0, "point")).toBe(Infinity);
  });

  it("Newton's origin has no step (the map sends 0 to infinity): nothing to measure", () => {
    const origin = { real: 0, imaginary: 0 };

    expect(trapDistanceFor(newton, origin, CAP, "point")).toBe(Infinity);
  });

  it("Nova's c = 0 settles on 1 with a first step of length 0, and the settled point counts", () => {
    const c = { real: 0, imaginary: 0 };

    expect(trapDistanceFor(nova, c, CAP, "point")).toBeCloseTo(1.5, 12);
    expect(trapDistanceFor(nova, c, CAP, "line")).toBeCloseTo(1, 12);
    expect(trapDistanceFor(nova, c, CAP, "circle")).toBeCloseTo(0.5, 12);
  });

  it.each([
    ["newton", "3"],
    ["newton", "4"],
    ["nova", ""],
    ["magnet", "1"],
    ["magnet", "2"],
  ])(
    "%s %s: a point whose orbit ended before the cap is not changed by a larger cap",
    (id, variant) => {
      const kind = resolveFractalKind(id, variant);
      let checked = 0;

      for (const point of gridFor(id)) {
        if (!kind.escapeInfo!(point, 100).escaped) continue;
        for (const shape of TRAP_SHAPES) {
          expect(trapDistanceFor(kind, point, 100, shape)).toBe(
            trapDistanceFor(kind, point, 5000, shape),
          );
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    },
  );
});
