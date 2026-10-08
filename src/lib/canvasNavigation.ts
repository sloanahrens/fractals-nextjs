import { FractalBounds, ZoomState } from "../types/fractal";
import { boundsToView, calculateZoomBounds } from "./mandelbrot";
import { ZoomPanManager } from "./zoomPan";

/**
 * How long a burst of wheel events has to stay quiet before the gesture counts
 * as over.
 *
 * A wheel gesture has no end event the way a drag has a mouseup: the browser
 * simply stops sending wheel events. Callers that redraw after a gesture need
 * to know when it ended, so the listener waits out this quiet period.
 */
export const WHEEL_GESTURE_QUIET_MS = 150;

/** Notified when a gesture starts and stops moving the view. */
export interface GestureCallbacks {
  /** A wheel, drag or touch gesture started moving the view. */
  onGestureStart?: () => void;
  /** The gesture is over; the view will not move again until a new gesture. */
  onGestureEnd?: () => void;
}

/**
 * Connect wheel, drag and touch navigation on a canvas to a ZoomPanManager
 *
 * The listeners are native rather than React props because the wheel and touch
 * handlers call preventDefault to keep the page from scrolling under the
 * gesture, which needs a non-passive listener; React registers both of those
 * passively.
 *
 * @param canvas - Canvas element to listen on
 * @param manager - Manager that turns the gestures into bounds
 * @param getBounds - Reads the bounds currently on screen, so a gesture always
 * starts from the view the user can see
 * @param onViewChange - Called with the new centre and zoom after each gesture
 * step that moved the view
 * @param gesture - Called when a gesture begins and ends
 * @returns Removes the listeners again
 */
export function attachCanvasNavigation(
  canvas: HTMLCanvasElement,
  manager: ZoomPanManager,
  getBounds: () => FractalBounds,
  onViewChange: (view: ZoomState) => void,
  gesture?: GestureCallbacks,
): () => void {
  const publish = (bounds: FractalBounds | null): void => {
    if (bounds) {
      onViewChange(boundsToView(bounds));
    }
  };

  // A wheel gesture stays open until the events stop arriving for a quiet
  // period, so the end of the burst can be reported like a mouseup.
  let wheelGestureOpen = false;
  let wheelEndTimer: ReturnType<typeof setTimeout> | null = null;

  const endWheelGesture = () => {
    wheelEndTimer = null;
    if (!wheelGestureOpen) return;

    wheelGestureOpen = false;
    gesture?.onGestureEnd?.();
  };

  const handleWheel = (event: WheelEvent) => {
    const bounds = manager.handleWheel(event, getBounds());
    if (!bounds) return;

    if (!wheelGestureOpen) {
      wheelGestureOpen = true;
      gesture?.onGestureStart?.();
    }
    if (wheelEndTimer !== null) clearTimeout(wheelEndTimer);
    wheelEndTimer = setTimeout(endWheelGesture, WHEEL_GESTURE_QUIET_MS);

    publish(bounds);
  };

  const handleMouseDown = (event: MouseEvent) => {
    // Only the primary button drags the view; middle and right buttons belong
    // to the browser.
    if (event.button === 0) {
      manager.handleMouseDown(event);
      gesture?.onGestureStart?.();
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    publish(manager.handleMouseMove(event, getBounds()));
  };

  const handleMouseUp = () => {
    // A mouseup or mouseleave with no drag in progress is not the end of a
    // gesture, and reporting it as one would redraw a view nobody moved.
    if (!manager.isPanning()) return;

    manager.handleMouseUp();
    gesture?.onGestureEnd?.();
  };

  const handleTouchStart = (event: TouchEvent) => {
    manager.handleTouchStart(event);
    // A multi-touch start is the browser's gesture, not ours.
    if (manager.isPanning()) {
      gesture?.onGestureStart?.();
    }
  };

  const handleTouchMove = (event: TouchEvent) => {
    publish(manager.handleTouchMove(event, getBounds()));
  };

  const handleTouchEnd = () => {
    if (!manager.isPanning()) return;

    manager.handleTouchEnd();
    gesture?.onGestureEnd?.();
  };

  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  // A drag that leaves the canvas still has to end, or the next move over the
  // canvas would pan from the stale position.
  canvas.addEventListener("mouseleave", handleMouseUp);
  canvas.addEventListener("touchstart", handleTouchStart);
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  canvas.addEventListener("touchend", handleTouchEnd);
  canvas.addEventListener("touchcancel", handleTouchEnd);

  return () => {
    if (wheelEndTimer !== null) clearTimeout(wheelEndTimer);

    canvas.removeEventListener("wheel", handleWheel);
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mousemove", handleMouseMove);
    canvas.removeEventListener("mouseup", handleMouseUp);
    canvas.removeEventListener("mouseleave", handleMouseUp);
    canvas.removeEventListener("touchstart", handleTouchStart);
    canvas.removeEventListener("touchmove", handleTouchMove);
    canvas.removeEventListener("touchend", handleTouchEnd);
    canvas.removeEventListener("touchcancel", handleTouchEnd);
  };
}

/** How far one arrow key moves the view, as a fraction of its own span. */
export const KEYBOARD_PAN_FRACTION = 0.1;

/**
 * The factor one `+` or `-` keypress zooms by, so the keys and the Zoom In and
 * Zoom Out buttons move the view by the same step.
 */
export const KEYBOARD_ZOOM_FACTOR = 2;

/**
 * The bounds one key on a focused canvas moves the view to
 *
 * An arrow moves the visible region a tenth of its own width or height in the
 * direction the arrow points *on screen*: the renderer fills rows from the top
 * with the smallest imaginary value, so the top edge of the canvas is
 * `minImaginary` and ArrowUp walks the centre towards the smaller imaginary
 * values drawn there. `+` and `-` zoom about the centre by the factor the Zoom
 * In and Zoom Out buttons use; `=` and `_` are the same key as `+` and `-`
 * under Shift on most layouts.
 *
 * @param key - `KeyboardEvent.key` of the press
 * @param bounds - The view on screen now
 * @returns The bounds the key moves to, or null for a key this does not handle
 */
export function keyNavigationBounds(
  key: string,
  bounds: FractalBounds,
): FractalBounds | null {
  const view = boundsToView(bounds);
  const panX = (bounds.maxReal - bounds.minReal) * KEYBOARD_PAN_FRACTION;
  const panY =
    (bounds.maxImaginary - bounds.minImaginary) * KEYBOARD_PAN_FRACTION;

  switch (key) {
    case "ArrowLeft":
      return calculateZoomBounds(view.centerX - panX, view.centerY, view.scale);
    case "ArrowRight":
      return calculateZoomBounds(view.centerX + panX, view.centerY, view.scale);
    case "ArrowUp":
      return calculateZoomBounds(view.centerX, view.centerY - panY, view.scale);
    case "ArrowDown":
      return calculateZoomBounds(view.centerX, view.centerY + panY, view.scale);
    case "+":
    case "=":
      return calculateZoomBounds(
        view.centerX,
        view.centerY,
        view.scale * KEYBOARD_ZOOM_FACTOR,
      );
    case "-":
    case "_":
      return calculateZoomBounds(
        view.centerX,
        view.centerY,
        view.scale / KEYBOARD_ZOOM_FACTOR,
      );
    default:
      return null;
  }
}

/**
 * Describe a view the way a screen reader should hear it
 *
 * @param bounds - The view on screen
 * @returns Label text naming the centre in the complex plane and the zoom
 */
export function describeBounds(bounds: FractalBounds): string {
  const { centerX, centerY, scale } = boundsToView(bounds);
  const coordinate = (value: number) => Number(value.toFixed(3));

  return `Mandelbrot set view, centre real ${coordinate(centerX)}, imaginary ${coordinate(centerY)}, zoom ${Number(scale.toFixed(2))}x`;
}
