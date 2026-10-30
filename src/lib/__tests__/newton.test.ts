import { describe, expect, it } from "vitest";

import type { ComplexNumber, FractalKind } from "../../types/fractal";
import { mapIterationsToColor } from "../colorMapping";
import { defaultViewFor } from "../fractalTypes";
import {
  NEWTON_BAND,
  NEWTON_BAND_MARGIN,
  NEWTON_HALF_SHADE_STEPS,
  NEWTON_POLYNOMIALS,
  NEWTON_ROOTS,
  NEWTON_TOLERANCE,
  createNewtonKind,
  newtonKind,
  newtonPolynomialFor,
  parseNewtonPolynomial,
} from "../newton";

const CAP = 300;
const THIRD = CAP * NEWTON_BAND;

const OMEGA = { real: -0.5, imaginary: Math.sqrt(3) / 2 };

function rotate(point: ComplexNumber, by: ComplexNumber): ComplexNumber {
  return {
    real: point.real * by.real - point.imaginary * by.imaginary,
    imaginary: point.real * by.imaginary + point.imaginary * by.real,
  };
}

/** The packed number turned back into its root and its (possibly fractional) steps. */
function unpack(value: number, cap = CAP) {
  const third = cap * NEWTON_BAND;
  const root = Math.floor(value / third);
  const inBand = value / third - root;
  const shade = (inBand - NEWTON_BAND_MARGIN) / (1 - 2 * NEWTON_BAND_MARGIN);

  return {
    root,
    steps: (shade * NEWTON_HALF_SHADE_STEPS) / (1 - shade),
  };
}

/**
 * Newton's method written the textbook way, z - (z^3 - 1) / (3 z^2) with a
 * complex division, as the oracle for the kind's rearranged step. Returns the
 * index of the root reached and the whole number of steps, or null.
 */
function reference(point: ComplexNumber, cap: number) {
  let { real, imaginary } = point;

  for (let steps = 0; steps < cap; steps++) {
    const squareReal = real * real - imaginary * imaginary;
    const squareImaginary = 2 * real * imaginary;
    const cubeReal = squareReal * real - squareImaginary * imaginary;
    const cubeImaginary = squareReal * imaginary + squareImaginary * real;

    if (Math.hypot(cubeReal - 1, cubeImaginary) < NEWTON_TOLERANCE) {
      const distances = NEWTON_ROOTS.map((root) =>
        Math.hypot(real - root.real, imaginary - root.imaginary),
      );
      return { root: distances.indexOf(Math.min(...distances)), steps };
    }

    // (z^3 - 1) / (3 z^2), by multiplying through by the conjugate of 3 z^2.
    const denominatorReal = 3 * squareReal;
    const denominatorImaginary = 3 * squareImaginary;
    const magnitude =
      denominatorReal * denominatorReal +
      denominatorImaginary * denominatorImaginary;
    if (magnitude === 0) return null;

    const quotientReal =
      ((cubeReal - 1) * denominatorReal +
        cubeImaginary * denominatorImaginary) /
      magnitude;
    const quotientImaginary =
      (cubeImaginary * denominatorReal -
        (cubeReal - 1) * denominatorImaginary) /
      magnitude;
    real -= quotientReal;
    imaginary -= quotientImaginary;
  }

  return null;
}

/** A grid over the default view, off the points where a rotation could land on a boundary by rounding. */
function grid(columns: number, rows: number): ComplexNumber[] {
  const points: ComplexNumber[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      points.push({
        real: -2 + (4 * (column + 0.37)) / columns,
        imaginary: -1.5 + (3 * (row + 0.61)) / rows,
      });
    }
  }

  return points;
}

describe("newtonKind", () => {
  it("is the kind with id newton", () => {
    expect(newtonKind.id).toBe("newton");
  });

  it("gives each root a third of the colour range", () => {
    expect(NEWTON_BAND).toBeCloseTo(1 / 3, 12);
  });
});

describe("the three bands", () => {
  it("put a point at each root in that root's own third, at the band's near edge", () => {
    NEWTON_ROOTS.forEach((root, index) => {
      const value = newtonKind.iterations(root, CAP, false);

      expect(Math.floor(value / THIRD), `root ${index}`).toBe(index);
      // Zero steps: the shade is 0, so the point sits the margin in.
      expect(value, `root ${index}`).toBeCloseTo(
        (index + NEWTON_BAND_MARGIN) * THIRD,
        9,
      );
    });
  });

  it("put every point near a root in that root's band, for the whole and the smooth count", () => {
    NEWTON_ROOTS.forEach((root, index) => {
      for (const [dx, dy] of [
        [0.05, 0],
        [-0.05, 0.03],
        [0, -0.08],
        [0.1, 0.1],
        [-0.12, -0.02],
      ]) {
        const point = { real: root.real + dx, imaginary: root.imaginary + dy };
        for (const smooth of [false, true]) {
          const value = newtonKind.iterations(point, CAP, smooth);

          expect(unpack(value).root, `root ${index} ${dx},${dy}`).toBe(index);
        }
      }
    });
  });

  it("are disjoint: every settled point lands strictly inside one third, clear of its edges", () => {
    // The bands do not overlap and keep a gap between them, so the slowest
    // shade of one root is never the fastest shade of the next.
    const nearEdge = NEWTON_BAND_MARGIN * THIRD;
    const offenders: string[] = [];
    let settled = 0;

    for (const point of grid(60, 45)) {
      for (const smooth of [false, true]) {
        const value = newtonKind.iterations(point, CAP, smooth);
        if (value >= CAP) continue;

        settled++;
        const root = Math.floor(value / THIRD);
        if (
          root < 0 ||
          root > 2 ||
          value - root * THIRD < nearEdge - 1e-9 ||
          !((root + 1) * THIRD - value > nearEdge - 1e-9)
        ) {
          if (offenders.length < 5) {
            offenders.push(
              `${JSON.stringify(point)} smooth=${smooth} gave ${value}`,
            );
          }
        }
      }
    }

    // One assertion over the whole grid, the first offenders named; a grid that
    // settled nothing would prove nothing.
    expect(settled).toBeGreaterThan(1000);
    expect(offenders).toEqual([]);
  });

  it("agree with textbook Newton about which root every point reaches", () => {
    for (const point of grid(60, 45)) {
      const expected = reference(point, CAP);
      const value = newtonKind.iterations(point, CAP, false);

      if (expected === null) {
        expect(value).toBe(CAP);
        continue;
      }
      expect(unpack(value).root).toBe(expected.root);
      expect(unpack(value).steps).toBeCloseTo(expected.steps, 6);
    }
  });

  it("use all three bands over the default view, each a real share of the picture", () => {
    const points = grid(80, 60);
    const share = [0, 0, 0];
    for (const point of points) {
      const value = newtonKind.iterations(point, CAP, false);
      if (value < CAP) share[Math.floor(value / THIRD)] += 1 / points.length;
    }

    for (const part of share) expect(part).toBeGreaterThan(0.25);
  });
});

describe("a known point", () => {
  it("2 reaches the root 1 in five steps, as worked by hand on the real axis", () => {
    // On the real axis the step is x -> x - (x^3 - 1) / (3 x^2). From 2:
    //   x1 = 17/12      = 1.41667, |x1^3 - 1| = 1.84
    //   x2 = 1.11051,   residual 0.37
    //   x3 = 1.01064,   residual 0.032
    //   x4 = 1.00007,   residual 2.1e-4
    //   x5 = 1.0000000, residual 1.4e-8 < 1e-6
    // so the residual is first under the tolerance on the fifth step.
    let x = 2;
    const residuals: number[] = [];
    for (let step = 0; step < 6; step++) {
      residuals.push(Math.abs(x ** 3 - 1));
      x -= (x ** 3 - 1) / (3 * x ** 2);
    }

    expect(residuals[0]).toBe(7);
    expect(residuals[1]).toBeCloseTo(1.8434, 3);
    expect(residuals[2]).toBeCloseTo(0.3695, 3);
    expect(residuals[3]).toBeCloseTo(0.0324, 3);
    expect(residuals[4]).toBeGreaterThan(NEWTON_TOLERANCE);
    expect(residuals[5]).toBeLessThan(NEWTON_TOLERANCE);

    const { root, steps } = unpack(
      newtonKind.iterations({ real: 2, imaginary: 0 }, CAP, false),
    );
    expect(root).toBe(0);
    expect(steps).toBeCloseTo(5, 9);
  });

  it("-0.5 is sent to the root 1 by one step", () => {
    // (2(-0.5) + 1 / 0.25) / 3 = 1, and 1 is already there: one step.
    const { root, steps } = unpack(
      newtonKind.iterations({ real: -0.5, imaginary: 0 }, CAP, false),
    );

    expect(root).toBe(0);
    expect(steps).toBeCloseTo(1, 9);
  });

  it("a root takes no steps, and the whole count is its band's near edge", () => {
    for (const root of NEWTON_ROOTS) {
      expect(unpack(newtonKind.iterations(root, CAP, false)).steps).toBeCloseTo(
        0,
        9,
      );
    }
  });

  it("goes further along its band the longer it takes, for the whole count", () => {
    const fast = newtonKind.iterations(
      { real: 1.05, imaginary: 0 },
      CAP,
      false,
    );
    const slow = newtonKind.iterations({ real: 2, imaginary: 0 }, CAP, false);
    const slower = newtonKind.iterations({ real: 6, imaginary: 0 }, CAP, false);

    expect(fast).toBeLessThan(slow);
    expect(slow).toBeLessThan(slower);
    // All three are on the root 1, so all three are in the first third.
    expect(slower).toBeLessThan(THIRD);
  });
});

describe("points that never settle", () => {
  it("draws z = 0, where the step divides by zero, as the cap", () => {
    expect(newtonKind.iterations({ real: 0, imaginary: 0 }, CAP, false)).toBe(
      CAP,
    );
    expect(newtonKind.iterations({ real: 0, imaginary: 0 }, CAP, true)).toBe(
      CAP,
    );
  });

  it("returns a number in range, never NaN, for far, huge and non-finite points", () => {
    const strange = [
      { real: 1e10, imaginary: 1e10 },
      { real: -1e154, imaginary: 1e154 },
      { real: 1e200, imaginary: -1e200 },
      { real: 1.7e308, imaginary: 1.7e308 },
      { real: Infinity, imaginary: 0 },
      { real: 0, imaginary: -Infinity },
      { real: NaN, imaginary: 1 },
      { real: 1, imaginary: NaN },
      { real: 5e-324, imaginary: 0 },
      { real: 1e-200, imaginary: 1e-200 },
      { real: -Math.cbrt(0.5), imaginary: 0 },
    ];

    for (const point of strange) {
      for (const smooth of [false, true]) {
        const value = newtonKind.iterations(point, CAP, smooth);

        expect(Number.isNaN(value), JSON.stringify(point)).toBe(false);
        expect(Number.isFinite(value), JSON.stringify(point)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(CAP);
      }
    }
  });

  it("draws a point the cap is too low to settle as the cap", () => {
    // 2 needs five steps, so a cap of 5 allows steps 0 to 4 and never sees it.
    expect(newtonKind.iterations({ real: 2, imaginary: 0 }, 5, false)).toBe(5);
    expect(
      newtonKind.iterations({ real: 2, imaginary: 0 }, 6, false),
    ).toBeLessThan(6);
  });

  it("never returns the cap for a point that settles, so no settled point is drawn black", () => {
    for (const point of grid(50, 40)) {
      const value = newtonKind.iterations(point, CAP, false);
      if (reference(point, CAP) !== null) {
        expect(value).toBeLessThan(CAP);
        expect(mapIterationsToColor(value, CAP, "grayscale").r).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("is finite and in range at every point of the default view", () => {
    // 15,000 samples checked in one assertion (the first offenders are named):
    // an expect per sample costs more than the count does.
    const offenders: string[] = [];

    for (const point of grid(100, 75)) {
      for (const smooth of [false, true]) {
        const value = newtonKind.iterations(point, CAP, smooth);

        if (!Number.isFinite(value) || value < 0 || value > CAP) {
          if (offenders.length < 5) {
            offenders.push(
              `${JSON.stringify(point)} smooth=${smooth} gave ${value}`,
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("the whole and the smooth count", () => {
  it("keep the root and put the smooth count within a step below the whole one", () => {
    for (const point of grid(60, 45)) {
      const whole = newtonKind.iterations(point, CAP, false);
      if (whole >= CAP) continue;

      const smooth = newtonKind.iterations(point, CAP, true);
      const wholeSteps = unpack(whole);
      const smoothSteps = unpack(smooth);

      expect(smoothSteps.root).toBe(wholeSteps.root);
      expect(smoothSteps.steps).toBeLessThanOrEqual(wholeSteps.steps + 1e-9);
      expect(smoothSteps.steps).toBeGreaterThanOrEqual(
        wholeSteps.steps - 1 - 1e-9,
      );
    }
  });

  it("grade smoothly where the whole count steps: no jump of more than a step between neighbours inside one basin", () => {
    // Along a line inside the basin of the root 1, from 1.2 to 3 at y = 0.2,
    // the whole count jumps by one at each ring and the smooth count does not
    // jump past it.
    let previousWhole = null as number | null;
    let previousSmooth = null as number | null;
    let sawWholeJump = false;

    for (let i = 0; i <= 900; i++) {
      const point = { real: 1.2 + (1.8 * i) / 900, imaginary: 0.2 };
      const whole = unpack(newtonKind.iterations(point, CAP, false)).steps;
      const smooth = unpack(newtonKind.iterations(point, CAP, true)).steps;

      if (previousWhole !== null && previousSmooth !== null) {
        if (Math.abs(whole - previousWhole) >= 0.5) sawWholeJump = true;
        expect(Math.abs(smooth - previousSmooth)).toBeLessThan(0.25);
      }
      previousWhole = whole;
      previousSmooth = smooth;
    }

    expect(sawWholeJump).toBe(true);
  });

  it("settle in the same place whatever the cap, so a higher cap changes only the black dust", () => {
    for (const point of grid(30, 20)) {
      const low = newtonKind.iterations(point, 100, false);
      const high = newtonKind.iterations(point, 1000, false);

      if (low >= 100) continue;
      expect(high / 1000).toBeCloseTo(low / 100, 9);
    }
  });
});

describe("the symmetries", () => {
  it("turn a point by 120 degrees and its band moves on by one, with the same shading", () => {
    for (const point of grid(40, 30)) {
      const whole = newtonKind.iterations(point, CAP, false);
      if (whole >= CAP) continue;

      for (const smooth of [false, true]) {
        const here = unpack(newtonKind.iterations(point, CAP, smooth));
        const turned = unpack(
          newtonKind.iterations(rotate(point, OMEGA), CAP, smooth),
        );
        const twice = unpack(
          newtonKind.iterations(
            rotate(rotate(point, OMEGA), OMEGA),
            CAP,
            smooth,
          ),
        );

        expect(turned.root).toBe((here.root + 1) % 3);
        expect(twice.root).toBe((here.root + 2) % 3);
        // A turn is exact in the maths and off by a rounding in the float:
        // the whole count lands on the same integer, and the smooth one on the
        // same fraction to four places: its fraction is a logarithm of the
        // final residual, which carries the rounding of the orbit before it
        // (a difference of 2e-6 showed up on this grid).
        const digits = smooth ? 4 : 6;
        expect(turned.steps).toBeCloseTo(here.steps, digits);
        expect(twice.steps).toBeCloseTo(here.steps, digits);
      }
    }
  });

  it("swap the two complex roots under the mirror about the real axis and keep the shading", () => {
    for (const point of grid(40, 30)) {
      const whole = newtonKind.iterations(point, CAP, false);
      if (whole >= CAP) continue;

      const here = unpack(whole);
      const mirrored = unpack(
        newtonKind.iterations(
          { real: point.real, imaginary: -point.imaginary },
          CAP,
          false,
        ),
      );

      expect(mirrored.root).toBe([0, 2, 1][here.root]);
      expect(mirrored.steps).toBeCloseTo(here.steps, 6);
    }
  });
});

describe("the colour mapping's view of it", () => {
  it("shows three colour families, one per root, in every scheme", () => {
    // The first and last step of each band are far apart on a scheme only if
    // the bands are thirds of the range; what must hold for every scheme is
    // that the three roots' fastest points are three different colours.
    for (const scheme of [
      "classic",
      "fire",
      "ocean",
      "rainbow",
      "grayscale",
    ] as const) {
      const colours = NEWTON_ROOTS.map((root) => {
        const { r, g, b } = mapIterationsToColor(
          newtonKind.iterations(root, CAP, false),
          CAP,
          scheme,
        );
        return `${r},${g},${b}`;
      });

      expect(new Set(colours).size, scheme).toBe(3);
    }
  });

  it("shades inside a family: a faster point and a slower one of the same root differ in colour", () => {
    for (const scheme of ["fire", "rainbow", "grayscale"] as const) {
      const fast = mapIterationsToColor(
        newtonKind.iterations({ real: 1.02, imaginary: 0 }, CAP, true),
        CAP,
        scheme,
      );
      const slow = mapIterationsToColor(
        newtonKind.iterations({ real: 6, imaginary: 0 }, CAP, true),
        CAP,
        scheme,
      );

      expect(`${fast.r},${fast.g},${fast.b}`, scheme).not.toBe(
        `${slow.r},${slow.g},${slow.b}`,
      );
    }
  });
});

describe("the default view", () => {
  it("is centred on the junction of the three basins, at the widest zoom", () => {
    expect(defaultViewFor("newton")).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 1,
    });
  });

  it("holds the three roots, each at least 0.6 inside the frame", () => {
    // Zoom 1 spans x -2..2 and y -1.5..1.5.
    for (const root of NEWTON_ROOTS) {
      expect(2 - Math.abs(root.real)).toBeGreaterThan(0.6);
      expect(1.5 - Math.abs(root.imaginary)).toBeGreaterThan(0.6);
    }
  });

  it("gives each root between 25% and 45% of the frame", () => {
    const points = grid(80, 60);
    const share = [0, 0, 0];
    for (const point of points) {
      const value = newtonKind.iterations(point, CAP, false);
      if (value < CAP) share[Math.floor(value / THIRD)] += 1;
    }

    for (const count of share) {
      expect(count / points.length).toBeGreaterThan(0.25);
      expect(count / points.length).toBeLessThan(0.45);
    }
  });
});

/** The packed number turned back into its root and its steps, for one polynomial's own band. */
function unpackWith(value: number, rootCount: number, cap = CAP) {
  const band = cap / rootCount;
  const root = Math.floor(value / band);
  const inBand = value / band - root;
  const shade = (inBand - NEWTON_BAND_MARGIN) / (1 - 2 * NEWTON_BAND_MARGIN);

  return { root, steps: (shade * NEWTON_HALF_SHADE_STEPS) / (1 - shade) };
}

/** $\sqrt{2/3}$, the real point where z^3 - 2z + 2 has a vanishing derivative. */
const CYCLE_POLE = Math.sqrt(2 / 3);

describe("the polynomials the fractal offers", () => {
  it("offers z^3 - 1 first, then the fourth and fifth powers and the cyclic cubic", () => {
    expect(NEWTON_POLYNOMIALS.map((polynomial) => polynomial.id)).toEqual([
      "3",
      "4",
      "5",
      "cycle",
    ]);
    expect(NEWTON_POLYNOMIALS.map((polynomial) => polynomial.label)).toEqual([
      "z^3 - 1",
      "z^4 - 1",
      "z^5 - 1",
      "z^3 - 2z + 2",
    ]);
    expect(
      NEWTON_POLYNOMIALS.map((polynomial) => polynomial.roots.length),
    ).toEqual([3, 4, 5, 3]);
    // The first is the picture the app has always drawn, so it is the one a
    // value this build cannot read falls back to.
    expect(newtonPolynomialFor("Dendrite").id).toBe("3");
  });

  it("reads only the app's own spellings, and refuses the rest", () => {
    for (const id of ["3", "4", "5", "cycle"]) {
      expect(parseNewtonPolynomial(id), id).toBe(id);
      expect(createNewtonKind(id).id, id).toBe("newton");
    }

    for (const value of ["2", "6", "03", "3.0", " 4", "Cycle", "z^3 - 1", ""]) {
      expect(parseNewtonPolynomial(value), value).toBeNull();
      expect(newtonPolynomialFor(value).id, value).toBe("3");
    }

    expect(() => createNewtonKind("Cycle")).toThrow(RangeError);
    expect(() => createNewtonKind("")).toThrow(RangeError);
  });

  it("answers the same kind for the same polynomial, so a resolve is stable", () => {
    expect(createNewtonKind("4")).toBe(createNewtonKind("4"));
    expect(createNewtonKind("5")).toBe(createNewtonKind("5"));
    expect(createNewtonKind("cycle")).toBe(createNewtonKind("cycle"));
    // z^3 - 1 is the kind every Newton link with no polynomial names.
    expect(createNewtonKind("3")).toBe(newtonKind);
  });
});

interface PolynomialCase {
  id: string;
  kind: FractalKind;
  roots: readonly ComplexNumber[];
  /** A turn that sends each root to the next, or null for a polynomial that has none. */
  turn: ComplexNumber | null;
  /** Where the mirror about the real axis sends each root, by index. */
  mirrored: readonly number[];
}

const POLYNOMIAL_CASES: PolynomialCase[] = [
  {
    id: "4",
    kind: createNewtonKind("4"),
    roots: NEWTON_POLYNOMIALS[1].roots,
    // z^4 - 1's roots are the four points of the compass, so a quarter turn
    // sends each to the next.
    turn: { real: 0, imaginary: 1 },
    mirrored: [0, 3, 2, 1],
  },
  {
    id: "5",
    kind: createNewtonKind("5"),
    roots: NEWTON_POLYNOMIALS[2].roots,
    turn: {
      real: Math.cos((2 * Math.PI) / 5),
      imaginary: Math.sin((2 * Math.PI) / 5),
    },
    mirrored: [0, 4, 3, 2, 1],
  },
  {
    id: "cycle",
    kind: createNewtonKind("cycle"),
    roots: NEWTON_POLYNOMIALS[3].roots,
    // z^3 - 2z + 2 is not turned onto itself about the origin the way z^d - 1
    // is: its roots are one real point and a conjugate pair, so only the mirror
    // is a symmetry.
    turn: null,
    mirrored: [0, 2, 1],
  },
];

describe.each(POLYNOMIAL_CASES)("the $id polynomial", ({ kind, roots, turn, mirrored }) => {
  const rootCount = roots.length;
  const band = CAP / rootCount;
  const unpack = (value: number) => unpackWith(value, rootCount);

  it("reaches every root, each in its own band at the band's near edge", () => {
    roots.forEach((root, index) => {
      const value = kind.iterations(root, CAP, false);

      expect(Math.floor(value / band), `root ${index}`).toBe(index);
      expect(value, `root ${index}`).toBeCloseTo(
        (index + NEWTON_BAND_MARGIN) * band,
        9,
      );
    });
  });

  it("puts every point near a root in that root's band, whole and smooth", () => {
    roots.forEach((root, index) => {
      for (const [dx, dy] of [
        [0.05, 0],
        [-0.05, 0.03],
        [0, -0.08],
        [0.1, 0.1],
      ]) {
        const point = { real: root.real + dx, imaginary: root.imaginary + dy };
        for (const smooth of [false, true]) {
          const value = kind.iterations(point, CAP, smooth);

          expect(unpack(value).root, `root ${index} ${dx},${dy}`).toBe(index);
        }
      }
    });
  });

  it("keeps the bands disjoint, each well inside its own share of the range", () => {
    const nearEdge = NEWTON_BAND_MARGIN * band;
    const offenders: string[] = [];
    let settled = 0;

    for (let row = 0; row < 45; row++) {
      for (let column = 0; column < 60; column++) {
        const point = {
          real: -2 + (4 * (column + 0.37)) / 60,
          imaginary: -1.5 + (3 * (row + 0.61)) / 45,
        };
        const value = kind.iterations(point, CAP, false);
        if (value >= CAP) continue;

        settled++;
        const root = Math.floor(value / band);
        if (
          root < 0 ||
          root >= rootCount ||
          value - root * band < nearEdge - 1e-9 ||
          !((root + 1) * band - value > nearEdge - 1e-9)
        ) {
          if (offenders.length < 5) {
            offenders.push(`${JSON.stringify(point)} gave ${value}`);
          }
        }
      }
    }

    expect(settled).toBeGreaterThan(500);
    expect(offenders).toEqual([]);
  });

  it("returns a number in range, never NaN, for far, huge and non-finite points", () => {
    const strange = [
      { real: 1e10, imaginary: 1e10 },
      { real: -1e154, imaginary: 1e154 },
      { real: 1.7e308, imaginary: 1.7e308 },
      { real: Infinity, imaginary: 0 },
      { real: NaN, imaginary: 1 },
      { real: 1, imaginary: NaN },
      { real: 5e-324, imaginary: 0 },
    ];

    for (const point of strange) {
      for (const smooth of [false, true]) {
        const value = kind.iterations(point, CAP, smooth);

        expect(Number.isNaN(value), JSON.stringify(point)).toBe(false);
        expect(Number.isFinite(value), JSON.stringify(point)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(CAP);
      }
    }
  });

  it("goes further along its band the longer it takes", () => {
    // Two points of the last root's basin, one much slower than the other: the
    // slower sits further along that band, and neither leaves it.
    const [near, far] = [
      { real: roots[0].real * 1.05, imaginary: roots[0].imaginary * 1.05 },
      { real: roots[0].real * 6, imaginary: roots[0].imaginary * 6 },
    ];
    const fast = kind.iterations(near, CAP, false);
    const slow = kind.iterations(far, CAP, false);

    if (fast < CAP && slow < CAP) {
      expect(unpack(fast).root).toBe(unpack(slow).root);
      expect(fast).toBeLessThan(slow);
    }
  });

  it("grades smoothly where the whole count steps, inside one basin", () => {
    // Along a line, the whole count jumps by one at each ring of a basin and
    // the smooth count does not jump past it. Only pairs inside one basin are
    // compared, since the shade restarts at each band's own edge.
    let previous: { whole: number; smooth: number; root: number } | null = null;
    let sawWholeJump = false;
    let compared = 0;

    for (let i = 0; i <= 900; i++) {
      const point = { real: 1.2 + (1.8 * i) / 900, imaginary: 0.2 };
      const whole = kind.iterations(point, CAP, false);
      if (whole >= CAP) {
        previous = null;
        continue;
      }
      const current = {
        whole: unpack(whole).steps,
        smooth: unpack(kind.iterations(point, CAP, true)).steps,
        root: unpack(whole).root,
      };

      if (previous !== null && previous.root === current.root) {
        compared += 1;
        if (Math.abs(current.whole - previous.whole) >= 0.5) sawWholeJump = true;
        expect(Math.abs(current.smooth - previous.smooth)).toBeLessThan(0.25);
      }
      previous = current;
    }

    expect(compared).toBeGreaterThan(50);
    expect(sawWholeJump).toBe(true);
  });

  if (turn) {
    it("turns a point about the origin and moves its band on by one, with the same shading", () => {
      for (let row = 0; row < 30; row++) {
        for (let column = 0; column < 40; column++) {
          const point = {
            real: -2 + (4 * (column + 0.37)) / 40,
            imaginary: -1.5 + (3 * (row + 0.61)) / 30,
          };
          const whole = kind.iterations(point, CAP, false);
          if (whole >= CAP) continue;

          for (const smooth of [false, true]) {
            const here = unpack(kind.iterations(point, CAP, smooth));
            let moved = point;
            for (let step = 1; step <= rootCount; step++) {
              moved = rotate(moved, turn);
              const there = unpack(kind.iterations(moved, CAP, smooth));

              expect(there.root).toBe((here.root + step) % rootCount);
              if (step < rootCount) {
                expect(there.steps).toBeCloseTo(here.steps, smooth ? 4 : 6);
              }
            }
          }
        }
      }
    });
  }

  it("keeps the shading under the mirror about the real axis, moving the bands it has to", () => {
    for (let row = 0; row < 30; row++) {
      for (let column = 0; column < 40; column++) {
        const point = {
          real: -2 + (4 * (column + 0.37)) / 40,
          imaginary: -1.5 + (3 * (row + 0.61)) / 30,
        };
        const whole = kind.iterations(point, CAP, false);
        if (whole >= CAP) continue;

        const here = unpack(whole);
        const there = unpack(
          kind.iterations(
            { real: point.real, imaginary: -point.imaginary },
            CAP,
            false,
          ),
        );

        expect(there.root).toBe(mirrored[here.root]);
        expect(there.steps).toBeCloseTo(here.steps, 6);
      }
    }
  });

  it("shows one colour family per root in every scheme", () => {
    for (const scheme of [
      "classic",
      "fire",
      "ocean",
      "rainbow",
      "grayscale",
    ] as const) {
      const colours = roots.map((root) => {
        const { r, g, b } = mapIterationsToColor(
          kind.iterations(root, CAP, false),
          CAP,
          scheme,
        );
        return `${r},${g},${b}`;
      });

      expect(new Set(colours).size, scheme).toBe(rootCount);
    }
  });
});

describe("the cyclic cubic, whose map has no root to settle on beside the origin", () => {
  const kind = createNewtonKind("cycle");

  it("draws 0 and 1, the two-step loop, as the cap", () => {
    // The map sends 0 to 1 and 1 back to 0 exactly, so neither ever reaches a
    // root however high the cap is.
    for (const point of [
      { real: 0, imaginary: 0 },
      { real: 1, imaginary: 0 },
    ]) {
      expect(kind.iterations(point, CAP, false), JSON.stringify(point)).toBe(
        CAP,
      );
      expect(kind.iterations(point, CAP, true), JSON.stringify(point)).toBe(
        CAP,
      );
      expect(kind.iterations(point, 2000, false)).toBe(2000);
    }
  });

  it("draws the points beside the loop as the cap too, since the loop draws them in", () => {
    for (const point of [
      { real: 0.01, imaginary: 0 },
      { real: -0.01, imaginary: 0.02 },
      { real: 0.99, imaginary: 0.01 },
      { real: 0, imaginary: 0.1 },
    ]) {
      expect(kind.iterations(point, CAP, false), JSON.stringify(point)).toBe(
        CAP,
      );
    }
  });

  it("leaves the loop for a point far enough out, which settles on a root", () => {
    // The loop's basin is bounded: points further from the origin than about
    // 1.2 settle, some of them slowly, which is what the black region's edge
    // is made of.
    for (const point of [
      { real: 0.5, imaginary: 0 },
      { real: 0.2, imaginary: 0 },
      { real: 0.95, imaginary: 0 },
    ]) {
      expect(kind.iterations(point, CAP, false), JSON.stringify(point)).toBeLessThan(
        CAP,
      );
    }
  });

  it("draws the two points where the derivative vanishes as the cap, having no step", () => {
    for (const real of [CYCLE_POLE, -CYCLE_POLE]) {
      const point = { real, imaginary: 0 };

      expect(kind.iterations(point, CAP, false), String(real)).toBe(CAP);
      // A step from the point beside them is enormous, and the orbit either
      // settles on a root or is drawn into the loop: either way a number in
      // range and never a NaN.
      const beside = kind.iterations(
        { real: real + 1e-9, imaginary: 0 },
        CAP,
        false,
      );
      expect(Number.isFinite(beside)).toBe(true);
    }
  });

  it("agrees with textbook Newton about which root every point reaches", () => {
    const roots = NEWTON_POLYNOMIALS[3].roots;

    for (let row = 0; row < 45; row++) {
      for (let column = 0; column < 60; column++) {
        const point = {
          real: -2 + (4 * (column + 0.37)) / 60,
          imaginary: -1.5 + (3 * (row + 0.61)) / 45,
        };
        const value = kind.iterations(point, CAP, false);
        const expected = cycleReference(point, CAP, roots);

        if (expected === null) {
          expect(value, JSON.stringify(point)).toBe(CAP);
          continue;
        }
        expect(value).toBeLessThan(CAP);
        expect(unpackWith(value, 3).root).toBe(expected.root);
        expect(unpackWith(value, 3).steps).toBeCloseTo(expected.steps, 6);
      }
    }
  });

  it("draws every point of the plane as something, never black dust that is not the loop", () => {
    let settled = 0;

    for (let row = 0; row < 40; row++) {
      for (let column = 0; column < 40; column++) {
        const value = kind.iterations(
          {
            real: -2 + (4 * (column + 0.5)) / 40,
            imaginary: -1.5 + (3 * (row + 0.5)) / 40,
          },
          CAP,
          false,
        );

        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(CAP);
        if (value < CAP) settled += 1;
      }
    }

    // Most of the plane's frame settles on a root; the loop's own basin is the
    // smaller, black part of it.
    expect(settled / 1600).toBeGreaterThan(0.5);
  });
});

/**
 * Newton's method for z^3 - 2z + 2 written the textbook way, z - p(z)/p'(z)
 * with a complex division, as the oracle for the kind's own step. Returns the
 * index of the root reached and the whole number of steps, or null.
 */
function cycleReference(
  point: ComplexNumber,
  cap: number,
  roots: readonly ComplexNumber[],
) {
  let { real, imaginary } = point;

  for (let steps = 0; steps < cap; steps++) {
    const squareReal = real * real - imaginary * imaginary;
    const squareImaginary = 2 * real * imaginary;
    const cubeReal = squareReal * real - squareImaginary * imaginary;
    const cubeImaginary = squareReal * imaginary + squareImaginary * real;

    // p(z) = z^3 - 2z + 2.
    const valueReal = cubeReal - 2 * real + 2;
    const valueImaginary = cubeImaginary - 2 * imaginary;

    if (Math.hypot(valueReal, valueImaginary) < NEWTON_TOLERANCE) {
      const distances = roots.map((root) =>
        Math.hypot(real - root.real, imaginary - root.imaginary),
      );
      return { root: distances.indexOf(Math.min(...distances)), steps };
    }

    // p'(z) = 3z^2 - 2.
    const slopeReal = 3 * squareReal - 2;
    const slopeImaginary = 3 * squareImaginary;
    const magnitude = slopeReal * slopeReal + slopeImaginary * slopeImaginary;
    if (magnitude === 0) return null;

    real -=
      (valueReal * slopeReal + valueImaginary * slopeImaginary) / magnitude;
    imaginary -=
      (valueImaginary * slopeReal - valueReal * slopeImaginary) / magnitude;
  }

  return null;
}
