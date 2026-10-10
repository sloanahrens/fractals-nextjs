import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FractalBounds, ZoomState } from "../../types/fractal";
import {
  attachCanvasNavigation,
  describeBounds,
  keyNavigationBounds,
  WHEEL_GESTURE_QUIET_MS,
} from "../canvasNavigation";
import {
  BASE_WIDTH,
  boundsToView,
  calculateZoomBounds,
  getDefaultBounds,
} from "../mandelbrot";
import { calculateZoomLevel, getPresetById } from "../presets";
import { wheelZoomFactor } from "../wheelZoom";
import { ZoomPanManager } from "../zoomPan";

const BOUNDS = getDefaultBounds();
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
/** The zoom one 100-unit wheel notch asks for. */
const NOTCH = wheelZoomFactor(-100, 0, false, 0);

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const FULL_SIZE_RECT: Rect = {
  left: 0,
  top: 0,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
};

/**
 * A stand-in for a canvas that records the listeners registered on it and can
 * dispatch a synthetic event to them, so the wiring can be driven without a
 * browser. Pointer events carry a `preventDefault` spy and the canvas itself
 * as `target`, the way a real event does.
 */
function createFakeCanvas(rect: Rect) {
  const handlers = new Map<string, (event: unknown) => void>();
  const configurations = new Map<string, AddEventListenerOptions | undefined>();

  const element = {
    getBoundingClientRect: () => rect,
    addEventListener: (
      type: string,
      handler: (event: unknown) => void,
      configuration?: AddEventListenerOptions,
    ) => {
      handlers.set(type, handler);
      configurations.set(type, configuration);
    },
    removeEventListener: (type: string) => {
      handlers.delete(type);
      configurations.delete(type);
    },
  };

  return {
    element: element as unknown as HTMLCanvasElement,
    listens: (type: string) => handlers.has(type),
    configuration: (type: string) => configurations.get(type),
    dispatch(type: string, event: Record<string, unknown> = {}) {
      const handler = handlers.get(type);
      if (!handler) {
        throw new Error(`no listener registered for ${type}`);
      }

      let prevented = false;
      handler({
        target: element,
        preventDefault: () => {
          prevented = true;
        },
        ...event,
      });

      return { prevented };
    },
  };
}

const touchAt = (clientX: number, clientY: number) => ({ clientX, clientY });

/**
 * The canvas wired the way the page wires it: an 800x600 canvas, an on-screen
 * box that CSS may have resized, and the reported view fed back as the bounds
 * the next gesture starts from. Gesture boundaries are recorded as "start" and
 * "end" so a test can read them off in order.
 *
 * `acceptZoom` stands in for what the page does with the zoom it is handed
 * before it rebuilds its bounds: it clamps it into the range its controls
 * offer. Leave it out to measure the manager on its own.
 */
function createHarness(
  rect: Rect = FULL_SIZE_RECT,
  initial: FractalBounds = BOUNDS,
  acceptZoom: (scale: number) => number = (scale) => scale,
) {
  const canvas = createFakeCanvas(rect);
  const manager = new ZoomPanManager(CANVAS_WIDTH, CANVAS_HEIGHT, initial);
  const views: ZoomState[] = [];
  const gestures: string[] = [];
  let bounds: FractalBounds = initial;

  const detach = attachCanvasNavigation(
    canvas.element,
    manager,
    () => bounds,
    (view) => {
      views.push(view);
      bounds = calculateZoomBounds(
        view.centerX,
        view.centerY,
        acceptZoom(view.scale),
      );
    },
    {
      onGestureStart: () => gestures.push("start"),
      onGestureEnd: () => gestures.push("end"),
    },
  );

  return {
    canvas,
    manager,
    views,
    gestures,
    detach,
    /** The bounds the page is showing after the last gesture step. */
    current: () => bounds,
  };
}

/**
 * What `src/app/FractalExplorer.tsx` does with the zoom a gesture reports: the zoom level
 * runs from the full view to the deepest zoom the sliders offer.
 */
const pageZoom = (scale: number) => Math.min(10000, Math.max(1, scale));

describe("attachCanvasNavigation", () => {
  it("zooms at the wheel cursor and reports the view it produced", () => {
    const { canvas, views } = createHarness();

    const { prevented } = canvas.dispatch("wheel", {
      clientX: 400,
      clientY: 300,
      deltaY: -100,
    });

    expect(prevented).toBe(true);
    // The cursor sat on the centre of the canvas, so the zoom in stays centred
    // on the default view and only tightens the span.
    expect(views).toHaveLength(1);
    expect(views[0].centerX).toBeCloseTo(-0.75, 12);
    expect(views[0].centerY).toBeCloseTo(0, 12);
    expect(views[0].scale).toBeCloseTo(NOTCH, 12);
  });

  it("leaves a wheel event with no vertical movement to the page", () => {
    const { canvas, views } = createHarness();

    const { prevented } = canvas.dispatch("wheel", {
      clientX: 400,
      clientY: 300,
      deltaY: 0,
    });

    expect(prevented).toBe(false);
    expect(views).toHaveLength(0);
  });

  it("scales the cursor through the canvas's on-screen box", () => {
    // An 800x600 canvas shown in a 400x300 box offset by (10, 20): the middle
    // of the box is the middle of the canvas, not its bottom-right quadrant.
    const { canvas, views } = createHarness({
      left: 10,
      top: 20,
      width: 400,
      height: 300,
    });

    canvas.dispatch("wheel", { clientX: 210, clientY: 170, deltaY: -100 });

    expect(views[0].centerX).toBeCloseTo(-0.75, 12);
    expect(views[0].centerY).toBeCloseTo(0, 12);
  });

  it("pans while the primary button drags", () => {
    const { canvas, views } = createHarness();

    canvas.dispatch("mousedown", { clientX: 400, clientY: 300, button: 0 });
    canvas.dispatch("mousemove", { clientX: 500, clientY: 300 });

    expect(views).toHaveLength(1);
    // Dragging 100px right pulls the view 100/800 of its 4-wide span left.
    expect(views[0].centerX).toBeCloseTo(-0.75 - (100 / 800) * 4, 12);
    expect(views[0].centerY).toBeCloseTo(0, 12);
    expect(views[0].scale).toBeCloseTo(1, 12);
  });

  it("threads each move through the view it just reported", () => {
    const { canvas, views } = createHarness();

    canvas.dispatch("mousedown", { clientX: 400, clientY: 300, button: 0 });
    canvas.dispatch("mousemove", { clientX: 500, clientY: 300 });
    canvas.dispatch("mousemove", { clientX: 600, clientY: 300 });

    // The second step continues from the view the first one reported, so the
    // drag accumulates instead of snapping back to the bounds it started on.
    expect(views[1].centerX).toBeCloseTo(-0.75 - (200 / 800) * 4, 12);
    expect(views[1].scale).toBeCloseTo(1, 12);
  });

  it("reports nothing for a move that is not part of a drag", () => {
    const { canvas, views } = createHarness();

    canvas.dispatch("mousemove", { clientX: 500, clientY: 300 });

    expect(views).toHaveLength(0);
  });

  it("ignores a drag started with a non-primary button", () => {
    const { canvas, views } = createHarness();

    canvas.dispatch("mousedown", { clientX: 400, clientY: 300, button: 2 });
    canvas.dispatch("mousemove", { clientX: 500, clientY: 300 });

    expect(views).toHaveLength(0);
  });

  it("ends the drag when the pointer leaves the canvas", () => {
    const { canvas, manager, views } = createHarness();

    canvas.dispatch("mousedown", { clientX: 400, clientY: 300, button: 0 });
    canvas.dispatch("mouseleave");
    canvas.dispatch("mousemove", { clientX: 500, clientY: 300 });

    expect(manager.isPanning()).toBe(false);
    expect(views).toHaveLength(0);
  });

  it("pans on a single-finger drag", () => {
    const { canvas, views } = createHarness();

    canvas.dispatch("touchstart", { touches: [touchAt(400, 300)] });
    const { prevented } = canvas.dispatch("touchmove", {
      touches: [touchAt(400, 450)],
    });

    expect(prevented).toBe(true);
    // 150px down a 600px canvas pulls the view 150/600 of its 3-tall span up.
    expect(views).toHaveLength(1);
    expect(views[0].centerX).toBeCloseTo(-0.75, 12);
    expect(views[0].centerY).toBeCloseTo(-(150 / 600) * 3, 12);
  });

  it("zooms in as two fingers move apart, about their midpoint", () => {
    const { canvas, views } = createHarness();

    canvas.dispatch("touchstart", {
      touches: [touchAt(300, 300), touchAt(500, 300)],
    });
    const { prevented } = canvas.dispatch("touchmove", {
      touches: [touchAt(200, 300), touchAt(600, 300)],
    });

    // The page does not zoom or scroll under the fingers.
    expect(prevented).toBe(true);
    expect(views).toHaveLength(1);
    expect(views[0].scale).toBeCloseTo(2, 12);
    expect(views[0].centerX).toBeCloseTo(-0.75, 12);
    expect(views[0].centerY).toBeCloseTo(0, 12);
  });

  it("zooms out as two fingers close, within the zoom limits", () => {
    const start = calculateZoomBounds(-0.75, 0, 8);
    const { canvas, views } = createHarness(FULL_SIZE_RECT, start, pageZoom);

    canvas.dispatch("touchstart", {
      touches: [touchAt(200, 300), touchAt(600, 300)],
    });
    canvas.dispatch("touchmove", {
      touches: [touchAt(350, 300), touchAt(450, 300)],
    });
    expect(views[0].scale).toBeCloseTo(2, 12);

    // Closing the fingers past the widest view stops at the widest view.
    canvas.dispatch("touchmove", {
      touches: [touchAt(399, 300), touchAt(401, 300)],
    });
    expect(views[1].scale).toBeCloseTo(1, 12);
  });

  it("keeps the picture under the midpoint of the fingers", () => {
    const start = calculateZoomBounds(-0.7453, 0.1127, 20);
    const { canvas, current } = createHarness(FULL_SIZE_RECT, start, pageZoom);
    const at = (x: number, y: number) => {
      const bounds = current();
      return {
        real:
          bounds.minReal + (x / CANVAS_WIDTH) * (bounds.maxReal - bounds.minReal),
        imaginary:
          bounds.minImaginary +
          (y / CANVAS_HEIGHT) * (bounds.maxImaginary - bounds.minImaginary),
      };
    };

    canvas.dispatch("touchstart", {
      touches: [touchAt(500, 200), touchAt(700, 400)],
    });
    // The point under the midpoint (600, 300) is the one to follow.
    const anchored = at(600, 300);
    canvas.dispatch("touchmove", {
      touches: [touchAt(450, 150), touchAt(750, 450)],
    });

    const after = at(600, 300);
    expect(after.real).toBeCloseTo(anchored.real, 12);
    expect(after.imaginary).toBeCloseTo(anchored.imaginary, 12);
  });

  it("also pans as the pair of fingers travels together", () => {
    const { canvas, views } = createHarness();

    canvas.dispatch("touchstart", {
      touches: [touchAt(300, 300), touchAt(500, 300)],
    });
    canvas.dispatch("touchmove", {
      touches: [touchAt(400, 300), touchAt(600, 300)],
    });

    expect(views[0].scale).toBeCloseTo(1, 12);
    expect(views[0].centerX).toBeCloseTo(-0.75 - (100 / 800) * 4, 12);
  });

  it("reports a pinch as one gesture and nothing before its fingers are up", () => {
    const { canvas, gestures } = createHarness();

    canvas.dispatch("touchstart", {
      touches: [touchAt(300, 300), touchAt(500, 300)],
    });
    canvas.dispatch("touchmove", {
      touches: [touchAt(250, 300), touchAt(550, 300)],
    });
    canvas.dispatch("touchmove", {
      touches: [touchAt(200, 300), touchAt(600, 300)],
    });
    expect(gestures).toEqual(["start"]);

    canvas.dispatch("touchend", { touches: [] });
    expect(gestures).toEqual(["start", "end"]);
  });

  it("keeps one gesture when a second finger lands on a pan", () => {
    const { canvas, gestures } = createHarness();

    canvas.dispatch("touchstart", { touches: [touchAt(300, 300)] });
    canvas.dispatch("touchstart", {
      touches: [touchAt(300, 300), touchAt(500, 300)],
    });
    canvas.dispatch("touchend", { touches: [] });

    expect(gestures).toEqual(["start", "end"]);
  });

  it("hands over to a pan when one finger of a pinch lifts", () => {
    const { canvas, gestures, views } = createHarness();

    canvas.dispatch("touchstart", {
      touches: [touchAt(300, 300), touchAt(500, 300)],
    });
    canvas.dispatch("touchmove", {
      touches: [touchAt(200, 300), touchAt(600, 300)],
    });
    const zoomed = views[views.length - 1];

    // One finger lifts; the one that stays is at (200, 300).
    canvas.dispatch("touchend", { touches: [touchAt(200, 300)] });
    // The gesture is still going: only the last finger ends it.
    expect(gestures).toEqual(["start"]);

    const { prevented } = canvas.dispatch("touchmove", {
      touches: [touchAt(200, 300)],
    });
    const still = views[views.length - 1];
    expect(prevented).toBe(true);
    // No jump: the finger has not moved, so the view is where the pinch left it.
    expect(still.centerX).toBeCloseTo(zoomed.centerX, 12);
    expect(still.centerY).toBeCloseTo(zoomed.centerY, 12);
    expect(still.scale).toBeCloseTo(zoomed.scale, 12);

    // Moving it pans, at the zoom the pinch reached.
    canvas.dispatch("touchmove", { touches: [touchAt(300, 300)] });
    const panned = views[views.length - 1];
    expect(panned.scale).toBeCloseTo(zoomed.scale, 12);
    expect(panned.centerX).toBeCloseTo(
      zoomed.centerX - (100 / 800) * (4 / zoomed.scale),
      12,
    );

    canvas.dispatch("touchend", { touches: [] });
    expect(gestures).toEqual(["start", "end"]);
  });

  it("ends the gesture once when a pinch is cancelled", () => {
    const { canvas, gestures, manager } = createHarness();

    canvas.dispatch("touchstart", {
      touches: [touchAt(300, 300), touchAt(500, 300)],
    });
    // A cancel can still list fingers; none of them is ours any more.
    canvas.dispatch("touchcancel", { touches: [touchAt(300, 300)] });
    canvas.dispatch("touchend", { touches: [] });

    expect(gestures).toEqual(["start", "end"]);
    expect(manager.isPinching()).toBe(false);
    expect(manager.isPanning()).toBe(false);
  });

  it("starts a new gesture for a touch after the last one ended", () => {
    const { canvas, gestures } = createHarness();

    canvas.dispatch("touchstart", {
      touches: [touchAt(300, 300), touchAt(500, 300)],
    });
    canvas.dispatch("touchend", { touches: [] });
    canvas.dispatch("touchstart", { touches: [touchAt(400, 300)] });
    canvas.dispatch("touchend", { touches: [] });

    expect(gestures).toEqual(["start", "end", "start", "end"]);
  });

  it("does not take a one-finger move for a reason to block the page", () => {
    const { canvas } = createHarness();

    // One finger with no touch behind it is not ours, so nothing is prevented.
    const { prevented } = canvas.dispatch("touchmove", {
      touches: [touchAt(400, 300)],
    });

    expect(prevented).toBe(false);
  });

  it("listens for the two gestures it has to cancel as non-passive", () => {
    const { canvas } = createHarness();

    // Both handlers call preventDefault to keep the page from scrolling under
    // the gesture, which a passive listener is not allowed to do.
    expect(canvas.configuration("wheel")).toEqual({ passive: false });
    expect(canvas.configuration("touchmove")).toEqual({ passive: false });
  });

  it("stops listening once detached", () => {
    const { canvas, views, detach } = createHarness();

    detach();

    expect(canvas.listens("wheel")).toBe(false);
    expect(canvas.listens("mousedown")).toBe(false);
    expect(canvas.listens("mousemove")).toBe(false);
    expect(canvas.listens("touchmove")).toBe(false);
    expect(() =>
      canvas.dispatch("wheel", { clientX: 400, clientY: 300, deltaY: -100 }),
    ).toThrow(/no listener/);
    expect(views).toHaveLength(0);
  });

  it("reports a drag as one gesture from mousedown to mouseup", () => {
    const { canvas, gestures } = createHarness();

    canvas.dispatch("mousedown", { clientX: 400, clientY: 300, button: 0 });
    canvas.dispatch("mousemove", { clientX: 450, clientY: 300 });
    canvas.dispatch("mousemove", { clientX: 500, clientY: 300 });
    canvas.dispatch("mouseup");

    // The moves in between stay inside the one gesture, so the caller can
    // redraw cheaply for all of them and pay for a full render only once.
    expect(gestures).toEqual(["start", "end"]);
  });

  it("does not report a gesture for a mouseup with no drag behind it", () => {
    const { canvas, gestures } = createHarness();

    canvas.dispatch("mouseup");
    canvas.dispatch("mouseleave");
    // A drag with the secondary button is not ours either.
    canvas.dispatch("mousedown", { clientX: 400, clientY: 300, button: 2 });
    canvas.dispatch("mouseup");

    expect(gestures).toEqual([]);
  });

  it("reports a drag that leaves the canvas as finished", () => {
    const { canvas, gestures } = createHarness();

    canvas.dispatch("mousedown", { clientX: 400, clientY: 300, button: 0 });
    canvas.dispatch("mouseleave");

    expect(gestures).toEqual(["start", "end"]);
  });

  it("reports a single-finger touch drag as one gesture", () => {
    const { canvas, gestures } = createHarness();

    canvas.dispatch("touchstart", { touches: [touchAt(400, 300)] });
    canvas.dispatch("touchmove", { touches: [touchAt(400, 400)] });
    canvas.dispatch("touchend", { touches: [] });

    expect(gestures).toEqual(["start", "end"]);
  });

  describe("wheel", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("holds one gesture open across a burst of notches", () => {
      const { canvas, gestures } = createHarness();

      canvas.dispatch("wheel", { clientX: 400, clientY: 300, deltaY: -100 });
      canvas.dispatch("wheel", { clientX: 400, clientY: 300, deltaY: -100 });
      vi.advanceTimersByTime(WHEEL_GESTURE_QUIET_MS - 1);
      canvas.dispatch("wheel", { clientX: 400, clientY: 300, deltaY: -100 });

      // Still the same gesture: each notch restarts the quiet period.
      expect(gestures).toEqual(["start"]);

      vi.advanceTimersByTime(WHEEL_GESTURE_QUIET_MS);
      expect(gestures).toEqual(["start", "end"]);
    });

    it("opens a fresh gesture after the previous one closed", () => {
      const { canvas, gestures } = createHarness();

      canvas.dispatch("wheel", { clientX: 400, clientY: 300, deltaY: -100 });
      vi.advanceTimersByTime(WHEEL_GESTURE_QUIET_MS);
      canvas.dispatch("wheel", { clientX: 400, clientY: 300, deltaY: -100 });

      expect(gestures).toEqual(["start", "end", "start"]);
    });

    it("leaves a wheel that is not a zoom out of the reporting", () => {
      const { canvas, gestures } = createHarness();

      canvas.dispatch("wheel", { clientX: 400, clientY: 300, deltaY: 0 });
      vi.advanceTimersByTime(WHEEL_GESTURE_QUIET_MS);

      expect(gestures).toEqual([]);
    });

    it("drops the pending end of a gesture when it stops listening", () => {
      const { canvas, gestures, detach } = createHarness();

      canvas.dispatch("wheel", { clientX: 400, clientY: 300, deltaY: -100 });
      detach();
      vi.advanceTimersByTime(WHEEL_GESTURE_QUIET_MS);

      expect(gestures).toEqual(["start"]);
    });
  });

  describe("the zoom a wheel gesture leaves behind", () => {
    it("compounds every notch of a burst from the preset it started on", () => {
      // The Overview preset frames the whole set and is the widest view the
      // app offers, so it is where a zoom floor bites.
      const start = getPresetById("overview")!.bounds;
      const startWidth = start.maxReal - start.minReal;
      const notches = 5;
      const harness = createHarness(FULL_SIZE_RECT, start, pageZoom);

      for (let i = 0; i < notches; i++) {
        harness.canvas.dispatch("wheel", {
          clientX: 480,
          clientY: 300,
          deltaY: -100,
        });
      }

      // Every notch counts: one the page's zoom floor swallows leaves the view
      // wider than this, because the burst as a whole is what the gesture was.
      const view = harness.current();
      const width = view.maxReal - view.minReal;
      expect(width).toBeCloseTo(startWidth / NOTCH ** notches, 9);

      // And the zoom level the readout shows is the width ratio of that view.
      expect(calculateZoomLevel(view)).toBeCloseTo(BASE_WIDTH / width, 9);
    });

    it("leaves the same ratio behind from the default view", () => {
      const start = getDefaultBounds();
      const startWidth = start.maxReal - start.minReal;
      const notches = 3;
      const harness = createHarness(FULL_SIZE_RECT, start, pageZoom);

      for (let i = 0; i < notches; i++) {
        harness.canvas.dispatch("wheel", {
          clientX: 400,
          clientY: 300,
          deltaY: -100,
        });
      }

      const view = harness.current();
      const width = view.maxReal - view.minReal;
      expect(width).toBeCloseTo(startWidth / NOTCH ** notches, 9);
      expect(calculateZoomLevel(view)).toBeCloseTo(BASE_WIDTH / width, 9);
    });
  });
});

describe("keyNavigationBounds", () => {
  // The default view is 4 wide and 3 tall about (-0.75, 0) at zoom 1, so a
  // tenth of a pan is 0.4 real and 0.3 imaginary.
  it("moves the right and left edges a tenth of the view", () => {
    const right = keyNavigationBounds("ArrowRight", BOUNDS);
    expect(right?.minReal).toBeCloseTo(-2.35, 12);
    expect(right?.maxReal).toBeCloseTo(1.65, 12);

    const left = keyNavigationBounds("ArrowLeft", BOUNDS);
    expect(left?.minReal).toBeCloseTo(-3.15, 12);
    expect(left?.maxReal).toBeCloseTo(0.85, 12);
  });

  it("moves the top and bottom edges a tenth of the view", () => {
    // The canvas draws its smallest imaginary value along the top edge, so
    // ArrowUp is the direction of smaller imaginary values.
    const up = keyNavigationBounds("ArrowUp", BOUNDS);
    expect(up?.minImaginary).toBeCloseTo(-1.8, 12);
    expect(up?.maxImaginary).toBeCloseTo(1.2, 12);

    const down = keyNavigationBounds("ArrowDown", BOUNDS);
    expect(down?.minImaginary).toBeCloseTo(-1.2, 12);
    expect(down?.maxImaginary).toBeCloseTo(1.8, 12);
  });

  it("pans without changing the span or the zoom", () => {
    const panned = keyNavigationBounds("ArrowUp", BOUNDS)!;

    expect(panned.maxReal - panned.minReal).toBeCloseTo(4, 12);
    expect(panned.maxImaginary - panned.minImaginary).toBeCloseTo(3, 12);
    expect(boundsToView(panned).scale).toBeCloseTo(1, 12);
  });

  it("zooms by the factor the Zoom In and Zoom Out buttons use", () => {
    // The buttons double and halve the zoom level, so a keypress halves or
    // doubles the span about the same centre.
    const zoomedIn = keyNavigationBounds("+", BOUNDS)!;
    expect(zoomedIn.minReal).toBeCloseTo(-1.75, 12);
    expect(zoomedIn.maxReal).toBeCloseTo(0.25, 12);
    expect(boundsToView(zoomedIn).scale).toBeCloseTo(2, 12);

    const zoomedOut = keyNavigationBounds("-", BOUNDS)!;
    expect(zoomedOut.minReal).toBeCloseTo(-4.75, 12);
    expect(zoomedOut.maxReal).toBeCloseTo(3.25, 12);
    expect(boundsToView(zoomedOut).scale).toBeCloseTo(0.5, 12);
  });

  it("reads the shifted keys as the same zoom keys", () => {
    // Shift is what makes `+` and `_` on most layouts, and a keyboard user
    // pressing those should not have to know which one the layout produces.
    expect(keyNavigationBounds("=", BOUNDS)).toEqual(
      keyNavigationBounds("+", BOUNDS),
    );
    expect(keyNavigationBounds("_", BOUNDS)).toEqual(
      keyNavigationBounds("-", BOUNDS),
    );
  });

  it("returns nothing for a key it does not handle", () => {
    // The page leaves those keys alone, so Tab and Enter still do their job.
    expect(keyNavigationBounds("Tab", BOUNDS)).toBeNull();
    expect(keyNavigationBounds("Enter", BOUNDS)).toBeNull();
    expect(keyNavigationBounds("a", BOUNDS)).toBeNull();
  });
});

describe("describeBounds", () => {
  it("names the centre and the zoom of the default view", () => {
    expect(describeBounds(BOUNDS)).toBe(
      "Mandelbrot view, centre real -0.75, imaginary 0, zoom 1x",
    );
  });

  it("describes a zoomed and panned view", () => {
    const deeper = calculateZoomBounds(-0.743643887, 0.131825904, 1234.5678);

    expect(describeBounds(deeper)).toBe(
      "Mandelbrot view, centre real -0.744, imaginary 0.132, zoom 1234.57x",
    );
  });

  it("defaults to the Mandelbrot set when no name is given", () => {
    expect(describeBounds(BOUNDS)).toContain("Mandelbrot");
  });

  it("names whatever fractal is on screen", () => {
    // A listener hearing "Mandelbrot" over a Julia set has been told the
    // wrong picture, and the canvas label is the only description there is.
    expect(describeBounds(BOUNDS, "Julia")).toMatch(/^Julia view, centre real/);
    expect(describeBounds(BOUNDS, "Burning Ship")).toBe(
      "Burning Ship view, centre real -0.75, imaginary 0, zoom 1x",
    );
  });
});
