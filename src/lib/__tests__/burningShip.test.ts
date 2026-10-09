import { describe, expect, it } from "vitest";

import { burningShipKind } from "../burningShip";
import { defaultViewFor } from "../fractalTypes";
import { calculateZoomBounds, mandelbrotKind } from "../mandelbrot";

const CAP = 200;

describe("burningShipKind", () => {
  it("names itself burning-ship", () => {
    expect(burningShipKind.id).toBe("burning-ship");
  });

  it("counts what the Mandelbrot kind counts on the positive real axis", () => {
    // Both parts of z are folded onto the positive side before squaring, which
    // on the real axis is not a change: there the imaginary part is 0 and the
    // absolute value of a real number squares to the same number. So the two
    // loops take the same steps and the counts agree exactly -- smoothing
    // included -- which is what says this is the Mandelbrot loop with a fold
    // rather than a formula that merely resembles it.
    for (let step = 0; step <= 100; step++) {
      const c = { real: (2 * step) / 100, imaginary: 0 };

      expect(burningShipKind.iterations(c, CAP, false)).toBe(
        mandelbrotKind.iterations(c, CAP, false),
      );
      expect(burningShipKind.iterations(c, CAP, true)).toBe(
        mandelbrotKind.iterations(c, CAP, true),
      );
    }

    // Just outside the set, where the first step escapes: still the same step.
    for (const real of [2.000001, 2.0001, 2.5, 3]) {
      const c = { real, imaginary: 0 };

      expect(burningShipKind.iterations(c, CAP, false)).toBe(
        mandelbrotKind.iterations(c, CAP, false),
      );
      expect(burningShipKind.iterations(c, CAP, true)).toBe(
        mandelbrotKind.iterations(c, CAP, true),
      );
    }
  });

  it("differs from the Mandelbrot kind where the fold matters", () => {
    // c = -1.75 + 0.03i has a negative real part and sits off the axis, so the
    // fold moves the orbit: the Mandelbrot orbit escapes on its ninth step and
    // the ship's on its sixth. The sample is stated here rather than searched
    // for, so the assertion says where the two formulas part company.
    const c = { real: -1.75, imaginary: 0.03 };

    expect(mandelbrotKind.iterations(c, CAP, false)).toBe(9);
    expect(burningShipKind.iterations(c, CAP, false)).toBe(6);
    expect(mandelbrotKind.iterations(c, CAP, true)).toBeCloseTo(
      9.31815950891439,
    );
    expect(burningShipKind.iterations(c, CAP, true)).toBeCloseTo(
      6.186606608496269,
    );
  });

  it("draws the ship in the view it opens on", () => {
    // The view the picker resets to has to hold the ship: a box of nothing but
    // sky, or one that sits entirely inside the hull, would mean the default
    // centre is wrong. Both kinds of point have to be in it, on a grid whose
    // step is a hundredth of the base view.
    const view = defaultViewFor("burning-ship");
    const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);

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

        if (burningShipKind.iterations(point, CAP, false) === CAP) {
          bounded++;
        } else {
          escaped++;
        }
      }
    }

    expect(bounded).toBeGreaterThan(0);
    expect(escaped).toBeGreaterThan(0);

    // And the frame's own corners are sky, so the view is not cropped down
    // into the middle of the picture either.
    for (const point of [
      { real: bounds.minReal, imaginary: bounds.minImaginary },
      { real: bounds.minReal, imaginary: bounds.maxImaginary },
      { real: bounds.maxReal, imaginary: bounds.minImaginary },
      { real: bounds.maxReal, imaginary: bounds.maxImaginary },
    ]) {
      expect(burningShipKind.iterations(point, CAP, false)).toBeLessThan(CAP);
    }
  });
});
