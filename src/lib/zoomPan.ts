import { FractalBounds, ZoomState, PanState } from "../types/fractal";
import {
  pixelToComplex,
  calculateZoomBounds,
  boundsToView,
} from "./mandelbrot";
import {
  PixelPoint,
  pinchFactor,
  scaleAboutPoint,
  touchDistance,
  touchMidpoint,
} from "./pinch";
import { wheelZoomFactor } from "./wheelZoom";

/** Where the two fingers of a pinch were at its last step, in canvas pixels. */
interface PinchState {
  distance: number;
  midpoint: PixelPoint;
}

/**
 * Zoom and pan manager for fractal navigation
 *
 * The bounds the caller passes in are the source of truth for the current
 * view: every method that produces new bounds also records the matching centre
 * and scale, so a view set elsewhere (a slider, a preset, a reset) cannot
 * leave stale zoom state behind.
 */
export class ZoomPanManager {
  private zoomState: ZoomState;
  private panState: PanState;
  private pinchState: PinchState | null = null;
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(
    canvasWidth: number,
    canvasHeight: number,
    initialBounds: FractalBounds,
  ) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.panState = {
      isDragging: false,
      lastX: 0,
      lastY: 0,
    };

    this.zoomState = boundsToView(initialBounds);
  }

  /**
   * Handle zoom in/out at a specific point
   * @param pixelX - X coordinate of zoom center in pixels
   * @param pixelY - Y coordinate of zoom center in pixels
   * @param zoomFactor - Factor to zoom by (>1 = zoom in, <1 = zoom out)
   * @param currentBounds - Current fractal bounds; these carry the zoom level
   * the factor is applied to
   * @returns New fractal bounds after zoom
   */
  zoom(
    pixelX: number,
    pixelY: number,
    zoomFactor: number,
    currentBounds: FractalBounds,
  ): FractalBounds {
    const zoomCenter = pixelToComplex(
      pixelX,
      pixelY,
      this.canvasWidth,
      this.canvasHeight,
      currentBounds,
    );

    const scale = boundsToView(currentBounds).scale * zoomFactor;
    const bounds = calculateZoomBounds(
      zoomCenter.real,
      zoomCenter.imaginary,
      scale,
    );

    // Record the view the bounds were built from rather than reading it back
    // out of them, so successive zooms compound without a round trip through
    // the bounds widening the result.
    this.zoomState = {
      centerX: zoomCenter.real,
      centerY: zoomCenter.imaginary,
      scale,
    };

    return bounds;
  }

  /**
   * Translate a pointer position into the canvas's own pixel space
   *
   * Pointer events report CSS pixels relative to the page, while everything in
   * here is measured in canvas pixels. The two only agree when the layout
   * shows the canvas at its natural size, so a canvas that CSS has shrunk
   * (a phone, or the max-width on the element) has to be scaled back up.
   * @param clientX - Pointer X in CSS pixels
   * @param clientY - Pointer Y in CSS pixels
   * @param target - Event target the pointer is over
   * @returns Pointer position in canvas pixels
   */
  private pixelFrom(
    clientX: number,
    clientY: number,
    target: EventTarget | null,
  ): { x: number; y: number } {
    const rect = (target as HTMLElement).getBoundingClientRect();
    const scaleX = rect.width ? this.canvasWidth / rect.width : 1;
    const scaleY = rect.height ? this.canvasHeight / rect.height : 1;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  /**
   * Handle mouse wheel zoom. A Control+wheel event, which is how a trackpad
   * pinch arrives, is prevented like any other so the browser does not zoom
   * the page.
   * @param event - Wheel event
   * @param currentBounds - Current fractal bounds
   * @returns New fractal bounds, or null if the event was not a zoom
   */
  handleWheel(
    event: WheelEvent,
    currentBounds: FractalBounds,
  ): FractalBounds | null {
    // A trackpad can report a horizontal-only swipe; that is a scroll, not a
    // zoom, so leave it to the page.
    if (event.deltaY === 0) {
      return null;
    }

    event.preventDefault();

    const pixel = this.pixelFrom(event.clientX, event.clientY, event.target);

    // How far the wheel turned sets the factor, so a trackpad swipe of many
    // small events zooms by what the swipe was worth and not by a step each.
    const zoomFactor = wheelZoomFactor(
      event.deltaY,
      event.deltaMode,
      event.ctrlKey,
      typeof window === "undefined" ? 0 : window.innerHeight,
    );

    return this.zoom(pixel.x, pixel.y, zoomFactor, currentBounds);
  }

  /**
   * Start panning operation
   * @param pixelX - Starting X coordinate
   * @param pixelY - Starting Y coordinate
   */
  startPan(pixelX: number, pixelY: number): void {
    this.panState.isDragging = true;
    this.panState.lastX = pixelX;
    this.panState.lastY = pixelY;
  }

  /**
   * Update pan during drag operation
   * @param pixelX - Current X coordinate
   * @param pixelY - Current Y coordinate
   * @param currentBounds - Current fractal bounds
   * @returns New fractal bounds or null if not panning
   */
  updatePan(
    pixelX: number,
    pixelY: number,
    currentBounds: FractalBounds,
  ): FractalBounds | null {
    if (!this.panState.isDragging) {
      return null;
    }

    const deltaX = pixelX - this.panState.lastX;
    const deltaY = pixelY - this.panState.lastY;

    const realRange = currentBounds.maxReal - currentBounds.minReal;
    const imaginaryRange =
      currentBounds.maxImaginary - currentBounds.minImaginary;

    const realDelta = -(deltaX / this.canvasWidth) * realRange;
    const imaginaryDelta = -(deltaY / this.canvasHeight) * imaginaryRange;

    this.panState.lastX = pixelX;
    this.panState.lastY = pixelY;

    const bounds = {
      minReal: currentBounds.minReal + realDelta,
      maxReal: currentBounds.maxReal + realDelta,
      minImaginary: currentBounds.minImaginary + imaginaryDelta,
      maxImaginary: currentBounds.maxImaginary + imaginaryDelta,
    };

    this.zoomState = boundsToView(bounds);

    return bounds;
  }

  endPan(): void {
    this.panState.isDragging = false;
  }

  handleMouseDown(event: MouseEvent): void {
    const pixel = this.pixelFrom(event.clientX, event.clientY, event.target);

    this.startPan(pixel.x, pixel.y);
  }

  handleMouseMove(
    event: MouseEvent,
    currentBounds: FractalBounds,
  ): FractalBounds | null {
    const pixel = this.pixelFrom(event.clientX, event.clientY, event.target);

    return this.updatePan(pixel.x, pixel.y, currentBounds);
  }

  handleMouseUp(): void {
    this.endPan();
  }

  /**
   * Read the first two touches as a pinch baseline
   *
   * A third finger is not part of the gesture: the pinch is the first two.
   */
  private measurePinch(
    touches: TouchList,
    target: EventTarget | null,
  ): PinchState {
    const first = this.pixelFrom(touches[0].clientX, touches[0].clientY, target);
    const second = this.pixelFrom(
      touches[1].clientX,
      touches[1].clientY,
      target,
    );

    return {
      distance: touchDistance(first, second),
      midpoint: touchMidpoint(first, second),
    };
  }

  /**
   * Handle touch events for mobile support
   *
   * One finger pans. A second finger lands and the gesture becomes a pinch;
   * the pan it replaces is dropped, so the two never move the view at once.
   */
  handleTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const pixel = this.pixelFrom(touch.clientX, touch.clientY, event.target);

      this.startPan(pixel.x, pixel.y);
    } else if (event.touches.length >= 2) {
      this.endPan();
      this.pinchState = this.measurePinch(event.touches, event.target);
    }
  }

  handleTouchMove(
    event: TouchEvent,
    currentBounds: FractalBounds,
  ): FractalBounds | null {
    if (event.touches.length >= 2) {
      const next = this.measurePinch(event.touches, event.target);
      const previous = this.pinchState;
      this.pinchState = next;

      // A pinch the listener missed the start of (the canvas was attached with
      // fingers already down) takes this step as its baseline rather than
      // jumping by whatever distance it finds.
      if (!previous) return null;

      // Scale by how much the distance changed, about the point between the
      // fingers, and carry the view along with that point: the part of the
      // picture under the midpoint stays under the midpoint.
      const bounds = scaleAboutPoint(
        currentBounds,
        previous.midpoint,
        next.midpoint,
        pinchFactor(previous.distance, next.distance),
        this.canvasWidth,
        this.canvasHeight,
      );
      this.zoomState = boundsToView(bounds);

      return bounds;
    }

    if (event.touches.length === 1 && this.panState.isDragging) {
      event.preventDefault();
      const touch = event.touches[0];
      const pixel = this.pixelFrom(touch.clientX, touch.clientY, event.target);

      return this.updatePan(pixel.x, pixel.y, currentBounds);
    }
    return null;
  }

  /**
   * A finger left the screen, or the whole gesture was cancelled
   * @param event - The touchend. With fingers still down it says which gesture
   * carries on; without it every gesture is over.
   */
  handleTouchEnd(event?: TouchEvent): void {
    const remaining = event?.touches?.length ?? 0;
    const wasPinching = this.pinchState !== null;

    if (event && wasPinching && remaining >= 2) {
      // Three fingers down and one lifted: still a pinch, but of a different
      // pair, so measure it afresh or the next step would jump.
      this.pinchState = this.measurePinch(event.touches, event.target);
      return;
    }

    this.pinchState = null;

    if (event && wasPinching && remaining === 1) {
      // One finger of a pinch lifted: the other carries on as a pan from where
      // it is, so the view does not move until that finger does.
      const touch = event.touches[0];
      const pixel = this.pixelFrom(touch.clientX, touch.clientY, event.target);

      this.startPan(pixel.x, pixel.y);
      return;
    }

    this.endPan();
  }

  isPinching(): boolean {
    return this.pinchState !== null;
  }

  getZoomState(): ZoomState {
    return { ...this.zoomState };
  }

  isPanning(): boolean {
    return this.panState.isDragging;
  }

  /**
   * Reset to default zoom/pan state
   * @param defaultBounds - Default fractal bounds
   */
  reset(defaultBounds: FractalBounds): void {
    this.zoomState = boundsToView(defaultBounds);
    this.pinchState = null;
    this.endPan();
  }

  updateCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }
}
