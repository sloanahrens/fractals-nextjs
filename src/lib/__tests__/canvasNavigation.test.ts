import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FractalBounds, ZoomState } from "../../types/fractal";
import {
  attachCanvasNavigation,
  WHEEL_GESTURE_QUIET_MS,
} from "../canvasNavigation";
import { calculateZoomBounds, getDefaultBounds } from "../mandelbrot";
import { ZoomPanManager } from "../zoomPan";

const BOUNDS = getDefaultBounds();
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

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
 */
function createHarness(rect: Rect = FULL_SIZE_RECT) {
  const canvas = createFakeCanvas(rect);
  const manager = new ZoomPanManager(CANVAS_WIDTH, CANVAS_HEIGHT, BOUNDS);
  const views: ZoomState[] = [];
  const gestures: string[] = [];
  let bounds: FractalBounds = BOUNDS;

  const detach = attachCanvasNavigation(
    canvas.element,
    manager,
    () => bounds,
    (view) => {
      views.push(view);
      bounds = calculateZoomBounds(view.centerX, view.centerY, view.scale);
    },
    {
      onGestureStart: () => gestures.push("start"),
      onGestureEnd: () => gestures.push("end"),
    },
  );

  return { canvas, manager, views, gestures, detach };
}

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
    expect(views[0].scale).toBeCloseTo(1.1, 12);
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
    // Dragging 100px right pulls the view 100/800 of its 3.5-wide span left.
    expect(views[0].centerX).toBeCloseTo(-0.75 - (100 / 800) * 3.5, 12);
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
    expect(views[1].centerX).toBeCloseTo(-0.75 - (200 / 800) * 3.5, 12);
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
    // 150px down a 600px canvas pulls the view 150/600 of its 2.5-tall span up.
    expect(views).toHaveLength(1);
    expect(views[0].centerX).toBeCloseTo(-0.75, 12);
    expect(views[0].centerY).toBeCloseTo(-(150 / 600) * 2.5, 12);
  });

  it("leaves a multi-touch gesture to the browser", () => {
    const { canvas, views } = createHarness();

    canvas.dispatch("touchstart", {
      touches: [touchAt(400, 300), touchAt(500, 300)],
    });
    const { prevented } = canvas.dispatch("touchmove", {
      touches: [touchAt(400, 450), touchAt(500, 350)],
    });

    expect(prevented).toBe(false);
    expect(views).toHaveLength(0);
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

  it("leaves a multi-touch gesture out of the reporting", () => {
    const { canvas, gestures } = createHarness();

    canvas.dispatch("touchstart", {
      touches: [touchAt(400, 300), touchAt(500, 300)],
    });
    canvas.dispatch("touchend", { touches: [] });

    expect(gestures).toEqual([]);
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
});
