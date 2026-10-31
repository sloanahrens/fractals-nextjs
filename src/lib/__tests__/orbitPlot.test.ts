/**
 * The orbit plot's arithmetic and its words.
 *
 * `orbit.test.ts` holds what each kind walks; this holds what the card makes of
 * it: where the points land in a square plot, that a point which has blown up
 * cannot spoil the frame for the rest, what colour each dot is, and the
 * sentence a screen reader is given instead of the picture.
 */
import { describe, expect, it } from "vitest";

import { mapIterationsToColor } from "../colorMapping";
import { colourCss } from "../mathProbe";
import {
  ORBIT_ESCAPE_RADIUS,
  ORBIT_MAX_EXTENT_FACTOR,
  ORBIT_PLAY_STEP_MS,
  ORBIT_PLOT_SIZE,
  describeOrbit,
  hasEscapeCircle,
  orbitMinExtent,
  orbitStepColour,
  orbitSteps,
  orbitToPlot,
} from "../orbitPlot";
import type { ComplexNumber } from "../../types/fractal";

const SIZE = ORBIT_PLOT_SIZE;
/** size / 2, the plot's middle and the plane's origin in it. */
const HALF = SIZE / 2;
/** The margin an edge dot is held inside. */
const MARGIN = SIZE * 0.05;
const ESCAPE_KIND = "mandelbrot";
const NEWTON = "newton";

function orbit(...points: [number, number][]): ComplexNumber[] {
  return points.map(([real, imaginary]) => ({ real, imaginary }));
}

describe("orbitToPlot", () => {
  it("puts the origin at the middle and one unit at the scale", () => {
    // The frame is the escape radius, so a unit of the plane is a quarter of
    // the usable width each way.
    const plotted = orbitToPlot(orbit([0, 0], [1, 0]), SIZE, ORBIT_ESCAPE_RADIUS);
    const scale = (HALF - MARGIN) / ORBIT_ESCAPE_RADIUS;

    expect(plotted.origin).toEqual({ x: HALF, y: HALF });
    expect(plotted.extent).toBe(ORBIT_ESCAPE_RADIUS);
    expect(plotted.scale).toBeCloseTo(scale, 10);
    expect(plotted.points[0]).toEqual({ x: HALF, y: HALF });
    expect(plotted.points[1].x).toBeCloseTo(HALF + scale, 10);
    expect(plotted.points[1].y).toBeCloseTo(HALF, 10);
  });

  it("draws the imaginary part up the page, as the plane has it", () => {
    const plotted = orbitToPlot(orbit([0, 0], [0, 1]), SIZE, ORBIT_ESCAPE_RADIUS);
    const scale = (HALF - MARGIN) / ORBIT_ESCAPE_RADIUS;

    expect(plotted.points[1].y).toBeCloseTo(HALF - scale, 10);
  });

  it("grows the frame to the orbit, but never past the escape circle's twice", () => {
    // Inside the band the orbit sets the frame...
    const reachable = orbitToPlot(orbit([0, 0], [3, 0]), SIZE, ORBIT_ESCAPE_RADIUS);
    expect(reachable.extent).toBe(3);
    // ...and outside it the frame stops, because the point that has flown off
    // is flying.
    expect(reachable.points[1].x).toBeCloseTo(SIZE - MARGIN, 10);

    const runaway = orbitToPlot(orbit([0, 0], [1e6, 0]), SIZE, ORBIT_ESCAPE_RADIUS);
    expect(runaway.extent).toBe(ORBIT_ESCAPE_RADIUS * 2);
  });

  it("never lets the frame shrink inside the circle", () => {
    // A bounded orbit stays inside unit scale, and the circle still shows.
    const plotted = orbitToPlot(orbit([0, 0], [0.25, 0]), SIZE, ORBIT_ESCAPE_RADIUS);

    expect(plotted.extent).toBe(ORBIT_ESCAPE_RADIUS);
    expect(plotted.points[1].x).toBeGreaterThan(HALF);
  });

  it("pins a point past the frame to the edge rather than dropping it", () => {
    const plotted = orbitToPlot(orbit([0, 0], [1e30, 0]), SIZE, ORBIT_ESCAPE_RADIUS);

    expect(plotted.points[1].x).toBeCloseTo(SIZE - MARGIN, 10);
    expect(plotted.points[1].y).toBeCloseTo(HALF, 10);
  });

  it("answers a finite point inside the plot for every value, however wild", () => {
    // A point that has blown up is full of values no scale can hold; one of
    // them must not be able to put a NaN in the markup.
    const wild = orbit(
      [0, 0],
      [Number.NaN, 0],
      [Infinity, -Infinity],
      [1e308, -1e308],
      [-1e-308, 1e-308],
    );
    const plotted = orbitToPlot(wild, SIZE, ORBIT_ESCAPE_RADIUS);

    expect(plotted.points).toHaveLength(wild.length);
    for (const point of plotted.points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(MARGIN);
      expect(point.x).toBeLessThanOrEqual(SIZE - MARGIN);
      expect(point.y).toBeGreaterThanOrEqual(MARGIN);
      expect(point.y).toBeLessThanOrEqual(SIZE - MARGIN);
    }
  });

  it("reads a value that is not a number at all as the origin", () => {
    const plotted = orbitToPlot(orbit([Number.NaN, Number.NaN]), SIZE, ORBIT_ESCAPE_RADIUS);

    expect(plotted.points[0]).toEqual({ x: HALF, y: HALF });
  });

  it("defaults to the unit frame and survives a size with no room", () => {
    expect(orbitToPlot(orbit([0, 0], [0.5, 0]), SIZE).extent).toBe(1);

    // No box, no scale, and still no NaN.
    const nothing = orbitToPlot(orbit([0, 0], [4, 4]), 0, ORBIT_ESCAPE_RADIUS);
    expect(nothing.points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});

describe("orbitMinExtent and hasEscapeCircle", () => {
  it("gives an escape-time kind the circle's radius and Newton the unit circle", () => {
    expect(orbitMinExtent(ESCAPE_KIND)).toBe(ORBIT_ESCAPE_RADIUS);
    expect(orbitMinExtent("julia")).toBe(ORBIT_ESCAPE_RADIUS);
    expect(orbitMinExtent(NEWTON)).toBe(1);
  });

  it("draws the escape circle only where the radius drawn is the one left", () => {
    expect(hasEscapeCircle("mandelbrot")).toBe(true);
    expect(hasEscapeCircle("tricorn")).toBe(true);
    expect(hasEscapeCircle("celtic")).toBe(true);
    expect(hasEscapeCircle("perpendicular-ship")).toBe(true);
    expect(hasEscapeCircle("phoenix")).toBe(true);
    // Nova's orbits settle on a point and leave only past a million, so a
    // circle of 2 would mark nothing; it keeps the escape-time frame.
    expect(hasEscapeCircle("nova")).toBe(false);
    expect(orbitMinExtent("nova")).toBe(ORBIT_ESCAPE_RADIUS);
    expect(hasEscapeCircle("something-new")).toBe(true);
    expect(hasEscapeCircle(NEWTON)).toBe(false);
    // The Magnet's orbits leave at 100 rather than 2, so the circle of 2 would
    // sit inside the wandering rather than at the edge of the picture.
    expect(hasEscapeCircle("magnet")).toBe(false);
    // The Sine set's orbits leave by height (more than 20 off the real axis),
    // not by radius, so a circle of 2 would mark nothing; it keeps the
    // escape-time frame.
    expect(hasEscapeCircle("sine")).toBe(false);
    expect(orbitMinExtent("sine")).toBe(ORBIT_ESCAPE_RADIUS);
    // The Cosine set's orbits leave the same way: by height, not by radius.
    expect(hasEscapeCircle("cosine")).toBe(false);
    expect(orbitMinExtent("cosine")).toBe(ORBIT_ESCAPE_RADIUS);
    // The Sine of z squared set's orbits leave by the height of z's square,
    // so it gets no circle and keeps the escape-time frame.
    expect(hasEscapeCircle("sin-z-squared")).toBe(false);
    expect(orbitMinExtent("sin-z-squared")).toBe(ORBIT_ESCAPE_RADIUS);
  });

  it("still plots the Magnet's orbit in the escape-time frame", () => {
    // No circle, but the frame is the scale a magnet orbit moves at: its dots
    // are drawn from the same floor as the escape-time kinds'.
    expect(orbitMinExtent("magnet")).toBe(ORBIT_ESCAPE_RADIUS);
  });
});

describe("orbitSteps", () => {
  it("counts the transitions and never goes below none", () => {
    expect(orbitSteps(orbit([0, 0], [1, 0], [2, 0]))).toBe(2);
    expect(orbitSteps(orbit([0, 0]))).toBe(0);
    expect(orbitSteps([])).toBe(0);
  });
});

describe("orbitStepColour", () => {
  it("is the picture's mapping, spread across the orbit's dots", () => {
    expect(orbitStepColour(0, 5, "classic")).toBe(
      colourCss(mapIterationsToColor(0, 5, "classic")),
    );
    expect(orbitStepColour(2, 5, "fire")).toBe(
      colourCss(mapIterationsToColor(2, 5, "fire")),
    );
  });

  it("keeps the last dot off the black the mapping paints at the cap", () => {
    // Four dots: the last one is three quarters of the way along, not at the
    // end, which is the colour for a point the renderer never counts.
    expect(orbitStepColour(3, 4, "grayscale")).toBe("rgb(191, 191, 191)");
    expect(mapIterationsToColor(4, 4, "grayscale")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("gives a one-dot orbit a colour rather than dividing by zero", () => {
    expect(orbitStepColour(0, 0, "grayscale")).toBe("rgb(0, 0, 0)");
  });

  it("paints through the picture's own settings", () => {
    // The dots are the picture's colours, so a reversed or shifted picture has
    // reversed or shifted dots.
    const reverse = { reverse: true };
    const shift = { shift: 0.25 };

    expect(orbitStepColour(1, 4, "grayscale", reverse)).toBe(
      colourCss(mapIterationsToColor(1, 4, "grayscale", reverse)),
    );
    expect(orbitStepColour(1, 4, "grayscale", shift)).toBe(
      colourCss(mapIterationsToColor(1, 4, "grayscale", shift)),
    );
    // ...and asking for nothing is the picture as it was.
    expect(orbitStepColour(1, 4, "grayscale", {})).toBe(
      orbitStepColour(1, 4, "grayscale"),
    );
  });
});

describe("describeOrbit", () => {
  it("names an escaped orbit's steps", () => {
    expect(
      describeOrbit(ESCAPE_KIND, { steps: 7, escaped: true }, 8),
    ).toBe("Orbit of the point, 7 steps, escaped");
  });

  it("says a point that stayed inside stayed inside", () => {
    expect(
      describeOrbit(ESCAPE_KIND, { steps: 60, escaped: false }, 60),
    ).toBe("Orbit of the point, 60 steps, stays inside");
  });

  it("says when the plot stopped short of the orbit it describes", () => {
    // A deep view's cap can be far past the plot's sixty steps, and the ones
    // that were not walked must not be spoken for.
    expect(
      describeOrbit(ESCAPE_KIND, { steps: 400, escaped: false }, 60),
    ).toBe("Orbit of the point, first 60 steps, stays inside");
    expect(
      describeOrbit(ESCAPE_KIND, { steps: 400, escaped: true }, 60),
    ).toBe("Orbit of the point, first 60 steps, stays inside");
  });

  it("says what a Newton orbit did, and counts its roots from 1", () => {
    expect(
      describeOrbit(NEWTON, { steps: 1, escaped: true, root: 0 }, 1),
    ).toBe("Orbit of the point, 1 steps, settles on root 1");
    expect(
      describeOrbit(NEWTON, { steps: 6, escaped: true, root: 2 }, 6),
    ).toBe("Orbit of the point, 6 steps, settles on root 3");
    expect(describeOrbit(NEWTON, { steps: 200, escaped: false }, 60)).toBe(
      "Orbit of the point, 60 steps, never settles",
    );
  });
});

describe("describeOrbit for Nova", () => {
  it("says a settling orbit settles, an escaping one escaped, and one the plot cut off is still moving", () => {
    expect(
      describeOrbit("nova", { steps: 22, escaped: true, settled: true }, 22),
    ).toBe("Orbit of the point, 22 steps, settles");
    expect(
      describeOrbit("nova", { steps: 1, escaped: true, settled: false }, 1),
    ).toBe("Orbit of the point, 1 steps, escaped");
    // The window is sixty steps and a slow orbit takes more.
    expect(
      describeOrbit("nova", { steps: 140, escaped: true, settled: true }, 60),
    ).toBe("Orbit of the point, first 60 steps, still moving");
    expect(describeOrbit("nova", { steps: 200, escaped: false }, 60)).toBe(
      "Orbit of the point, 60 steps, never settles",
    );
  });
});

describe("the play control's numbers", () => {
  it("are a step a tenth of a second or so, and a plot a phone can hold", () => {
    expect(ORBIT_PLAY_STEP_MS).toBe(120);
    expect(ORBIT_PLOT_SIZE).toBe(220);
    expect(ORBIT_MAX_EXTENT_FACTOR).toBe(2);
  });
});
