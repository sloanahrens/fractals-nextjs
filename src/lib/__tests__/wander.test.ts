import { describe, expect, it } from "vitest";

import type { FractalKind } from "../../types/fractal";
import { burningShipKind } from "../burningShip";
import { defaultViewFor } from "../fractalTypes";
import { JULIA_CONSTANTS, createJuliaKind } from "../julia";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  mandelbrotKind,
} from "../mandelbrot";
import {
  WanderView,
  createRng,
  isInteresting,
  nextWanderView,
} from "../wander";

// The three fractals the picker offers, as a walk uses them: the id that
// decides the neighbourhood to stay in, and the kind that draws it.
const WALKED: readonly { typeId: string; kind: FractalKind }[] = [
  { typeId: "mandelbrot", kind: mandelbrotKind },
  { typeId: "julia", kind: createJuliaKind(JULIA_CONSTANTS[0].constant) },
  { typeId: "burning-ship", kind: burningShipKind },
];

// A step moves the centre by at most 2.5 standard deviations of 0.15 of the
// current view, and the zoom by at most exp(2.5 * 0.25).
const MAX_CENTER_STEP = 0.375;
const MIN_ZOOM_RATIO = 0.53;
const MAX_ZOOM_RATIO = 1.87;
const NEIGHBOURHOOD = 2.0;

const STEPS = 200;

/** Walk one fractal from its default view, returning every view it stood on. */
function walk(typeId: string, kind: FractalKind, seed: number, steps = STEPS) {
  const rng = createRng(seed);
  const home = defaultViewFor(typeId);
  const views: WanderView[] = [home];

  for (let step = 0; step < steps; step++) {
    views.push(nextWanderView(views[views.length - 1], kind, typeId, rng));
  }

  return { home, views };
}

describe("createRng", () => {
  it("gives the same sequence for the same seed", () => {
    const first = createRng(12345);
    const second = createRng(12345);
    const sequence = Array.from({ length: 20 }, () => first());

    expect(Array.from({ length: 20 }, () => second())).toEqual(sequence);
  });

  it("stays in the half-open unit interval", () => {
    const rng = createRng(7);

    for (let draw = 0; draw < 1000; draw++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("isInteresting", () => {
  it("rejects a view deep inside the set, where every sample reports the cap", () => {
    // The cardioid around the origin is inside the set at any zoom, so a view
    // framed on it is one flat colour.
    expect(
      isInteresting({ centerX: 0, centerY: 0, zoom: MAX_ZOOM }, mandelbrotKind),
    ).toBe(false);
  });

  it("accepts the full view of each fractal", () => {
    for (const { typeId, kind } of WALKED) {
      expect(isInteresting(defaultViewFor(typeId), kind)).toBe(true);
    }
  });

  it("calls a kind that always reports the same count flat, and one that varies interesting", () => {
    const flat: FractalKind = { id: "flat", iterations: () => 7 };
    const varied: FractalKind = {
      id: "varied",
      iterations: (point) => (point.real + point.imaginary) * 1e6,
    };

    expect(isInteresting(defaultViewFor("mandelbrot"), flat)).toBe(false);
    expect(isInteresting(defaultViewFor("mandelbrot"), varied)).toBe(true);
  });
});

describe("nextWanderView", () => {
  it("walks the same 50 views twice from the same seed and start", () => {
    for (const { typeId, kind } of WALKED) {
      const first = walk(typeId, kind, 20261009, 50).views;
      const second = walk(typeId, kind, 20261009, 50).views;

      expect(second).toEqual(first);
    }
  });

  it("returns a view near the one before it, at every step", () => {
    for (const { typeId, kind } of WALKED) {
      const { views } = walk(typeId, kind, 20261009);

      for (let step = 1; step < views.length; step++) {
        const previous = views[step - 1];
        const current = views[step];

        // The step is bounded in the arithmetic; rounding the sum of a centre
        // and its step can land a unit in the last place past the bound.
        expect(
          Math.abs(current.centerX - previous.centerX),
        ).toBeLessThanOrEqual(
          MAX_CENTER_STEP * (BASE_WIDTH / previous.zoom) * (1 + 1e-12),
        );
        expect(
          Math.abs(current.centerY - previous.centerY),
        ).toBeLessThanOrEqual(
          MAX_CENTER_STEP * (BASE_HEIGHT / previous.zoom) * (1 + 1e-12),
        );
        expect(current.zoom / previous.zoom).toBeGreaterThanOrEqual(
          MIN_ZOOM_RATIO,
        );
        expect(current.zoom / previous.zoom).toBeLessThanOrEqual(
          MAX_ZOOM_RATIO,
        );
      }
    }
  });

  it("stays interesting, in range, and in the fractal's neighbourhood for 200 steps", () => {
    for (const { typeId, kind } of WALKED) {
      const { home, views } = walk(typeId, kind, 20261009);

      for (const view of views) {
        expect(isInteresting(view, kind)).toBe(true);
        expect(view.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(view.zoom).toBeLessThanOrEqual(MAX_ZOOM);
        expect(Math.abs(view.centerX - home.centerX)).toBeLessThanOrEqual(
          NEIGHBOURHOOD,
        );
        expect(Math.abs(view.centerY - home.centerY)).toBeLessThanOrEqual(
          NEIGHBOURHOOD,
        );
      }
    }
  });

  it("steps back toward the full view when no neighbour is interesting", () => {
    const flat: FractalKind = { id: "flat", iterations: () => 7 };
    const rng = createRng(3);
    let view: WanderView = { ...defaultViewFor("mandelbrot"), zoom: 100 };

    // Nothing this kind draws is interesting, so every step takes the
    // fallback: the same centre, a quarter less zoom.
    for (let step = 0; step < 30 && view.zoom > MIN_ZOOM; step++) {
      const next = nextWanderView(view, flat, "mandelbrot", rng);

      expect(next.centerX).toBe(view.centerX);
      expect(next.centerY).toBe(view.centerY);
      expect(next.zoom).toBe(clampZoom(view.zoom * 0.75));
      view = next;
    }

    expect(view.zoom).toBe(MIN_ZOOM);
  });

  it("keeps the zoom inside the range a view already at the ceiling", () => {
    // A step out of a view at the ceiling draws candidates above MAX_ZOOM.
    // Those come back clamped rather than reported as a zoom the app cannot
    // show, and the walk carries on from there.
    const varied: FractalKind = {
      id: "varied",
      iterations: (point) => (point.real + point.imaginary) * 1e6,
    };
    const rng = createRng(11);
    let view: WanderView = { ...defaultViewFor("mandelbrot"), zoom: MAX_ZOOM };

    for (let step = 0; step < 50; step++) {
      view = nextWanderView(view, varied, "mandelbrot", rng);

      expect(view.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(view.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    }
  });
});
