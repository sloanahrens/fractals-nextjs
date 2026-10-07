import { describe, expect, it } from "vitest";

import { getDefaultBounds } from "../mandelbrot";
import { ZoomPanManager } from "../zoomPan";

const BOUNDS = getDefaultBounds();

function createManager(): ZoomPanManager {
  return new ZoomPanManager(800, 600, BOUNDS);
}

describe("ZoomPanManager", () => {
  it("starts centred on the initial bounds at scale 1", () => {
    expect(createManager().getZoomState()).toEqual({
      centerX: -0.75,
      centerY: 0,
      scale: 1,
    });
  });
});

describe("zoom", () => {
  it("tightens the span by the zoom factor around the cursor", () => {
    const manager = createManager();
    const zoomed = manager.zoom(400, 300, 2, BOUNDS);

    expect(zoomed.maxReal - zoomed.minReal).toBeCloseTo(1.75, 12);
    expect(zoomed.maxImaginary - zoomed.minImaginary).toBeCloseTo(1.25, 12);
    // The cursor sat on the bounds centre, so the view stays centred there.
    expect((zoomed.minReal + zoomed.maxReal) / 2).toBeCloseTo(-0.75, 12);
    expect((zoomed.minImaginary + zoomed.maxImaginary) / 2).toBeCloseTo(0, 12);
    expect(manager.getZoomState().scale).toBe(2);
  });

  it("zooms towards the complex point under the cursor, not the centre", () => {
    const manager = createManager();
    // Pixel (0, 0) is the top-left corner: -2.5 - 1.25i.
    const zoomed = manager.zoom(0, 0, 2, BOUNDS);

    expect((zoomed.minReal + zoomed.maxReal) / 2).toBeCloseTo(-2.5, 12);
    expect((zoomed.minImaginary + zoomed.maxImaginary) / 2).toBeCloseTo(-1.25, 12);
  });

  it("widens the span when zooming out", () => {
    const manager = createManager();
    const zoomed = manager.zoom(400, 300, 0.5, BOUNDS);

    expect(zoomed.maxReal - zoomed.minReal).toBeCloseTo(7, 12);
    expect(manager.getZoomState().scale).toBe(0.5);
  });

  it("compounds the scale over successive zooms", () => {
    const manager = createManager();
    const first = manager.zoom(400, 300, 2, BOUNDS);
    const second = manager.zoom(400, 300, 3, first);

    expect(manager.getZoomState().scale).toBe(6);
    expect(second.maxReal - second.minReal).toBeCloseTo(3.5 / 6, 12);
  });

  it("converts the cursor with the current canvas size", () => {
    const manager = new ZoomPanManager(1600, 600, BOUNDS);
    // Pixel 800 is halfway across a 1600px canvas.
    const halfway = manager.zoom(800, 300, 1, BOUNDS);
    expect((halfway.minReal + halfway.maxReal) / 2).toBeCloseTo(-0.75, 12);

    manager.updateCanvasSize(800, 600);
    // The same pixel is now the right edge of an 800px canvas.
    const edge = manager.zoom(800, 300, 1, BOUNDS);
    expect((edge.minReal + edge.maxReal) / 2).toBeCloseTo(1.0, 12);
  });

  it("hands out a copy of the zoom state, not the live object", () => {
    const manager = createManager();
    const state = manager.getZoomState();
    state.scale = 99;
    state.centerX = 42;
    expect(manager.getZoomState()).toEqual({
      centerX: -0.75,
      centerY: 0,
      scale: 1,
    });
  });
});

describe("pan", () => {
  it("ignores drag updates before a pan has started", () => {
    const manager = createManager();
    expect(manager.isPanning()).toBe(false);
    expect(manager.updatePan(500, 300, BOUNDS)).toBeNull();
  });

  it("translates the bounds by the drag delta without changing the span", () => {
    const manager = createManager();
    manager.startPan(400, 300);
    expect(manager.isPanning()).toBe(true);

    const panned = manager.updatePan(500, 400, BOUNDS);
    expect(panned).not.toBeNull();
    // Dragging right and down pulls the visible region left and up.
    expect(panned!.minReal).toBeCloseTo(-2.5 - (100 / 800) * 3.5, 12);
    expect(panned!.maxReal).toBeCloseTo(1.0 - (100 / 800) * 3.5, 12);
    expect(panned!.minImaginary).toBeCloseTo(-1.25 - (100 / 600) * 2.5, 12);
    expect(panned!.maxImaginary).toBeCloseTo(1.25 - (100 / 600) * 2.5, 12);
    expect(panned!.maxReal - panned!.minReal).toBeCloseTo(3.5, 12);
    expect(panned!.maxImaginary - panned!.minImaginary).toBeCloseTo(2.5, 12);
  });

  it("measures each drag step from the previous position, not the start", () => {
    const manager = createManager();
    manager.startPan(400, 300);

    // updatePan translates the bounds it is handed, so the caller threads the
    // previous result through — the internal cursor is what accumulates.
    const first = manager.updatePan(500, 300, BOUNDS);
    const second = manager.updatePan(600, 300, first!);

    expect(first!.minReal).toBeCloseTo(-2.5 - (100 / 800) * 3.5, 12);
    expect(second!.minReal).toBeCloseTo(-2.5 - (200 / 800) * 3.5, 12);
  });

  it("carries the accumulated pan into the next zoom centre", () => {
    const manager = createManager();
    manager.startPan(400, 300);
    manager.updatePan(500, 300, BOUNDS);

    expect(manager.getZoomState().centerX).toBeCloseTo(-0.75 - (100 / 800) * 3.5, 12);
  });

  it("stops panning when the drag ends", () => {
    const manager = createManager();
    manager.startPan(400, 300);
    manager.endPan();

    expect(manager.isPanning()).toBe(false);
    expect(manager.updatePan(500, 300, BOUNDS)).toBeNull();
  });
});

describe("reset", () => {
  it("returns to the default view and clears any drag", () => {
    const manager = createManager();
    manager.zoom(100, 100, 4, BOUNDS);
    manager.startPan(10, 10);

    manager.reset(BOUNDS);

    expect(manager.getZoomState()).toEqual({
      centerX: -0.75,
      centerY: 0,
      scale: 1,
    });
    expect(manager.isPanning()).toBe(false);
  });
});
