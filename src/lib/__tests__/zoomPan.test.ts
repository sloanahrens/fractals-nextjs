import { describe, expect, it } from "vitest";

import {
  MIN_ZOOM,
  boundsToView,
  calculateZoomBounds,
  getDefaultBounds,
  pixelToComplex,
} from "../mandelbrot";
import type { FractalBounds } from "../../types/fractal";
import {
  CTRL_WHEEL_ZOOM_RATE,
  DOM_DELTA_LINE,
  MAX_WHEEL_DELTA,
  WHEEL_ZOOM_RATE,
} from "../wheelZoom";
import { ZoomPanManager } from "../zoomPan";

const BOUNDS = getDefaultBounds();
const DEEP_BOUNDS = calculateZoomBounds(-0.75, 0, 100);

// An 800x600 canvas displayed in a 400x300 box offset by (10, 20)
const HALF_SIZE = { left: 10, top: 20, width: 400, height: 300 };

function fakeTarget(): EventTarget {
  return {
    getBoundingClientRect: () => HALF_SIZE,
  } as unknown as EventTarget;
}

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

    expect(zoomed.maxReal - zoomed.minReal).toBeCloseTo(2, 12);
    expect(zoomed.maxImaginary - zoomed.minImaginary).toBeCloseTo(1.5, 12);
    // The cursor sat on the bounds centre, so the view stays centred there.
    expect((zoomed.minReal + zoomed.maxReal) / 2).toBeCloseTo(-0.75, 12);
    expect((zoomed.minImaginary + zoomed.maxImaginary) / 2).toBeCloseTo(0, 12);
    expect(manager.getZoomState().scale).toBe(2);
  });

  it("zooms towards the complex point under the cursor, not the centre", () => {
    const manager = createManager();
    // Pixel (0, 0) is the top-left corner: -2.75 - 1.5i.
    const zoomed = manager.zoom(0, 0, 2, BOUNDS);

    expect((zoomed.minReal + zoomed.maxReal) / 2).toBeCloseTo(-2.75, 12);
    expect((zoomed.minImaginary + zoomed.maxImaginary) / 2).toBeCloseTo(
      -1.5,
      12,
    );
  });

  it("widens the span when zooming out", () => {
    const manager = createManager();
    const zoomed = manager.zoom(400, 300, 0.5, BOUNDS);

    expect(zoomed.maxReal - zoomed.minReal).toBeCloseTo(8, 12);
    expect(manager.getZoomState().scale).toBe(0.5);
  });

  it("compounds the scale over successive zooms", () => {
    const manager = createManager();
    const first = manager.zoom(400, 300, 2, BOUNDS);
    const second = manager.zoom(400, 300, 3, first);

    expect(manager.getZoomState().scale).toBe(6);
    expect(second.maxReal - second.minReal).toBeCloseTo(4 / 6, 12);
  });

  it("converts the cursor with the current canvas size", () => {
    const manager = new ZoomPanManager(1600, 600, BOUNDS);
    // Pixel 800 is halfway across a 1600px canvas.
    const halfway = manager.zoom(800, 300, 1, BOUNDS);
    expect((halfway.minReal + halfway.maxReal) / 2).toBeCloseTo(-0.75, 12);

    manager.updateCanvasSize(800, 600);
    // The same pixel is now the right edge of an 800px canvas.
    const edge = manager.zoom(800, 300, 1, BOUNDS);
    expect((edge.minReal + edge.maxReal) / 2).toBeCloseTo(1.25, 12);
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
    expect(panned!.minReal).toBeCloseTo(-2.75 - (100 / 800) * 4, 12);
    expect(panned!.maxReal).toBeCloseTo(1.25 - (100 / 800) * 4, 12);
    expect(panned!.minImaginary).toBeCloseTo(-1.5 - (100 / 600) * 3, 12);
    expect(panned!.maxImaginary).toBeCloseTo(1.5 - (100 / 600) * 3, 12);
    expect(panned!.maxReal - panned!.minReal).toBeCloseTo(4, 12);
    expect(panned!.maxImaginary - panned!.minImaginary).toBeCloseTo(3, 12);
  });

  it("measures each drag step from the previous position, not the start", () => {
    const manager = createManager();
    manager.startPan(400, 300);

    // updatePan translates the bounds it is handed, so the caller threads the
    // previous result through — the internal cursor is what accumulates.
    const first = manager.updatePan(500, 300, BOUNDS);
    const second = manager.updatePan(600, 300, first!);

    expect(first!.minReal).toBeCloseTo(-2.75 - (100 / 800) * 4, 12);
    expect(second!.minReal).toBeCloseTo(-2.75 - (200 / 800) * 4, 12);
  });

  it("carries the accumulated pan into the next zoom centre", () => {
    const manager = createManager();
    manager.startPan(400, 300);
    manager.updatePan(500, 300, BOUNDS);

    expect(manager.getZoomState().centerX).toBeCloseTo(
      -0.75 - (100 / 800) * 4,
      12,
    );
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

  it("resets to the zoom of the bounds it is handed", () => {
    const manager = createManager();
    manager.zoom(100, 100, 4, BOUNDS);

    manager.reset(DEEP_BOUNDS);

    expect(manager.getZoomState().scale).toBeCloseTo(100, 12);
  });
});

describe("view tracking", () => {
  it("takes the zoom of the bounds it is built with", () => {
    const manager = new ZoomPanManager(800, 600, DEEP_BOUNDS);

    expect(manager.getZoomState().centerX).toBeCloseTo(-0.75, 12);
    expect(manager.getZoomState().scale).toBeCloseTo(100, 12);
  });

  it("zooms from the bounds it is handed, not from the last view it saw", () => {
    // A slider, preset or reset can move the view without going through the
    // manager. The bounds the caller passes are what count.
    const manager = createManager();
    manager.zoom(400, 300, 2, BOUNDS);

    const rezoomed = manager.zoom(400, 300, 1, DEEP_BOUNDS);

    expect(rezoomed.maxReal - rezoomed.minReal).toBeCloseTo(4 / 100, 12);
    expect(manager.getZoomState().scale).toBeCloseTo(100, 12);
  });
});

describe("handleWheel", () => {
  it("ignores a wheel event that carries no vertical movement", () => {
    const manager = createManager();
    let prevented = false;
    const event = {
      clientX: 400,
      clientY: 300,
      deltaY: 0,
      target: fakeTarget(),
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as WheelEvent;

    // A horizontal trackpad swipe is a scroll, so the page keeps it.
    expect(manager.handleWheel(event, BOUNDS)).toBeNull();
    expect(prevented).toBe(false);
  });

  function wheel(deltaY: number, extra: Record<string, unknown> = {}) {
    const state = { prevented: false };
    const event = {
      clientX: 210,
      clientY: 170,
      deltaY,
      target: fakeTarget(),
      preventDefault: () => {
        state.prevented = true;
      },
      ...extra,
    } as unknown as WheelEvent;
    return { event, state };
  }

  const widthOf = (bounds: FractalBounds) => bounds.maxReal - bounds.minReal;

  it("zooms a 100-unit notch by about 1.17x", () => {
    const manager = createManager();

    const zoomed = manager.handleWheel(wheel(-100).event, BOUNDS)!;

    expect(widthOf(BOUNDS) / widthOf(zoomed)).toBeCloseTo(
      Math.exp(100 * WHEEL_ZOOM_RATE),
      12,
    );
    expect(widthOf(BOUNDS) / widthOf(zoomed)).toBeGreaterThan(1.1);
    expect(widthOf(BOUNDS) / widthOf(zoomed)).toBeLessThan(1.25);
  });

  it("zooms a light trackpad swipe of 30 small events by under 1.2x in all", () => {
    const manager = createManager();
    let bounds = BOUNDS;

    for (let i = 0; i < 30; i++) {
      bounds = manager.handleWheel(wheel(-3).event, bounds)!;
    }

    expect(widthOf(BOUNDS) / widthOf(bounds)).toBeLessThan(1.2);
    expect(widthOf(BOUNDS) / widthOf(bounds)).toBeGreaterThan(1);
  });

  it("returns to the original bounds when zoomed in then out by the same events", () => {
    const manager = createManager();
    const deltas = [-3, -40, -100, -7, -120];
    let bounds = BOUNDS;

    for (const delta of deltas) {
      bounds = manager.handleWheel(wheel(delta).event, bounds)!;
    }
    for (const delta of [...deltas].reverse()) {
      bounds = manager.handleWheel(wheel(-delta).event, bounds)!;
    }

    expect(bounds.minReal).toBeCloseTo(BOUNDS.minReal, 12);
    expect(bounds.maxReal).toBeCloseTo(BOUNDS.maxReal, 12);
    expect(bounds.minImaginary).toBeCloseTo(BOUNDS.minImaginary, 12);
    expect(bounds.maxImaginary).toBeCloseTo(BOUNDS.maxImaginary, 12);
  });

  it("still centres the zoom on the complex point under the cursor", () => {
    const manager = createManager();
    // (110, 95) in the half-size box is canvas pixel (200, 150), off centre.
    const { event } = wheel(-100, { clientX: 110, clientY: 95 });
    const target = pixelToComplex(200, 150, 800, 600, BOUNDS);

    const zoomed = manager.handleWheel(event, BOUNDS)!;

    expect((zoomed.minReal + zoomed.maxReal) / 2).toBeCloseTo(target.real, 12);
    expect((zoomed.minImaginary + zoomed.maxImaginary) / 2).toBeCloseTo(
      target.imaginary,
      12,
    );
  });

  it("reads a line-mode wheel as 16 pixels a line", () => {
    const manager = createManager();

    const lines = manager.handleWheel(
      wheel(-3, { deltaMode: DOM_DELTA_LINE }).event,
      BOUNDS,
    )!;
    const pixels = manager.handleWheel(wheel(-48).event, BOUNDS)!;

    expect(widthOf(lines)).toBeCloseTo(widthOf(pixels), 12);
  });

  it("prevents a Control+wheel event and zooms it with the larger rate", () => {
    const manager = createManager();
    const plain = wheel(-5);
    const pinch = wheel(-5, { ctrlKey: true });

    const plainZoom = manager.handleWheel(plain.event, BOUNDS)!;
    const pinchZoom = manager.handleWheel(pinch.event, BOUNDS)!;

    expect(pinch.state.prevented).toBe(true);
    expect(widthOf(BOUNDS) / widthOf(pinchZoom)).toBeCloseTo(
      Math.exp(5 * CTRL_WHEEL_ZOOM_RATE),
      12,
    );
    expect(widthOf(pinchZoom)).toBeLessThan(widthOf(plainZoom));
  });

  it("holds an enormous event to the per-event clamp", () => {
    const manager = createManager();

    const zoomed = manager.handleWheel(wheel(-100000).event, BOUNDS)!;

    expect(widthOf(BOUNDS) / widthOf(zoomed)).toBeCloseTo(
      Math.exp(MAX_WHEEL_DELTA * WHEEL_ZOOM_RATE),
      12,
    );
  });
});

describe("pointer events on a canvas CSS has resized", () => {
  it("maps a wheel position onto the canvas", () => {
    const manager = createManager();
    const event = {
      clientX: 210,
      clientY: 170,
      deltaY: -100,
      target: fakeTarget(),
      preventDefault: () => {},
    } as unknown as WheelEvent;

    const zoomed = manager.handleWheel(event, BOUNDS);

    // (210, 170) is the middle of the box, so it is the middle of the canvas.
    expect((zoomed!.minReal + zoomed!.maxReal) / 2).toBeCloseTo(-0.75, 12);
    expect((zoomed!.minImaginary + zoomed!.maxImaginary) / 2).toBeCloseTo(
      0,
      12,
    );
  });

  it("maps a mouse drag onto the canvas", () => {
    const manager = createManager();
    const target = fakeTarget();

    manager.handleMouseDown({
      clientX: 10,
      clientY: 20,
      target,
    } as unknown as MouseEvent);
    const panned = manager.handleMouseMove(
      { clientX: 210, clientY: 20, target } as unknown as MouseEvent,
      BOUNDS,
    );

    // 200px across the box is half the canvas, so the view moves half a span.
    expect(panned!.minReal).toBeCloseTo(-2.75 - (400 / 800) * 4, 12);
    expect(panned!.maxReal - panned!.minReal).toBeCloseTo(4, 12);
  });

  it("maps a touch drag onto the canvas", () => {
    const manager = createManager();
    const target = fakeTarget();

    manager.handleTouchStart({
      touches: [{ clientX: 10, clientY: 20 }],
      target,
    } as unknown as TouchEvent);
    const panned = manager.handleTouchMove(
      {
        touches: [{ clientX: 10, clientY: 170 }],
        target,
        preventDefault: () => {},
      } as unknown as TouchEvent,
      BOUNDS,
    );

    // 150px down the box is the full height of the canvas.
    expect(panned!.minImaginary).toBeCloseTo(-1.5 - (300 / 600) * 3, 12);
  });
});

describe("pinch", () => {
  // The box is the canvas at half size offset by (10, 20): client (x, y) is
  // canvas pixel (2(x - 10), 2(y - 20)).
  const touchEvent = (
    touches: Array<[number, number]>,
    extra: Record<string, unknown> = {},
  ) =>
    ({
      touches: touches.map(([clientX, clientY]) => ({ clientX, clientY })),
      target: fakeTarget(),
      preventDefault: () => {},
      ...extra,
    }) as unknown as TouchEvent;

  // Two fingers 100 CSS px (200 canvas px) apart about the box's middle,
  // client (210, 170), which is the canvas's middle.
  const START: Array<[number, number]> = [
    [160, 170],
    [260, 170],
  ];

  it("starts a pinch on a second finger and drops the pan it replaces", () => {
    const manager = createManager();

    manager.handleTouchStart(touchEvent([[160, 170]]));
    expect(manager.isPanning()).toBe(true);
    expect(manager.isPinching()).toBe(false);

    manager.handleTouchStart(touchEvent(START));

    expect(manager.isPinching()).toBe(true);
    expect(manager.isPanning()).toBe(false);
  });

  it("starts a pinch from two fingers that land together", () => {
    const manager = createManager();

    manager.handleTouchStart(touchEvent(START));

    expect(manager.isPinching()).toBe(true);
    expect(manager.isPanning()).toBe(false);
  });

  it("zooms in as the fingers move apart, about their midpoint", () => {
    const manager = createManager();
    manager.handleTouchStart(touchEvent(START));

    const zoomed = manager.handleTouchMove(
      touchEvent([
        [110, 170],
        [310, 170],
      ]),
      BOUNDS,
    );

    // The gap doubled, the midpoint did not move: zoom 2 about the centre.
    expect(zoomed).not.toBeNull();
    expect(boundsToView(zoomed!).scale).toBeCloseTo(2, 12);
    expect((zoomed!.minReal + zoomed!.maxReal) / 2).toBeCloseTo(-0.75, 12);
    expect((zoomed!.minImaginary + zoomed!.maxImaginary) / 2).toBeCloseTo(
      0,
      12,
    );
    expect(manager.getZoomState().scale).toBeCloseTo(2, 12);
  });

  it("zooms out as the fingers close", () => {
    const manager = createManager();
    manager.handleTouchStart(touchEvent(START));

    const zoomed = manager.handleTouchMove(
      touchEvent([
        [185, 170],
        [235, 170],
      ]),
      DEEP_BOUNDS,
    );

    expect(boundsToView(zoomed!).scale).toBeCloseTo(50, 9);
  });

  it("keeps the picture under the midpoint as the fingers travel", () => {
    const manager = createManager();
    manager.handleTouchStart(touchEvent(START));

    // Same gap, both fingers 50 CSS px (100 canvas px) to the right.
    const panned = manager.handleTouchMove(
      touchEvent([
        [210, 170],
        [310, 170],
      ]),
      BOUNDS,
    );

    expect(boundsToView(panned!).scale).toBeCloseTo(1, 12);
    expect(panned!.minReal).toBeCloseTo(-2.75 - (100 / 800) * 4, 12);
  });

  it("measures each step from the one before, not from the start", () => {
    const manager = createManager();
    manager.handleTouchStart(touchEvent(START));

    const first = manager.handleTouchMove(
      touchEvent([
        [135, 170],
        [285, 170],
      ]),
      BOUNDS,
    );
    const second = manager.handleTouchMove(
      touchEvent([
        [110, 170],
        [310, 170],
      ]),
      first!,
    );

    // 100 -> 150 -> 200 CSS px: 1.5 then 4/3, which compound to 2.
    expect(boundsToView(first!).scale).toBeCloseTo(1.5, 12);
    expect(boundsToView(second!).scale).toBeCloseTo(2, 12);
  });

  it("stays at the zoom limits while the fingers keep going", () => {
    const manager = createManager();
    manager.handleTouchStart(touchEvent(START));

    const out = manager.handleTouchMove(
      touchEvent([
        [195, 170],
        [225, 170],
      ]),
      BOUNDS,
    );

    expect(boundsToView(out!).scale).toBeCloseTo(MIN_ZOOM, 12);
  });

  it("does not move the view for fingers that sit on one point", () => {
    const manager = createManager();
    manager.handleTouchStart(touchEvent(START));

    const together = manager.handleTouchMove(
      touchEvent([
        [210, 170],
        [210, 170],
      ]),
      DEEP_BOUNDS,
    );
    // A zero gap asks for no zoom, and the next step starts over from it.
    expect(boundsToView(together!).scale).toBeCloseTo(100, 9);
    expect(Number.isFinite(together!.minReal)).toBe(true);

    const apart = manager.handleTouchMove(
      touchEvent([
        [160, 170],
        [260, 170],
      ]),
      together!,
    );
    expect(boundsToView(apart!).scale).toBeCloseTo(100, 9);
  });

  it("takes a move with no start as its baseline instead of jumping", () => {
    const manager = createManager();

    const first = manager.handleTouchMove(touchEvent(START), BOUNDS);
    expect(first).toBeNull();

    const second = manager.handleTouchMove(
      touchEvent([
        [110, 170],
        [310, 170],
      ]),
      BOUNDS,
    );
    expect(boundsToView(second!).scale).toBeCloseTo(2, 12);
  });

  it("hands over to a pan from the finger that stays, without a jump", () => {
    const manager = createManager();
    manager.handleTouchStart(touchEvent(START));
    const zoomed = manager.handleTouchMove(
      touchEvent([
        [110, 170],
        [310, 170],
      ]),
      BOUNDS,
    )!;

    // The right-hand finger lifts; the left one is still down at (110, 170).
    manager.handleTouchEnd(touchEvent([[110, 170]]));

    expect(manager.isPinching()).toBe(false);
    expect(manager.isPanning()).toBe(true);

    // It has not moved, so neither has the view.
    const still = manager.handleTouchMove(touchEvent([[110, 170]]), zoomed);
    expect(still!.minReal).toBeCloseTo(zoomed.minReal, 12);
    expect(still!.maxReal).toBeCloseTo(zoomed.maxReal, 12);

    // And when it does move it pans, at the zoom the pinch left.
    const panned = manager.handleTouchMove(touchEvent([[160, 170]]), zoomed);
    expect(boundsToView(panned!).scale).toBeCloseTo(2, 12);
    expect(panned!.minReal).toBeCloseTo(
      zoomed.minReal - (100 / 800) * (zoomed.maxReal - zoomed.minReal),
      12,
    );
  });

  it("measures a fresh pair when one of three fingers lifts", () => {
    const manager = createManager();
    manager.handleTouchStart(touchEvent(START));
    manager.handleTouchEnd(
      touchEvent([
        [310, 170],
        [110, 170],
      ]),
    );

    expect(manager.isPinching()).toBe(true);
    const next = manager.handleTouchMove(
      touchEvent([
        [310, 170],
        [110, 170],
      ]),
      BOUNDS,
    );
    // The pair now is 200 CSS px apart and has not moved since it was
    // measured, so the first step changes nothing.
    expect(boundsToView(next!).scale).toBeCloseTo(1, 12);
  });

  it("ends everything when the last finger lifts or the touch is cancelled", () => {
    const manager = createManager();
    manager.handleTouchStart(touchEvent(START));
    manager.handleTouchEnd(touchEvent([]));
    expect(manager.isPinching()).toBe(false);
    expect(manager.isPanning()).toBe(false);

    manager.handleTouchStart(touchEvent(START));
    manager.handleTouchEnd();
    expect(manager.isPinching()).toBe(false);
    expect(manager.isPanning()).toBe(false);
  });

  it("does not pan from a finger that was never ours when a pinch is not running", () => {
    const manager = createManager();

    // A touchend with a finger still down but no pinch behind it ends the pan
    // rather than starting one from a finger that is somewhere else.
    manager.handleTouchStart(touchEvent([[160, 170]]));
    manager.handleTouchEnd(touchEvent([[300, 300]]));

    expect(manager.isPanning()).toBe(false);
  });

  it("forgets a pinch when the view is reset", () => {
    const manager = createManager();
    manager.handleTouchStart(touchEvent(START));

    manager.reset(BOUNDS);

    expect(manager.isPinching()).toBe(false);
  });
});
