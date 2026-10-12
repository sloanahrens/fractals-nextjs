/**
 * The orbit-trap geometry and the distance-to-palette curve
 * (`src/lib/orbitTrap.ts`).
 *
 * Each shape's distance is worked out by hand at points on the shape, far from
 * it and in symmetric pairs; the curve is held monotonic, bounded and free of
 * the iteration cap; and a kind that lands on nothing measurable, or on points
 * that are not numbers, is held to the guards.
 */
import { describe, expect, it } from "vitest";

import type { ComplexNumber, FractalKind } from "../../types/fractal";
import {
  TRAP_CIRCLE_CENTRE,
  TRAP_CIRCLE_RADIUS,
  TRAP_K,
  TRAP_LINE_REAL,
  TRAP_POINT,
  TRAP_POSITION_MAX,
  TRAP_POSITION_MIN,
  TRAP_SHAPES,
  trapDistanceFor,
  trapDistanceOf,
  trapKey,
  trapKeyToDistance,
  trapPosition,
} from "../orbitTrap";

describe("the traps' placement", () => {
  it("is the one the design note chose", () => {
    expect(TRAP_SHAPES).toEqual(["point", "line", "circle"]);
    expect(TRAP_POINT).toEqual({ real: -0.5, imaginary: 0 });
    expect(TRAP_LINE_REAL).toBe(0);
    expect(TRAP_CIRCLE_CENTRE).toEqual({ real: 0, imaginary: 0 });
    expect(TRAP_CIRCLE_RADIUS).toBe(0.5);
    expect(TRAP_K).toBe(0.5);
  });
});

describe("trapDistanceOf", () => {
  describe("point", () => {
    it("is 0 on the point", () => {
      expect(trapDistanceOf("point", -0.5, 0)).toBe(0);
    });

    it("is the Euclidean distance: a 3-4-5 away", () => {
      // (-0.5 + 3, 0 + 4) is 3 across and 4 up from the point.
      expect(trapDistanceOf("point", 2.5, 4)).toBe(5);
    });

    it("is the same either side of the point (symmetric pairs)", () => {
      expect(trapDistanceOf("point", 0.5, 2)).toBe(
        trapDistanceOf("point", -1.5, -2),
      );
      expect(trapDistanceOf("point", -0.5, 1)).toBe(
        trapDistanceOf("point", -0.5, -1),
      );
    });

    it("grows without bound far away", () => {
      expect(trapDistanceOf("point", 1e6, 0)).toBeCloseTo(1e6 + 0.5, 6);
    });
  });

  describe("line", () => {
    it("is 0 anywhere on the imaginary axis", () => {
      expect(trapDistanceOf("line", 0, 0)).toBe(0);
      expect(trapDistanceOf("line", 0, 123.4)).toBe(0);
      expect(trapDistanceOf("line", 0, -1e9)).toBe(0);
    });

    it("is |Re z| and ignores the imaginary part", () => {
      expect(trapDistanceOf("line", 0.75, 9)).toBe(0.75);
      expect(trapDistanceOf("line", 0.75, -9)).toBe(0.75);
    });

    it("is the same either side of the axis (a mirror pair)", () => {
      expect(trapDistanceOf("line", -1.25, 2)).toBe(
        trapDistanceOf("line", 1.25, 2),
      );
    });
  });

  describe("circle", () => {
    it("is 0 on the circle, wherever on it", () => {
      expect(trapDistanceOf("circle", 0.5, 0)).toBe(0);
      expect(trapDistanceOf("circle", -0.5, 0)).toBe(0);
      expect(trapDistanceOf("circle", 0, 0.5)).toBe(0);
      expect(trapDistanceOf("circle", 0.3, 0.4)).toBeCloseTo(0, 15);
    });

    it("is how far outside the radius a point is", () => {
      // |z| = 2 against a radius of 0.5.
      expect(trapDistanceOf("circle", 2, 0)).toBe(1.5);
      expect(trapDistanceOf("circle", 0, -2)).toBe(1.5);
    });

    it("is how far inside it a point is, not a signed number", () => {
      expect(trapDistanceOf("circle", 0.25, 0)).toBe(0.25);
      // The centre is the furthest inside: the whole radius.
      expect(trapDistanceOf("circle", 0, 0)).toBe(0.5);
    });

    it("is the same at points a turn apart (a symmetric pair)", () => {
      expect(trapDistanceOf("circle", 0.6, 0.8)).toBeCloseTo(
        trapDistanceOf("circle", -0.8, 0.6),
        15,
      );
    });
  });

  it("is NaN for a part that is not a number, for every shape", () => {
    for (const shape of TRAP_SHAPES) {
      expect(trapDistanceOf(shape, Number.NaN, 0)).toBeNaN();
    }
    // The line is |Re z| and never reads the imaginary part.
    expect(trapDistanceOf("point", 0.3, Number.NaN)).toBeNaN();
    expect(trapDistanceOf("circle", 0.3, Number.NaN)).toBeNaN();
  });
});

describe("trapKey, the cheaper measure the loops keep the minimum of", () => {
  const POINTS: [number, number][] = [
    [0, 0],
    [-0.5, 0],
    [0.3, -0.4],
    [2, 1.5],
    [-1.7, 0.2],
    [0, 0.5],
  ];

  it.each(TRAP_SHAPES)(
    "%s: becomes the distance, and orders points as the distance does",
    (shape) => {
      for (const [x, y] of POINTS) {
        expect(trapKeyToDistance(shape, trapKey(shape, x, y))).toBeCloseTo(
          trapDistanceOf(shape, x, y),
          12,
        );
      }

      const byKey = [...POINTS].sort(
        (a, b) => trapKey(shape, ...a) - trapKey(shape, ...b),
      );
      const byDistance = [...POINTS].sort(
        (a, b) => trapDistanceOf(shape, ...a) - trapDistanceOf(shape, ...b),
      );
      expect(byKey).toEqual(byDistance);
    },
  );

  it("keeps Infinity as Infinity, which is what a loop that measured nothing holds", () => {
    for (const shape of TRAP_SHAPES) {
      expect(trapKeyToDistance(shape, Infinity)).toBe(Infinity);
    }
  });
});

describe("trapPosition, the distance to a place on the palette", () => {
  const DISTANCES = [0, 1e-9, 0.01, 0.1, 0.5, 1, 2, 10, 100, 1e6, 1e300];

  it("is increasing in the distance", () => {
    const positions = DISTANCES.map(trapPosition);
    for (let index = 1; index < positions.length; index++) {
      expect(positions[index]).toBeGreaterThanOrEqual(positions[index - 1]);
    }
    // Strictly, where the band does not clamp it.
    expect(trapPosition(0.1)).toBeLessThan(trapPosition(0.2));
    expect(trapPosition(1)).toBeLessThan(trapPosition(2));
  });

  it("is d / (d + K), so a distance of K is the middle", () => {
    expect(trapPosition(TRAP_K)).toBe(0.5);
    expect(trapPosition(1.5)).toBeCloseTo(1.5 / (1.5 + TRAP_K), 15);
  });

  it("stays inside the band that keeps rainbow's hue-360 end out of reach", () => {
    for (const distance of [...DISTANCES, 0, Infinity, Number.NaN]) {
      const position = trapPosition(distance);
      expect(position).toBeGreaterThanOrEqual(TRAP_POSITION_MIN);
      expect(position).toBeLessThanOrEqual(TRAP_POSITION_MAX);
    }
    // A distance of exactly 0 sits at the band's floor, not at 0.
    expect(trapPosition(0)).toBe(TRAP_POSITION_MIN);
    expect(1 - trapPosition(0)).toBeLessThan(1);
  });

  it("takes Nova's and Magnet's far orbits to just under the end with no overflow", () => {
    expect(trapPosition(100)).toBeLessThan(1);
    expect(trapPosition(1e6)).toBeLessThan(1);
    expect(trapPosition(1e308)).toBe(TRAP_POSITION_MAX);
  });

  it("puts a distance that is not a number at the far end of the palette", () => {
    // Nothing to measure: not black, not the first colour, the far end.
    expect(trapPosition(Infinity)).toBe(TRAP_POSITION_MAX);
    expect(trapPosition(Number.NaN)).toBe(TRAP_POSITION_MAX);
    expect(trapPosition(-Infinity)).toBe(TRAP_POSITION_MAX);
  });

  it("is a function of the distance alone, so no iteration cap can move it", () => {
    // `trapPosition` takes one argument; and the distance a kind reports for an
    // orbit that settles or flies off does not depend on the cap either, only
    // on the points visited (see trapDistance.test.ts).
    expect(trapPosition.length).toBe(1);
  });
});

describe("trapDistanceFor", () => {
  /** A kind whose orbit is fixed, with no trapDistance of its own. */
  function pathKind(path: ComplexNumber[]): FractalKind {
    return {
      id: "path",
      iterations: () => 0,
      orbit: (_point, maxSteps) => path.slice(0, maxSteps + 1),
    };
  }

  it("does not count the point the orbit starts from", () => {
    // The start is on the point trap; the first step is 3 away.
    const kind = pathKind([
      { real: -0.5, imaginary: 0 },
      { real: 2.5, imaginary: 4 },
    ]);

    expect(trapDistanceFor(kind, { real: 0, imaginary: 0 }, 10, "point")).toBe(
      5,
    );
  });

  it("is the closest of the points after the start", () => {
    const kind = pathKind([
      { real: 0, imaginary: 0 },
      { real: 3, imaginary: 0 },
      { real: 0.25, imaginary: 9 },
      { real: 1, imaginary: -9 },
    ]);

    expect(trapDistanceFor(kind, { real: 0, imaginary: 0 }, 10, "line")).toBe(
      0.25,
    );
  });

  it("stops at the cap it was given", () => {
    const kind = pathKind([
      { real: 0, imaginary: 0 },
      { real: 4, imaginary: 0 },
      { real: 2, imaginary: 0 },
      { real: 0.01, imaginary: 0 },
    ]);

    expect(trapDistanceFor(kind, { real: 0, imaginary: 0 }, 2, "line")).toBe(2);
    expect(trapDistanceFor(kind, { real: 0, imaginary: 0 }, 3, "line")).toBe(
      0.01,
    );
  });

  it("is Infinity when the orbit landed on nothing: a cap under 1, or no orbit method", () => {
    const kind = pathKind([
      { real: 0, imaginary: 0 },
      { real: 1, imaginary: 0 },
    ]);
    const bare: FractalKind = { id: "bare", iterations: () => 0 };

    expect(trapDistanceFor(kind, { real: 0, imaginary: 0 }, 0, "point")).toBe(
      Infinity,
    );
    expect(trapDistanceFor(bare, { real: 0, imaginary: 0 }, 50, "circle")).toBe(
      Infinity,
    );
  });

  it("skips points that are not numbers, and so never lets one win or poison a minimum", () => {
    const kind = pathKind([
      { real: 0, imaginary: 0 },
      { real: Number.NaN, imaginary: 0 },
      { real: 0.6, imaginary: 0 },
      { real: Infinity, imaginary: Infinity },
    ]);

    expect(trapDistanceFor(kind, { real: 0, imaginary: 0 }, 10, "line")).toBe(
      0.6,
    );
    // An orbit of nothing but such points has nothing to measure.
    const lost = pathKind([
      { real: 0, imaginary: 0 },
      { real: Number.NaN, imaginary: Number.NaN },
    ]);
    expect(trapDistanceFor(lost, { real: 0, imaginary: 0 }, 10, "circle")).toBe(
      Infinity,
    );
  });

  it("prefers the kind's own trapDistance when it has one", () => {
    const kind: FractalKind = {
      id: "own",
      iterations: () => 0,
      orbit: () => {
        throw new Error("the walk must not run");
      },
      trapDistance: (_point, cap, trap) => cap + (trap === "line" ? 0.5 : 0),
    };

    expect(trapDistanceFor(kind, { real: 0, imaginary: 0 }, 7, "line")).toBe(
      7.5,
    );
  });
});
