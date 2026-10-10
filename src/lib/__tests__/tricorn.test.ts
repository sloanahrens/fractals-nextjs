import { describe, expect, it } from "vitest";

import { defaultViewFor } from "../fractalTypes";
import { calculateZoomBounds, mandelbrotKind } from "../mandelbrot";
import { tricornKind } from "../tricorn";

const CAP = 200;

/** Turn a point about the origin by 120 degrees, `turns` times. */
function rotate(point: { real: number; imaginary: number }, turns: number) {
  const angle = (2 * Math.PI * turns) / 3;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    real: point.real * cos - point.imaginary * sin,
    imaginary: point.real * sin + point.imaginary * cos,
  };
}

describe("tricornKind", () => {
  it("names itself tricorn", () => {
    expect(tricornKind.id).toBe("tricorn");
  });

  it("holds the origin, which never leaves the set", () => {
    const origin = { real: 0, imaginary: 0 };

    expect(tricornKind.iterations(origin, CAP, false)).toBe(CAP);
    expect(tricornKind.iterations(origin, CAP, true)).toBe(CAP);
  });

  it("escapes c = 2 on the second step, which the loop counts as 1", () => {
    // z1 = 2 has |z|^2 = 4, which is not past 4, and z2 = conj(2)^2 + 2 = 6 is:
    // one step completed before the one that escaped, the Mandelbrot count.
    const c = { real: 2, imaginary: 0 };

    expect(tricornKind.iterations(c, CAP, false)).toBe(1);
    expect(mandelbrotKind.iterations(c, CAP, false)).toBe(1);
  });

  it("counts what the Mandelbrot kind counts on the real axis", () => {
    // On the real axis the imaginary part is 0 and the conjugate of a real
    // number is itself, so the two loops take the same steps: the counts agree
    // exactly, smoothing included, which is what says this is the Mandelbrot
    // loop with the conjugate in front of the square.
    for (let step = -200; step <= 250; step++) {
      const c = { real: step / 100, imaginary: 0 };

      expect(tricornKind.iterations(c, CAP, false)).toBe(
        mandelbrotKind.iterations(c, CAP, false),
      );
      expect(tricornKind.iterations(c, CAP, true)).toBe(
        mandelbrotKind.iterations(c, CAP, true),
      );
    }
  });

  it("differs from the Mandelbrot kind where the conjugate matters", () => {
    // c = -0.5 + 0.6i is inside the Mandelbrot set. Worked by hand, the
    // Tricorn's orbit is z1 = c, z2 = (-0.5 - 0.6i)^2 + c = -0.61 + 1.2i and
    // z3 = (-0.61 - 1.2i)^2 + c = -1.568 + 2.064i, whose |z|^2 is past 4 on the
    // third step: two steps completed before the one that escaped.
    const c = { real: -0.5, imaginary: 0.6 };

    expect(mandelbrotKind.iterations(c, CAP, false)).toBe(CAP);
    expect(tricornKind.iterations(c, CAP, false)).toBe(2);
  });

  describe("turned by 120 degrees about the origin", () => {
    // conj(w z)^2 = w^-2 conj(z)^2 = w conj(z)^2 for a cube root of unity w, so
    // the orbit of w c is the orbit of c turned by w, step for step. The counts
    // then agree up to the rounding the turn itself adds to c.
    const POINTS = [
      { real: 0.5, imaginary: 0.5 },
      { real: -1.2, imaginary: 0.9 },
      { real: -0.4, imaginary: 1.1 },
      { real: 1.1, imaginary: 0.2 },
      { real: -1.9, imaginary: 0.4 },
      { real: 0.25, imaginary: 0.65 },
      { real: -0.9, imaginary: 0.15 },
    ];

    it("counts the same for a point and both its turns, smooth and whole", () => {
      for (const point of POINTS) {
        for (const turns of [1, 2]) {
          const turned = rotate(point, turns);

          expect(tricornKind.iterations(turned, CAP, false)).toBe(
            tricornKind.iterations(point, CAP, false),
          );
          expect(tricornKind.iterations(turned, CAP, true)).toBeCloseTo(
            tricornKind.iterations(point, CAP, true),
            8,
          );
        }
      }
    });

    it("holds a point of the set to the set when it is turned", () => {
      const inside = { real: 0.3, imaginary: -0.7 };

      expect(tricornKind.iterations(inside, CAP, false)).toBe(CAP);
      for (const turns of [1, 2]) {
        expect(tricornKind.iterations(rotate(inside, turns), CAP, false)).toBe(
          CAP,
        );
      }
    });

    it("is not a symmetry of the Mandelbrot kind, which has the mirror alone", () => {
      // Without this the test above would say nothing about the conjugate: a
      // formula that ignored it would fail here and pass the turn only by luck.
      const point = { real: -0.5, imaginary: 0.6 };

      expect(mandelbrotKind.iterations(point, CAP, false)).toBe(CAP);
      expect(mandelbrotKind.iterations(rotate(point, 1), CAP, false)).not.toBe(
        CAP,
      );
    });
  });

  it("keeps the mirror symmetry about the real axis, exactly", () => {
    // conj(z_n(c)) is z_n(conj c) step for step, and conjugating changes no
    // float, only a sign.
    for (const point of [
      { real: 0.5, imaginary: 0.5 },
      { real: -0.9, imaginary: 0.15 },
      { real: 0.25, imaginary: 0.65 },
    ]) {
      const mirrored = { real: point.real, imaginary: -point.imaginary };

      expect(tricornKind.iterations(mirrored, CAP, false)).toBe(
        tricornKind.iterations(point, CAP, false),
      );
      expect(tricornKind.iterations(mirrored, CAP, true)).toBe(
        tricornKind.iterations(point, CAP, true),
      );
    }
  });

  it("gives a fractional count to a smooth read of an escaping point", () => {
    // c = 0.5 + 0.5i escapes after 6 whole steps; the smooth count is the
    // fraction of the next one the orbit's size says it had used.
    const c = { real: 0.5, imaginary: 0.5 };

    expect(tricornKind.iterations(c, CAP, false)).toBe(6);
    expect(tricornKind.iterations(c, CAP, true)).toBeCloseTo(6.2267696965, 8);
  });

  it("stops at the cap for a point that has not escaped by then", () => {
    // c = 0.25 + 0.65i escapes, but only after a dozen steps.
    const c = { real: 0.25, imaginary: 0.65 };
    const escapes = tricornKind.iterations(c, CAP, false);

    expect(escapes).toBeGreaterThan(10);
    expect(escapes).toBeLessThan(CAP);

    expect(tricornKind.iterations(c, 10, false)).toBe(10);
    expect(tricornKind.iterations(c, 10, true)).toBe(10);
    expect(tricornKind.iterations(c, escapes + 1, false)).toBe(escapes);
    expect(tricornKind.iterations(c, 0, false)).toBe(0);
  });

  it("draws all three arms in the view it opens on", () => {
    // The view the picker resets to has to hold the set: the origin is in it,
    // the left arm runs to its left edge, and the corners are sky, so it is
    // not cropped into the middle of the body either.
    const view = defaultViewFor("tricorn");
    const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);

    expect(view).toEqual({ centerX: 0, centerY: 0, zoom: 1 });
    expect(
      tricornKind.iterations(
        { real: view.centerX, imaginary: view.centerY },
        CAP,
        false,
      ),
    ).toBe(CAP);

    let bounded = 0;
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

        if (tricornKind.iterations(point, CAP, false) === CAP) {
          bounded++;
        } else {
          escaped++;
        }
      }
    }

    expect(bounded).toBeGreaterThan(0);
    expect(escaped).toBeGreaterThan(0);

    for (const point of [
      { real: bounds.minReal, imaginary: bounds.minImaginary },
      { real: bounds.minReal, imaginary: bounds.maxImaginary },
      { real: bounds.maxReal, imaginary: bounds.minImaginary },
      { real: bounds.maxReal, imaginary: bounds.maxImaginary },
    ]) {
      expect(tricornKind.iterations(point, CAP, false)).toBeLessThan(CAP);
    }

    // The two arms that do not lie on the axis are in the frame too: c = -1,
    // the middle of the left arm's bulb, turned by 120 degrees either way is
    // the middle of the same bulb on each of them.
    for (const turns of [1, 2]) {
      const bulb = rotate({ real: -1, imaginary: 0 }, turns);

      expect(Math.abs(bulb.imaginary)).toBeGreaterThan(0.8);
      expect(tricornKind.iterations(bulb, CAP, false)).toBe(CAP);
      expect(bulb.imaginary).toBeGreaterThanOrEqual(bounds.minImaginary);
      expect(bulb.imaginary).toBeLessThanOrEqual(bounds.maxImaginary);
    }
  });
});
