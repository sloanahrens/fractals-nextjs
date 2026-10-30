import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import { defaultViewFor } from "../fractalTypes";
import {
  MAGNET_BAILOUT,
  MAGNET_TOLERANCE,
  MAGNET_TYPES,
  MAGNET_TYPE_LABELS,
  createMagnetKind,
  parseMagnetType,
} from "../magnet";
import { calculateZoomBounds } from "../mandelbrot";
import { sweep } from "./sweep";

const CAP = 200;

/**
 * One step of a magnet map, the formulas written out as the Math card states
 * them. The suite's own copy, so the kind's orbit is checked against the rule
 * rather than against itself.
 */
function step(
  z: ComplexNumber,
  c: ComplexNumber,
  type: number,
): ComplexNumber | null {
  const product = {
    real: (c.real - 1) * (c.real - 2) - c.imaginary * c.imaginary,
    imaginary: (c.real - 1) * c.imaginary + c.imaginary * (c.real - 2),
  };

  let numerator: ComplexNumber;
  let denominator: ComplexNumber;

  if (type === 2) {
    const zSquared = {
      real: z.real * z.real - z.imaginary * z.imaginary,
      imaginary: 2 * z.real * z.imaginary,
    };
    const zCubed = {
      real: zSquared.real * z.real - zSquared.imaginary * z.imaginary,
      imaginary: zSquared.real * z.imaginary + zSquared.imaginary * z.real,
    };
    const threeC1z = {
      real: 3 * ((c.real - 1) * z.real - c.imaginary * z.imaginary),
      imaginary: 3 * ((c.real - 1) * z.imaginary + c.imaginary * z.real),
    };
    const threeC2z = {
      real: 3 * ((c.real - 2) * z.real - c.imaginary * z.imaginary),
      imaginary: 3 * ((c.real - 2) * z.imaginary + c.imaginary * z.real),
    };

    numerator = {
      real: zCubed.real + threeC1z.real + product.real,
      imaginary: zCubed.imaginary + threeC1z.imaginary + product.imaginary,
    };
    denominator = {
      real: 3 * zSquared.real + threeC2z.real + product.real + 1,
      imaginary:
        3 * zSquared.imaginary + threeC2z.imaginary + product.imaginary,
    };
  } else {
    numerator = {
      real: z.real * z.real - z.imaginary * z.imaginary + c.real - 1,
      imaginary: 2 * z.real * z.imaginary + c.imaginary,
    };
    denominator = {
      real: 2 * z.real + c.real - 2,
      imaginary: 2 * z.imaginary + c.imaginary,
    };
  }

  const magnitudeSquared =
    denominator.real * denominator.real +
    denominator.imaginary * denominator.imaginary;
  if (magnitudeSquared === 0) return null;

  const quotient = {
    real:
      (numerator.real * denominator.real +
        numerator.imaginary * denominator.imaginary) /
      magnitudeSquared,
    imaginary:
      (numerator.imaginary * denominator.real -
        numerator.real * denominator.imaginary) /
      magnitudeSquared,
  };

  return {
    real:
      quotient.real * quotient.real - quotient.imaginary * quotient.imaginary,
    imaginary: 2 * quotient.real * quotient.imaginary,
  };
}

/**
 * One point per fact the tests below need, worked out for each type.
 *
 * The two maps are different fractions, so a point that says something about
 * one usually says nothing about the other: c = 1.5 sends type I's orbit to 1
 * in one step (0.5 / -0.5, squared) and sends type II's to 1/9.
 */
interface TypeCase {
  type: number;
  /** Where the map's own denominator is zero at the orbit's start. */
  pole: ComplexNumber;
  /** A point whose first step lands exactly on the fixed point 1. */
  landsOnOne: ComplexNumber;
  /** A point whose first step is already past the bailout. */
  leavesAtOnce: ComplexNumber;
  /** A point that escapes a few whole steps in, with a fractional smooth count. */
  smoothEscape: ComplexNumber;
  /** A line the whole count steps along, well away from any pole of it. */
  line: { imaginary: number; from: number };
}

const CASES: readonly TypeCase[] = [
  {
    type: 1,
    // 2z + c - 2 is zero at z = 0 when c = 2.
    pole: { real: 2, imaginary: 0 },
    landsOnOne: { real: 1.5, imaginary: 0 },
    // The first step is (0.91 / -0.09)^2, about 102.2, past the bailout of 100.
    leavesAtOnce: { real: 1.91, imaginary: 0 },
    smoothEscape: { real: 1.38, imaginary: 1.63 },
    line: { imaginary: -0.1, from: 1.9 },
  },
  {
    type: 2,
    // (c - 1)(c - 2) = -1 at z = 0, which is c^2 - 3c + 3 = 0.
    pole: { real: 1.5, imaginary: Math.sqrt(3) / 2 },
    // (c - 1)(c - 2) = -1/2 makes the first fraction -1, squared to 1.
    landsOnOne: { real: 1.5, imaginary: 0.5 },
    // The first step is about 116.6 across, past the bailout of 100.
    leavesAtOnce: { real: 1.45, imaginary: 0.85 },
    smoothEscape: { real: 1.5, imaginary: -0.98 },
    line: { imaginary: -0.9, from: 1.4 },
  },
];

describe("parseMagnetType", () => {
  it("reads exactly the plain spellings of 1 and 2", () => {
    expect(parseMagnetType("1")).toBe(1);
    expect(parseMagnetType("2")).toBe(2);
  });

  it("refuses another spelling, another number and text", () => {
    for (const value of ["01", "1.0", " 1", "1 ", "0", "3", "I", "II", ""]) {
      expect(parseMagnetType(value), value).toBeNull();
    }
  });

  it("offers the two types with the names the app shows", () => {
    expect(MAGNET_TYPES).toEqual([1, 2]);
    expect(MAGNET_TYPES.map((type) => MAGNET_TYPE_LABELS[type])).toEqual([
      "Type I",
      "Type II",
    ]);
  });
});

describe("createMagnetKind", () => {
  it("names itself magnet", () => {
    expect(createMagnetKind(1).id).toBe("magnet");
    expect(createMagnetKind(2).id).toBe("magnet");
  });

  it("refuses a type outside the family rather than drawing something else", () => {
    for (const type of [0, 3, 1.5, Number.NaN]) {
      expect(() => createMagnetKind(type), String(type)).toThrow(RangeError);
    }
  });
});

describe.each(CASES)("magnet type $type", (typeCase) => {
  const { type, pole, landsOnOne, leavesAtOnce, smoothEscape, line } = typeCase;
  const kind = createMagnetKind(type);

  it("holds the origin, whose orbit neither settles on 1 nor leaves", () => {
    const origin = { real: 0, imaginary: 0 };

    expect(kind.iterations(origin, CAP, false)).toBe(CAP);
    expect(kind.iterations(origin, CAP, true)).toBe(CAP);
    expect(kind.escapeInfo!(origin, CAP)).toEqual({
      steps: CAP,
      escaped: false,
    });
  });

  it("counts a point whose orbit lands on the fixed point 1 as inside, the cap", () => {
    // The attractor is tested before the step is taken, so an orbit already at
    // 1 is inside without a step being counted -- the reading Newton's root
    // test has, and the reason 1 is the point the whole set is defined by.
    const first = step({ real: 0, imaginary: 0 }, landsOnOne, type);

    expect(Math.hypot(first!.real - 1, first!.imaginary)).toBeLessThan(
      MAGNET_TOLERANCE,
    );
    expect(kind.iterations(landsOnOne, CAP, false)).toBe(CAP);
    expect(kind.escapeInfo!(landsOnOne, CAP).escaped).toBe(false);
  });

  it("leaves on the first step where the denominator vanishes", () => {
    // The two maps' denominators are zero at a point of the plane, not at a
    // floating-point accident, and the step from one has no value: the orbit is
    // counted as gone on that step rather than dividing by zero and handing the
    // renderer a NaN.
    expect(kind.escapeInfo!(pole, CAP)).toEqual({ steps: 0, escaped: true });
    expect(Number.isFinite(kind.iterations(pole, CAP, true))).toBe(true);
  });

  it("counts the step that leaves as step 0 when the first step is out", () => {
    const orbit = kind.orbit!(leavesAtOnce, 20);

    expect(orbit).toHaveLength(2);
    expect(Math.hypot(orbit[1].real, orbit[1].imaginary)).toBeGreaterThan(
      MAGNET_BAILOUT,
    );
    expect(kind.iterations(leavesAtOnce, CAP, false)).toBe(0);
  });

  it("walks the orbit its own rule gives, step for step", () => {
    const c = { real: 1.8, imaginary: 0.4 };
    const orbit = kind.orbit!(c, 12);

    let point: ComplexNumber = { real: 0, imaginary: 0 };
    expect(orbit[0]).toEqual(point);
    for (let i = 1; i < orbit.length; i++) {
      point = step(point, c, type)!;
      expect(orbit[i]).toEqual(point);
    }
  });

  it("agrees with its own escapeInfo and orbit", () => {
    for (const c of [
      { real: 0, imaginary: 0 },
      landsOnOne,
      leavesAtOnce,
      smoothEscape,
      { real: -1.2, imaginary: 0.6 },
      { real: 1.8, imaginary: 0.4 },
      { real: 0.4, imaginary: 0.3 },
    ]) {
      const where = JSON.stringify(c);
      const count = kind.iterations(c, CAP, false);
      const info = kind.escapeInfo!(c, CAP);
      const orbit = kind.orbit!(c, CAP);

      expect(info, where).toEqual({ steps: count, escaped: count < CAP });
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(CAP);
      expect(orbit.length, where).toBeLessThanOrEqual(CAP + 1);

      if (info.escaped) {
        // The count is the index of the step that left, so the path is the
        // start, the steps before it, and the point that ended it.
        expect(orbit.length, where).toBe(info.steps + 2);
        const last = orbit[orbit.length - 1];
        expect(Math.hypot(last.real, last.imaginary), where).toBeGreaterThan(
          MAGNET_BAILOUT,
        );
      } else if (orbit.length < CAP + 1) {
        // A walk that stopped early stopped on the attractor.
        const last = orbit[orbit.length - 1];
        expect(Math.hypot(last.real - 1, last.imaginary), where).toBeLessThan(
          MAGNET_TOLERANCE,
        );
      }
    }
  });

  it("keeps the mirror symmetry about the real axis, exactly", () => {
    // Both rules are built from real coefficients in z and c, so conjugating a
    // step's inputs conjugates the step, and conjugating c conjugates the
    // whole orbit.
    for (const point of [
      { real: 1.8, imaginary: 0.4 },
      { real: 2.4, imaginary: -0.7 },
      { real: -1.3, imaginary: 0.2 },
      { real: 0.6, imaginary: 1.1 },
    ]) {
      const mirrored = { real: point.real, imaginary: -point.imaginary };

      expect(kind.iterations(mirrored, CAP, false), JSON.stringify(point)).toBe(
        kind.iterations(point, CAP, false),
      );
      expect(kind.iterations(mirrored, CAP, true), JSON.stringify(point)).toBe(
        kind.iterations(point, CAP, true),
      );
    }
  });

  it("gives a fractional count to a smooth read of an escaping point", () => {
    const whole = kind.iterations(smoothEscape, CAP, false);
    const smooth = kind.iterations(smoothEscape, CAP, true);

    expect(whole).toBeGreaterThan(0);
    expect(whole).toBeLessThan(CAP);
    expect(smooth).not.toBe(whole);
    expect(smooth).toBeGreaterThan(whole - 1);
    expect(smooth).toBeLessThan(whole + 1);
  });

  it("is continuous in the smooth count where the whole count steps", () => {
    // The bailout is a long way out (100 rather than 2), so the smoothing has
    // to carry the radius with it: the shared n + 1 - log2(log|z| / log R)
    // reads exactly as the other kinds' does when R = 2, and as a count a
    // shade under n + 1 when a point steps out just past 100. A formula that
    // left R out would move every count by log2(log2(100)), about 2.7 steps.
    const at = (real: number) => ({ real, imaginary: line.imaginary });
    let edge = line.from;
    let guard = 0;
    while (
      kind.iterations(at(edge), CAP, false) ===
      kind.iterations(at(edge + 0.0002), CAP, false)
    ) {
      edge += 0.0002;
      expect(guard++).toBeLessThan(4000);
    }

    let previous: { whole: number; smooth: number } | null = null;
    let largestSteadyJump = 0;
    let largestSeam = 0;
    let steps = 0;

    for (let offset = -120; offset <= 500; offset++) {
      const sample = {
        whole: kind.iterations(at(edge + offset * 1e-5), CAP, false),
        smooth: kind.iterations(at(edge + offset * 1e-5), CAP, true),
      };

      if (previous !== null && sample.whole < CAP && previous.whole < CAP) {
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

  it("keeps a finite count in range everywhere", () => {
    // 16,200 samples swept in one assertion (see sweep.ts): an expect per sample
    // costs more than the count does, and a sample that is not a finite number
    // fails whatever the bound says.
    function* samples() {
      for (let row = 0; row < 90; row++) {
        for (let column = 0; column < 90; column++) {
          const point = {
            real: -3 + (8 * column) / 89,
            imaginary: -3 + (8 * row) / 89,
          };

          for (const smooth of [false, true]) {
            yield {
              at: { point, smooth },
              value: kind.iterations(point, CAP, smooth),
            };
          }
        }
      }
    }

    // A point just off a pole steps out enormously, and the smooth count of an
    // enormous step is a little under zero; the other kinds' is too, and the
    // colour mapping reads a negative count as the start of the palette rather
    // than refusing it.
    const { offenders, checked } = sweep(
      samples(),
      (count) => count <= CAP && count > -8,
    );

    expect(checked).toBe(90 * 90 * 2);
    expect(offenders).toEqual([]);
  });

  it("runs the cap for a point that is not a number or is at infinity", () => {
    for (const point of [
      { real: Number.NaN, imaginary: 0 },
      { real: Infinity, imaginary: 0 },
      { real: 0, imaginary: Number.NaN },
    ]) {
      expect(kind.iterations(point, CAP, false)).toBe(CAP);
      expect(kind.escapeInfo!(point, CAP)).toEqual({
        steps: CAP,
        escaped: false,
      });
    }
  });

  it("stops at the cap for a point that has not ended by then", () => {
    const c = { real: 0.4, imaginary: 0.3 };

    expect(kind.iterations(c, 0, false)).toBe(0);
    expect(kind.iterations(c, CAP, false)).toBe(CAP);
    expect(kind.orbit!(c, 5)).toHaveLength(6);
    expect(kind.escapeInfo!(c, CAP)).toEqual({ steps: CAP, escaped: false });
  });
});

describe("a magnet orbit that starts at a pole", () => {
  it("is the one point it started at, since there is no next point to draw", () => {
    // c = 2 is Type I's pole at the orbit's own start. The count says the orbit
    // left on step 0, and the path stops there rather than drawing a point the
    // map never produced.
    const kind = createMagnetKind(1);
    const orbit = kind.orbit!({ real: 2, imaginary: 0 }, 20);

    expect(orbit).toEqual([{ real: 0, imaginary: 0 }]);
    expect(kind.iterations({ real: 2, imaginary: 0 }, CAP, false)).toBe(0);
  });
});

describe("the Magnet's default view", () => {
  it("is the widest view there is, centred on Type I's island", () => {
    expect(defaultViewFor("magnet")).toEqual({
      centerX: 1.3,
      centerY: 0,
      zoom: 1,
    });
  });

  it("holds Type I's island across, and shows both settled black and island", () => {
    const view = defaultViewFor("magnet");
    const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);
    const kind = createMagnetKind(1);

    // Type I's island spans x -0.46..3.07, measured on a 0.02 grid at a cap of
    // 150 and a 0.005 one at 300; Type II's x -0.20..2.30 is inside it too.
    expect(bounds.minReal).toBeLessThan(-0.46);
    expect(bounds.maxReal).toBeGreaterThan(3.07);

    let settled = 0;
    let escaped = 0;
    for (let column = 0; column < 60; column++) {
      for (let row = 0; row < 45; row++) {
        const point = {
          real:
            bounds.minReal + ((bounds.maxReal - bounds.minReal) * column) / 59,
          imaginary:
            bounds.minImaginary +
            ((bounds.maxImaginary - bounds.minImaginary) * row) / 44,
        };

        if (kind.iterations(point, CAP, false) === CAP) settled++;
        else escaped++;
      }
    }

    expect(escaped / (settled + escaped)).toBeGreaterThan(0.05);
    expect(escaped / (settled + escaped)).toBeLessThan(0.6);
  });
});
