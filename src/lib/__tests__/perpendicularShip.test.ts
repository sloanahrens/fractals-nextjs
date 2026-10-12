import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import { defaultViewFor } from "../fractalTypes";
import { calculateZoomBounds, mandelbrotKind } from "../mandelbrot";
import { perpendicularShipKind } from "../perpendicularShip";

const CAP = 200;

/**
 * One Perpendicular Ship step, the formula written out as the Math card states
 * it: x' = x^2 - y^2 + cx and y' = -2 |x| y + cy. The suite's own copy, so the
 * kind's orbit is checked against the rule rather than against itself.
 */
function step(point: ComplexNumber, c: ComplexNumber): ComplexNumber {
  return {
    real: point.real * point.real - point.imaginary * point.imaginary + c.real,
    imaginary: -2 * Math.abs(point.real) * point.imaginary + c.imaginary,
  };
}

describe("perpendicularShipKind", () => {
  it("names itself perpendicular-ship", () => {
    expect(perpendicularShipKind.id).toBe("perpendicular-ship");
  });

  it("holds the origin, which never leaves the set", () => {
    const origin = { real: 0, imaginary: 0 };

    expect(perpendicularShipKind.iterations(origin, CAP, false)).toBe(CAP);
    expect(perpendicularShipKind.iterations(origin, CAP, true)).toBe(CAP);
  });

  it("escapes c = 2 on the second step, which the loop counts as 1", () => {
    // z1 = 2 has |z|^2 = 4, which is not past 4, and z2 = 2^2 + 2 = 6 is: one
    // step completed before the one that escaped, the Mandelbrot count.
    const c = { real: 2, imaginary: 0 };

    expect(perpendicularShipKind.iterations(c, CAP, false)).toBe(1);
    expect(mandelbrotKind.iterations(c, CAP, false)).toBe(1);
  });

  it("counts what the Mandelbrot kind counts on the real axis", () => {
    // With the imaginary part 0 the imaginary step is -2 |x| * 0, which is 0,
    // so the orbit never leaves the axis and the real step is the Mandelbrot
    // step: the counts agree exactly, smoothing included, which is what says
    // this is the Mandelbrot loop with a fold and not another picture.
    for (let step = -200; step <= 250; step++) {
      const c = { real: step / 100, imaginary: 0 };

      expect(perpendicularShipKind.iterations(c, CAP, false)).toBe(
        mandelbrotKind.iterations(c, CAP, false),
      );
      expect(perpendicularShipKind.iterations(c, CAP, true)).toBe(
        mandelbrotKind.iterations(c, CAP, true),
      );
    }
  });

  it("differs from the Mandelbrot kind where the fold matters", () => {
    // c = -1.7 + 0.1 i, worked by hand. The first step is c itself, and while
    // the real part is negative the fold has nothing to do, so the two kinds
    // agree for two steps: z1 = (-1.7, 0.1), z2 = (1.18, -0.24). The third
    // step is where they part: the ship takes the imaginary part against
    // |1.18|, so z3 = (1.3924 - 0.0576 - 1.7, -2 * 1.18 * -0.24 + 0.1) =
    // (-0.3652, 0.6664), while the Mandelbrot step conjugates it, to
    // (-0.3652, -0.4664). Its z4 = (-2.0107, -0.3868) has |z|^2 = 4.19 and is
    // the one that escaped, so three steps were completed before it.
    const c = { real: -1.7, imaginary: 0.1 };

    expect(perpendicularShipKind.iterations(c, CAP, false)).toBe(3);
    expect(mandelbrotKind.iterations(c, CAP, false)).toBe(5);
  });

  it("keeps the mirror symmetry about the real axis, exactly", () => {
    // Conjugating a step's inputs conjugates the step: x^2 - y^2 is unchanged
    // and -2 |x| y changes sign with y, while c's own imaginary part changes
    // sign with it too. So conj(z_n(c)) is z_n(conj c) step for step, and
    // conjugating changes no float, only signs.
    for (const point of [
      { real: 0.5, imaginary: 0.5 },
      { real: -0.9, imaginary: 0.15 },
      { real: -1.3, imaginary: 0.7 },
      { real: 0.15, imaginary: 0.9 },
    ]) {
      const mirrored = { real: point.real, imaginary: -point.imaginary };

      expect(perpendicularShipKind.iterations(mirrored, CAP, false)).toBe(
        perpendicularShipKind.iterations(point, CAP, false),
      );
      expect(perpendicularShipKind.iterations(mirrored, CAP, true)).toBe(
        perpendicularShipKind.iterations(point, CAP, true),
      );
    }
  });

  it("has no mirror symmetry about the imaginary axis, which the Mandelbrot set lacks too", () => {
    // Without this the mirror test above would say nothing about the fold: a
    // loop symmetric about both axes would pass it. The fold takes the size of
    // x, so the set is not symmetric this way.
    let differing = 0;

    for (let column = -10; column <= 10; column++) {
      for (let row = 1; row <= 10; row++) {
        const point = { real: column / 8, imaginary: row / 8 };
        const reflected = { real: -point.real, imaginary: point.imaginary };

        if (
          perpendicularShipKind.iterations(point, CAP, false) !==
          perpendicularShipKind.iterations(reflected, CAP, false)
        ) {
          differing++;
        }
      }
    }

    expect(differing).toBeGreaterThan(0);
  });

  it("takes a step that does not care about the sign of the real part it is given", () => {
    // The rule the Math card's escape sentence states: the next point is built
    // from x^2 and from |x|, so a point and its reflection in the imaginary
    // axis go to the very same next point. Checked on the rule rather than on
    // the kind, since the kind only ever walks the one orbit from 0.
    const c = { real: -0.5, imaginary: 0.8 };

    for (const point of [
      { real: 1.2, imaginary: 0.3 },
      { real: -1.2, imaginary: 0.3 },
      { real: 0.75, imaginary: -1.1 },
      { real: -0.05, imaginary: 0.4 },
    ]) {
      const reflected = { real: -point.real, imaginary: point.imaginary };

      expect(step(point, c)).toEqual(step(reflected, c));
    }
  });

  it("gives a fractional count to a smooth read of an escaping point", () => {
    // c = 0.5 + 0.5i escapes after a few whole steps; the smooth count is the
    // fraction of the next one the orbit's size says it had used.
    const c = { real: 0.5, imaginary: 0.5 };
    const whole = perpendicularShipKind.iterations(c, CAP, false);
    const smooth = perpendicularShipKind.iterations(c, CAP, true);

    expect(whole).toBeGreaterThan(0);
    expect(whole).toBeLessThan(CAP);
    expect(smooth).not.toBe(whole);
    expect(smooth).toBeGreaterThan(whole - 1);
    expect(smooth).toBeLessThan(whole + 1);
  });

  it("is continuous in the smooth count where the whole count steps", () => {
    // Along a line well outside the set the whole count steps up from one band
    // to the next; the smooth count has to run through those steps without a
    // jump, which is what lets every colour scheme draw smooth bands.
    const at = (real: number) => ({ real, imaginary: 0.5 });

    // Find where the whole count first steps on the line y = 0.5...
    let edge = 0.8;
    while (
      perpendicularShipKind.iterations(at(edge), CAP, false) ===
      perpendicularShipKind.iterations(at(edge + 0.0004), CAP, false)
    ) {
      edge += 0.0004;
      expect(edge).toBeLessThan(1.6);
    }

    // ...and walk across it in steps of a hundred-thousandth. The shared
    // smoothing is the Mandelbrot formula with escape radius 2, exact only as
    // the radius grows, so a count that steps is allowed a small seam;
    // everywhere else the smooth count must move by almost nothing between
    // neighbouring samples.
    let previous: { whole: number; smooth: number } | null = null;
    let largestSteadyJump = 0;
    let largestSeam = 0;
    let steps = 0;
    for (let offset = -100; offset <= 500; offset++) {
      const c = at(edge + offset * 1e-5);
      const sample = {
        whole: perpendicularShipKind.iterations(c, CAP, false),
        smooth: perpendicularShipKind.iterations(c, CAP, true),
      };
      if (previous !== null) {
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

  it("stops at the cap for a point that has not escaped by then", () => {
    const c = { real: 0.5, imaginary: 0.5 };
    const escapes = perpendicularShipKind.iterations(c, CAP, false);

    expect(escapes).toBeLessThan(CAP);
    expect(perpendicularShipKind.iterations(c, escapes, false)).toBe(escapes);
    expect(perpendicularShipKind.iterations(c, escapes, true)).toBe(escapes);
    expect(perpendicularShipKind.iterations(c, escapes + 1, false)).toBe(
      escapes,
    );
    expect(perpendicularShipKind.iterations(c, 0, false)).toBe(0);
  });

  it("walks the orbit its own rule gives, step for step", () => {
    // The orbit is the rule applied from 0, checked here against the suite's
    // own copy of the formula.
    const c = { real: -1.7, imaginary: 0.1 };
    const orbit = perpendicularShipKind.orbit!(c, 6);

    let point: ComplexNumber = { real: 0, imaginary: 0 };
    expect(orbit[0]).toEqual(point);
    for (let i = 1; i < orbit.length; i++) {
      point = step(point, c);
      expect(orbit[i]).toEqual(point);
    }
  });

  it("agrees with its own escapeInfo and orbit", () => {
    for (const c of [
      { real: 0, imaginary: 0 },
      { real: 0, imaginary: 1 },
      { real: -1.3, imaginary: 0.7 },
      { real: 0.5, imaginary: 0.5 },
    ]) {
      const steps = perpendicularShipKind.iterations(c, CAP, false);

      expect(perpendicularShipKind.escapeInfo!(c, CAP)).toEqual({
        steps,
        escaped: steps < CAP,
      });
    }

    // The hand-worked path of c = i, which is exact in integers: 0, i,
    // -1 + i, -i, and there it cycles between the last two, so a walk of ten
    // steps alternates to the end.
    expect(perpendicularShipKind.orbit!({ real: 0, imaginary: 1 }, 10)).toEqual(
      [
        { real: 0, imaginary: 0 },
        { real: 0, imaginary: 1 },
        { real: -1, imaginary: 1 },
        { real: 0, imaginary: -1 },
        { real: -1, imaginary: 1 },
        { real: 0, imaginary: -1 },
        { real: -1, imaginary: 1 },
        { real: 0, imaginary: -1 },
        { real: -1, imaginary: 1 },
        { real: 0, imaginary: -1 },
        { real: -1, imaginary: 1 },
      ],
    );
  });

  it("draws the whole set in the view it opens on, spike and bow both inside", () => {
    const view = defaultViewFor("perpendicular-ship");
    const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);

    expect(view).toEqual({ centerX: -0.55, centerY: 0, zoom: 1 });
    // The measured extent, x -1.78..0.68 by y -1.09..1.09, is inside the
    // frame, and the thin stretch of the spike on the real axis near -1.99 is
    // in the set (the axis is the Mandelbrot set's).
    expect(bounds.minReal).toBeLessThan(-1.78);
    expect(bounds.maxReal).toBeGreaterThan(0.68);
    expect(bounds.minImaginary).toBeLessThan(-1.09);
    expect(bounds.maxImaginary).toBeGreaterThan(1.09);
    expect(
      perpendicularShipKind.iterations(
        { real: -1.99, imaginary: 0 },
        CAP,
        false,
      ),
    ).toBe(CAP);
    expect(
      perpendicularShipKind.iterations(
        { real: -1.9, imaginary: 0.2 },
        CAP,
        false,
      ),
    ).toBeLessThan(CAP);

    // The corners are sky.
    for (const real of [bounds.minReal, bounds.maxReal]) {
      for (const imaginary of [bounds.minImaginary, bounds.maxImaginary]) {
        expect(
          perpendicularShipKind.iterations({ real, imaginary }, CAP, false),
        ).toBeLessThan(CAP);
      }
    }

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

        if (perpendicularShipKind.iterations(point, CAP, false) === CAP) {
          bounded++;
        } else {
          escaped++;
        }
      }
    }

    // Both the ship and the sky are well represented.
    expect(bounded / (bounded + escaped)).toBeGreaterThan(0.1);
    expect(bounded / (bounded + escaped)).toBeLessThan(0.6);
  });
});
