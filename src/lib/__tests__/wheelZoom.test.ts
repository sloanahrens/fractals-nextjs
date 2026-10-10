import { describe, expect, it } from "vitest";

import {
  CTRL_WHEEL_ZOOM_RATE,
  DOM_DELTA_LINE,
  DOM_DELTA_PAGE,
  DOM_DELTA_PIXEL,
  MAX_WHEEL_DELTA,
  WHEEL_ZOOM_RATE,
  wheelZoomFactor,
} from "../wheelZoom";

const VIEWPORT = 800;

const pixels = (deltaY: number, ctrlKey = false) =>
  wheelZoomFactor(deltaY, DOM_DELTA_PIXEL, ctrlKey, VIEWPORT);

describe("wheelZoomFactor", () => {
  it("makes a 100-unit notch about the step the wheel always had", () => {
    const zoomIn = pixels(-100);
    const zoomOut = pixels(100);

    expect(zoomIn).toBeGreaterThan(1.1);
    expect(zoomIn).toBeLessThan(1.25);
    expect(zoomIn).toBeCloseTo(Math.exp(100 * WHEEL_ZOOM_RATE), 12);
    expect(zoomOut).toBeGreaterThan(1 / 1.25);
    expect(zoomOut).toBeLessThan(1 / 1.1);
  });

  it("barely moves for a delta of 4, which is a trackpad's smallest event", () => {
    expect(Math.abs(pixels(-4) - 1)).toBeLessThan(0.01);
    expect(Math.abs(pixels(4) - 1)).toBeLessThan(0.01);
  });

  it("takes the sign as the direction: up zooms in, down zooms out", () => {
    expect(pixels(-10)).toBeGreaterThan(1);
    expect(pixels(10)).toBeLessThan(1);
  });

  it("asks for no change when nothing was scrolled", () => {
    expect(pixels(0)).toBe(1);
    expect(pixels(-0)).toBe(1);
    expect(pixels(0, true)).toBe(1);
  });

  it("returns to the same scale when zoomed in then out by the same delta", () => {
    for (const delta of [3, 17, 100, 120, 500]) {
      expect(pixels(-delta) * pixels(delta)).toBeCloseTo(1, 12);
    }
  });

  it("adds scroll up: many small events are worth one event of their sum", () => {
    let total = 1;
    for (let i = 0; i < 30; i++) {
      total *= pixels(-3);
    }

    expect(total).toBeCloseTo(pixels(-90), 12);
    // A light trackpad swipe used to zoom 1.1^30, about 17x.
    expect(total).toBeLessThan(1.2);
  });

  it("reads a line as 16 pixels", () => {
    expect(wheelZoomFactor(-3, DOM_DELTA_LINE, false, VIEWPORT)).toBeCloseTo(
      pixels(-48),
      12,
    );
  });

  it("reads a page as the viewport's height", () => {
    // A tenth of a page of 800 pixels is 80 pixels.
    expect(wheelZoomFactor(-0.1, DOM_DELTA_PAGE, false, VIEWPORT)).toBeCloseTo(
      pixels(-80),
      12,
    );
    expect(wheelZoomFactor(-0.1, DOM_DELTA_PAGE, false, 400)).toBeCloseTo(
      pixels(-40),
      12,
    );
  });

  it("reads a mode it does not know as pixels", () => {
    expect(wheelZoomFactor(-50, 7, false, VIEWPORT)).toBe(pixels(-50));
  });

  it("holds one event to 120 pixels, however big", () => {
    const limit = Math.exp(MAX_WHEEL_DELTA * WHEEL_ZOOM_RATE);

    expect(pixels(-120)).toBeCloseTo(limit, 12);
    expect(pixels(-5000)).toBeCloseTo(limit, 12);
    expect(pixels(5000)).toBeCloseTo(1 / limit, 12);
    // Lines and pages are clamped after they are turned into pixels.
    expect(wheelZoomFactor(-100, DOM_DELTA_LINE, false, VIEWPORT)).toBeCloseTo(
      limit,
      12,
    );
    expect(wheelZoomFactor(-3, DOM_DELTA_PAGE, false, VIEWPORT)).toBeCloseTo(
      limit,
      12,
    );
  });

  it("zooms harder with Control held, where a trackpad pinch arrives", () => {
    expect(pixels(-5, true)).toBeCloseTo(Math.exp(5 * CTRL_WHEEL_ZOOM_RATE), 12);
    expect(pixels(-5, true)).toBeGreaterThan(pixels(-5));
    expect(pixels(5, true)).toBeLessThan(pixels(5));
    expect(pixels(-5, true) * pixels(5, true)).toBeCloseTo(1, 12);
  });

  it("clamps a Control event to the same 120 pixels", () => {
    expect(pixels(-1000, true)).toBeCloseTo(
      Math.exp(MAX_WHEEL_DELTA * CTRL_WHEEL_ZOOM_RATE),
      12,
    );
  });

  it("asks for no change from a delta that is not a number", () => {
    expect(pixels(NaN)).toBe(1);
    expect(pixels(Infinity)).toBe(1);
    expect(wheelZoomFactor(-1, DOM_DELTA_PAGE, false, NaN)).toBe(1);
  });
});
