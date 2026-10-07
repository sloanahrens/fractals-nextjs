import { FractalBounds, ZoomState } from "../types/fractal";
import { boundsToView } from "./mandelbrot";
import { ZoomPanManager } from "./zoomPan";

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
 * @returns Removes the listeners again
 */
export function attachCanvasNavigation(
  canvas: HTMLCanvasElement,
  manager: ZoomPanManager,
  getBounds: () => FractalBounds,
  onViewChange: (view: ZoomState) => void,
): () => void {
  const publish = (bounds: FractalBounds | null): void => {
    if (bounds) {
      onViewChange(boundsToView(bounds));
    }
  };

  const handleWheel = (event: WheelEvent) => {
    publish(manager.handleWheel(event, getBounds()));
  };

  const handleMouseDown = (event: MouseEvent) => {
    // Only the primary button drags the view; middle and right buttons belong
    // to the browser.
    if (event.button === 0) {
      manager.handleMouseDown(event);
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    publish(manager.handleMouseMove(event, getBounds()));
  };

  const handleMouseUp = () => {
    manager.handleMouseUp();
  };

  const handleTouchStart = (event: TouchEvent) => {
    manager.handleTouchStart(event);
  };

  const handleTouchMove = (event: TouchEvent) => {
    publish(manager.handleTouchMove(event, getBounds()));
  };

  const handleTouchEnd = () => {
    manager.handleTouchEnd();
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
