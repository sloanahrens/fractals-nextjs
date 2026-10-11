import { describe, expect, it } from "vitest";

import { celticKind } from "../celtic";
import { defaultViewFor } from "../fractalTypes";
import { calculateZoomBounds, mandelbrotKind } from "../mandelbrot";

const CAP = 200;

describe("celticKind", () => {
  it("names itself celtic", () => {
    expect(celticKind.id).toBe("celtic");
  });

  it("holds the origin, which never leaves the set", () => {
    const origin = { real: 0, imaginary: 0 };

    expect(celticKind.iterations(origin, CAP, false)).toBe(CAP);
    expect(celticKind.iterations(origin, CAP, true)).toBe(CAP);
  });

  it("escapes c = 2 on the second step, which the loop counts as 1", () => {
    // z1 = 2 has |z|^2 = 4, which is not past 4, and z2 = |2^2| + 2 = 6 is:
    // one step completed before the one that escaped, the Mandelbrot count.
    const c = { real: 2, imaginary: 0 };

    expect(celticKind.iterations(c, CAP, false)).toBe(1);
    expect(mandelbrotKind.iterations(c, CAP, false)).toBe(1);
  });

  it("counts what the Mandelbrot kind counts on the real axis", () => {
    // With the imaginary part 0 the real part of z^2 is x^2, which is not
    // negative, so the fold does nothing: the counts agree exactly, smoothing
    // included, which is what says this is the Mandelbrot loop with a fold.
    for (let step = -200; step <= 250; step++) {
      const c = { real: step / 100, imaginary: 0 };

      expect(celticKind.iterations(c, CAP, false)).toBe(
        mandelbrotKind.iterations(c, CAP, false),
      );
      expect(celticKind.iterations(c, CAP, true)).toBe(
        mandelbrotKind.iterations(c, CAP, true),
      );
    }
  });

  it("differs from the Mandelbrot kind where the fold matters", () => {
    // c = i is in the Mandelbrot set (its orbit is i, -1 + i, -i, -1 + i, ...).
    // Worked by hand, the Celtic orbit is z1 = i, z2 = |-1| + i = 1 + i (the
    // square of i is -1, and the fold makes its real part 1) and
    // z3 = |1 - 1| + (2 + 1) i = 3i, whose |z|^2 is 9: two steps completed
    // before the one that escaped.
    const c = { real: 0, imaginary: 1 };

    expect(mandelbrotKind.iterations(c, CAP, false)).toBe(CAP);
    expect(celticKind.iterations(c, CAP, false)).toBe(2);
  });

  it("keeps the mirror symmetry about the real axis, exactly", () => {
    // The fold touches only the real part, so conj(z_n(c)) is z_n(conj c) step
    // for step, and conjugating changes no float, only a sign.
    for (const point of [
      { real: 0.5, imaginary: 0.5 },
      { real: -0.9, imaginary: 0.15 },
      { real: -1.3, imaginary: 0.7 },
      { real: 0.15, imaginary: 0.15 },
    ]) {
      const mirrored = { real: point.real, imaginary: -point.imaginary };

      expect(celticKind.iterations(mirrored, CAP, false)).toBe(
        celticKind.iterations(point, CAP, false),
      );
      expect(celticKind.iterations(mirrored, CAP, true)).toBe(
        celticKind.iterations(point, CAP, true),
      );
    }
  });

  it("has no mirror symmetry about the imaginary axis, which the Mandelbrot set lacks too", () => {
    // Without this the mirror test above would say nothing about the fold: a
    // loop that was symmetric about both axes would pass it. Some point of the
    // grid must count differently from its reflection in the imaginary axis.
    let differing = 0;

    for (let column = -10; column <= 10; column++) {
      for (let row = 1; row <= 10; row++) {
        const point = { real: column / 8, imaginary: row / 8 };
        const reflected = { real: -point.real, imaginary: point.imaginary };

        if (
          celticKind.iterations(point, CAP, false) !==
          celticKind.iterations(reflected, CAP, false)
        ) {
          differing++;
        }
      }
    }

    expect(differing).toBeGreaterThan(0);
  });

  it("gives a fractional count to a smooth read of an escaping point", () => {
    // c = 0.5 + 0.5i escapes after a few whole steps; the smooth count is the
    // fraction of the next one the orbit's size says it had used.
    const c = { real: 0.5, imaginary: 0.5 };
    const whole = celticKind.iterations(c, CAP, false);
    const smooth = celticKind.iterations(c, CAP, true);

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
      celticKind.iterations(at(edge), CAP, false) ===
      celticKind.iterations(at(edge + 0.0004), CAP, false)
    ) {
      edge += 0.0004;
      expect(edge).toBeLessThan(1.6);
    }

    // ...and walk across it in steps of a hundred-thousandth. The shared
    // smoothing is the Mandelbrot formula with escape radius 2, which is exact
    // only as the radius grows, so a count that steps is allowed a small seam
    // (the orbit's last point is |z|^2 + c, not |z|^2); everywhere else the
    // smooth count must move by almost nothing between neighbouring samples.
    let previous: { whole: number; smooth: number } | null = null;
    let largestSteadyJump = 0;
    let largestSeam = 0;
    let steps = 0;
    for (let step = -100; step <= 500; step++) {
      const c = at(edge + step * 1e-5);
      const sample = {
        whole: celticKind.iterations(c, CAP, false),
        smooth: celticKind.iterations(c, CAP, true),
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
    // The seam is a fraction of the whole step, so bands blend rather than
    // jump a full colour.
    expect(largestSeam).toBeLessThan(0.5);
  });

  it("stops at the cap for a point that has not escaped by then", () => {
    // c = 0.5 + 0.5i escapes, but only after a few steps; a cap at or below
    // that count stops short of it.
    const c = { real: 0.5, imaginary: 0.5 };
    const escapes = celticKind.iterations(c, CAP, false);

    expect(escapes).toBeLessThan(CAP);
    expect(celticKind.iterations(c, escapes, false)).toBe(escapes);
    expect(celticKind.iterations(c, escapes, true)).toBe(escapes);
    expect(celticKind.iterations(c, escapes + 1, false)).toBe(escapes);
    expect(celticKind.iterations(c, 0, false)).toBe(0);
  });

  it("agrees with its own escapeInfo and orbit", () => {
    for (const c of [
      { real: 0, imaginary: 0 },
      { real: 0, imaginary: 1 },
      { real: -1.3, imaginary: 0.7 },
      { real: 0.5, imaginary: 0.5 },
    ]) {
      const steps = celticKind.iterations(c, CAP, false);

      expect(celticKind.escapeInfo!(c, CAP)).toEqual({
        steps,
        escaped: steps < CAP,
      });
    }

    // The hand-worked path of c = i: 0, i, 1 + i, 3i.
    expect(celticKind.orbit!({ real: 0, imaginary: 1 }, 10)).toEqual([
      { real: 0, imaginary: 0 },
      { real: 0, imaginary: 1 },
      { real: 1, imaginary: 1 },
      { real: 0, imaginary: 3 },
    ]);
  });

  it("never lands left of c: the fold keeps each step's real part at c's or more", () => {
    const c = { real: -0.9, imaginary: 0.3 };

    for (const point of celticKind.orbit!(c, 50).slice(1)) {
      expect(point.real).toBeGreaterThanOrEqual(c.real);
    }
  });

  it("draws the whole set in the view it opens on, spike and nose both inside", () => {
    const view = defaultViewFor("celtic");
    const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);

    expect(view).toEqual({ centerX: -0.8, centerY: 0, zoom: 1 });
    // The set's tips on the real axis, -2 and about 0.25, are in the frame.
    expect(bounds.minReal).toBeLessThan(-2);
    expect(bounds.maxReal).toBeGreaterThan(0.33);
    expect(
      celticKind.iterations({ real: -1.99, imaginary: 0 }, CAP, false),
    ).toBe(CAP);
    expect(
      celticKind.iterations({ real: 0.24, imaginary: 0 }, CAP, false),
    ).toBe(CAP);

    // The corners are sky.
    for (const real of [bounds.minReal, bounds.maxReal]) {
      for (const imaginary of [bounds.minImaginary, bounds.maxImaginary]) {
        expect(
          celticKind.iterations({ real, imaginary }, CAP, false),
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

        if (celticKind.iterations(point, CAP, false) === CAP) {
          bounded++;
        } else {
          escaped++;
        }
      }
    }

    // Both the set and the sky are well represented.
    expect(bounded / (bounded + escaped)).toBeGreaterThan(0.1);
    expect(bounded / (bounded + escaped)).toBeLessThan(0.6);
  });
});
