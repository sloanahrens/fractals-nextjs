import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import { defaultViewFor } from "../fractalTypes";
import { calculateZoomBounds } from "../mandelbrot";
import {
  MULTIBROT_POWERS,
  createMultibrotKind,
  parseMultibrotPower,
} from "../multibrot";

const CAP = 200;

/** Turn a point about the origin by `turns` steps of 2*pi/(power - 1). */
function rotate(point: ComplexNumber, power: number, turns: number) {
  const angle = (2 * Math.PI * turns) / (power - 1);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    real: point.real * cos - point.imaginary * sin,
    imaginary: point.real * sin + point.imaginary * cos,
  };
}

/**
 * Points that escape within a few dozen steps, reaching both sides of the
 * boundary: every count that is neither 0 nor close to the cap, so the
 * symmetry tests compare orbits that did something and did not have long
 * enough to amplify the rounding the turn adds to c.
 */
function escapingPoints(power: number): ComplexNumber[] {
  const kind = createMultibrotKind(power);
  const points: ComplexNumber[] = [];

  for (let column = 0; column < 40; column++) {
    for (let row = 0; row < 30; row++) {
      const point = {
        real: -1.5 + (3 * column) / 39,
        imaginary: -1.2 + (2.4 * row) / 29,
      };
      const count = kind.iterations(point, CAP, false);

      if (count >= 3 && count <= 25) points.push(point);
    }
  }

  return points;
}

describe("parseMultibrotPower", () => {
  it("reads the plain spelling of each offered power", () => {
    expect(parseMultibrotPower("3")).toBe(3);
    expect(parseMultibrotPower("4")).toBe(4);
    expect(parseMultibrotPower("5")).toBe(5);
  });

  it("refuses a power outside 3 to 5", () => {
    for (const value of ["0", "1", "2", "6", "10", "-3", "100"]) {
      expect(parseMultibrotPower(value), value).toBeNull();
    }
  });

  it("refuses a non-integer, another spelling of an integer, and text that is no number", () => {
    for (const value of [
      "3.5",
      "3.0",
      "4.",
      "03",
      "+4",
      " 4",
      "4 ",
      "3e0",
      "0x4",
      "",
      "abc",
      "Classic",
      "NaN",
      "Infinity",
      "custom:0,0",
    ]) {
      expect(parseMultibrotPower(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("agrees with the powers the kind is built for", () => {
    expect(MULTIBROT_POWERS).toEqual([3, 4, 5]);
    for (const power of MULTIBROT_POWERS) {
      expect(parseMultibrotPower(String(power))).toBe(power);
    }
  });
});

describe("createMultibrotKind", () => {
  it("names the kind multibrot, whatever the power", () => {
    for (const power of MULTIBROT_POWERS) {
      expect(createMultibrotKind(power).id).toBe("multibrot");
    }
  });

  it("refuses a power outside 3 to 5, and a power that is not a whole number", () => {
    for (const power of [0, 1, 2, 6, -3, 3.5, 4.0000001, NaN, Infinity]) {
      expect(() => createMultibrotKind(power), String(power)).toThrow(
        RangeError,
      );
    }
  });

  it.each(MULTIBROT_POWERS)(
    "holds the origin, which never leaves the set (power %i)",
    (power) => {
      const kind = createMultibrotKind(power);
      const origin = { real: 0, imaginary: 0 };

      expect(kind.iterations(origin, CAP, false)).toBe(CAP);
      expect(kind.iterations(origin, CAP, true)).toBe(CAP);
    },
  );

  it.each(MULTIBROT_POWERS)(
    "escapes c = 2 on the second step, which the loop counts as 1 (power %i)",
    (power) => {
      // z1 = 2 has |z|^2 = 4, which is not past 4, and z2 = 2^d + 2 is: one
      // step completed before the one that escaped, as for the Mandelbrot set.
      const kind = createMultibrotKind(power);
      const c = { real: 2, imaginary: 0 };

      expect(kind.iterations(c, CAP, false)).toBe(1);
    },
  );

  it("counts hand-worked orbits", () => {
    // c = 1 on the real axis: z = 1, 2, then 2^d + 1, which is past 4.
    for (const power of MULTIBROT_POWERS) {
      expect(
        createMultibrotKind(power).iterations(
          { real: 1, imaginary: 0 },
          CAP,
          false,
        ),
        String(power),
      ).toBe(2);
    }

    // c = i. Cubed: z = i, i^3 + i = 0, i, 0, ... a cycle, so it never leaves.
    // Fourth power: z = i, i^4 + i = 1 + i, (1 + i)^4 + i = -4 + i, whose |z|^2
    // is 17. Fifth: z = i, i^5 + i = 2i (|z|^2 = 4, not past it), (2i)^5 + i =
    // 33i. Both leave on the third step, which the loop counts as 2.
    const i = { real: 0, imaginary: 1 };

    expect(createMultibrotKind(3).iterations(i, CAP, false)).toBe(CAP);
    expect(createMultibrotKind(4).iterations(i, CAP, false)).toBe(2);
    expect(createMultibrotKind(5).iterations(i, CAP, false)).toBe(2);
  });

  describe("turned by 2*pi/(d - 1) about the origin", () => {
    // (w z)^d = w^d z^d = w z^d when w^(d-1) = 1, so the orbit of w c is the
    // orbit of c turned by w, step for step, and the counts agree up to the
    // rounding the turn adds to c. The set has d - 1 turns: two lobes for z^3
    // (a half turn), three for z^4, four for z^5.
    it.each(MULTIBROT_POWERS)(
      "counts the same for a point and each of its turns, smooth and whole (power %i)",
      (power) => {
        const kind = createMultibrotKind(power);
        const points = escapingPoints(power);

        // The sample has to be big enough to mean something.
        expect(points.length).toBeGreaterThan(50);

        for (const point of points) {
          for (let turns = 1; turns < power - 1; turns++) {
            const turned = rotate(point, power, turns);

            expect(kind.iterations(turned, CAP, false)).toBe(
              kind.iterations(point, CAP, false),
            );
            expect(kind.iterations(turned, CAP, true)).toBeCloseTo(
              kind.iterations(point, CAP, true),
              6,
            );
          }
        }
      },
    );

    it.each(MULTIBROT_POWERS)(
      "holds a point of the set to the set when it is turned (power %i)",
      (power) => {
        const kind = createMultibrotKind(power);
        // Inside every one of the three sets: well within the central lobes.
        const inside = { real: 0.1, imaginary: 0.2 };

        expect(kind.iterations(inside, CAP, false)).toBe(CAP);
        for (let turns = 1; turns < power - 1; turns++) {
          expect(
            kind.iterations(rotate(inside, power, turns), CAP, false),
          ).toBe(CAP);
        }
      },
    );

    it.each(MULTIBROT_POWERS)(
      "is not a symmetry at any other angle, so the turn above says something (power %i)",
      (power) => {
        // A formula with the wrong power would be symmetric under another
        // angle instead. A quarter of the true step changes the count of some
        // points: a symmetry would leave every one of them as it was.
        const kind = createMultibrotKind(power);
        const differing = escapingPoints(power).filter(
          (point) =>
            kind.iterations(rotate(point, power, 0.25), CAP, false) !==
            kind.iterations(point, CAP, false),
        );

        expect(differing.length).toBeGreaterThan(0);
      },
    );
  });

  it.each(MULTIBROT_POWERS)(
    "keeps the mirror symmetry about the real axis, exactly (power %i)",
    (power) => {
      // conj(z_n(c)) is z_n(conj c) step for step, and conjugating changes no
      // float, only a sign.
      const kind = createMultibrotKind(power);

      for (const point of escapingPoints(power).slice(0, 60)) {
        const mirrored = { real: point.real, imaginary: -point.imaginary };

        expect(kind.iterations(mirrored, CAP, false)).toBe(
          kind.iterations(point, CAP, false),
        );
        expect(kind.iterations(mirrored, CAP, true)).toBe(
          kind.iterations(point, CAP, true),
        );
      }
    },
  );

  it("changes the picture with the power", () => {
    // Three kinds of the same family that counted alike everywhere would be
    // one kind: c = 0.7 + 0.3i is bounded for z^4 and gone in 3 steps for z^3.
    const c = { real: 0.7, imaginary: 0.3 };

    expect(createMultibrotKind(3).iterations(c, CAP, false)).toBe(3);
    expect(createMultibrotKind(4).iterations(c, CAP, false)).toBe(CAP);
  });

  describe("smooth count", () => {
    it("uses log base d, not log base 2, in the fraction", () => {
      // c = i: for z^4 the orbit leaves at |z| = sqrt(17) after 2 whole steps,
      // for z^5 at |z| = 33. n + 1 - log(log|z| / log 2) / log(d):
      expect(
        createMultibrotKind(4).iterations({ real: 0, imaginary: 1 }, CAP, true),
      ).toBeCloseTo(2.4843971924, 8);
      expect(
        createMultibrotKind(5).iterations({ real: 0, imaginary: 1 }, CAP, true),
      ).toBeCloseTo(1.9945076235, 8);
    });

    it.each(MULTIBROT_POWERS)(
      "stays within a step of the whole count of an escaping point (power %i)",
      (power) => {
        const kind = createMultibrotKind(power);

        for (const point of escapingPoints(power).slice(0, 80)) {
          const whole = kind.iterations(point, CAP, false);
          const smooth = kind.iterations(point, CAP, true);

          expect(Number.isFinite(smooth)).toBe(true);
          expect(smooth).toBeGreaterThan(whole - 1);
          expect(smooth).toBeLessThan(whole + 1);
        }
      },
    );

    it("is the whole count's fraction filled in: not an integer for an ordinary escape", () => {
      const point = { real: 0.3, imaginary: 1 };
      const smooth = createMultibrotKind(3).iterations(point, CAP, true);

      expect(createMultibrotKind(3).iterations(point, CAP, false)).toBe(6);
      expect(Number.isInteger(smooth)).toBe(false);
    });
  });

  it.each(MULTIBROT_POWERS)(
    "stops at the cap for a point that has not escaped by then (power %i)",
    (power) => {
      const kind = createMultibrotKind(power);
      const c = escapingPoints(power).find(
        (point) => kind.iterations(point, CAP, false) > 8,
      );

      expect(c).toBeDefined();
      const escapes = kind.iterations(c!, CAP, false);

      expect(escapes).toBeLessThan(CAP);
      expect(kind.iterations(c!, 5, false)).toBe(5);
      expect(kind.iterations(c!, 5, true)).toBe(5);
      expect(kind.iterations(c!, escapes + 1, false)).toBe(escapes);
      expect(kind.iterations(c!, 0, false)).toBe(0);
    },
  );

  it("holds each power's whole set inside the default view, with the frame's edge clear of it", () => {
    // The set is connected and holds the origin, so a frame whose whole border
    // escapes holds all of it.
    const view = defaultViewFor("multibrot");
    const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);

    for (const power of MULTIBROT_POWERS) {
      const kind = createMultibrotKind(power);
      const steps = 200;

      expect(
        kind.iterations(
          { real: view.centerX, imaginary: view.centerY },
          CAP,
          false,
        ),
        String(power),
      ).toBe(CAP);

      for (let step = 0; step <= steps; step++) {
        const along = step / steps;
        const real = bounds.minReal + (bounds.maxReal - bounds.minReal) * along;
        const imaginary =
          bounds.minImaginary +
          (bounds.maxImaginary - bounds.minImaginary) * along;

        for (const edge of [
          { real, imaginary: bounds.minImaginary },
          { real, imaginary: bounds.maxImaginary },
          { real: bounds.minReal, imaginary },
          { real: bounds.maxReal, imaginary },
        ]) {
          expect(kind.iterations(edge, CAP, false), String(power)).toBeLessThan(
            CAP,
          );
        }
      }
    }
  });
});
