import { FractalBounds, ZoomState, PanState } from "../types/fractal";
import {
  pixelToComplex,
  calculateZoomBounds,
  boundsToView,
} from "./mandelbrot";

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

    // Initialize zoom state from bounds
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
    // Convert pixel coordinates to complex plane
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
   * Handle mouse wheel zoom
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

    // Determine zoom direction and factor
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;

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

    // Convert pixel deltas to complex plane deltas
    const realRange = currentBounds.maxReal - currentBounds.minReal;
    const imaginaryRange =
      currentBounds.maxImaginary - currentBounds.minImaginary;

    const realDelta = -(deltaX / this.canvasWidth) * realRange;
    const imaginaryDelta = -(deltaY / this.canvasHeight) * imaginaryRange;

    // Update pan state
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

  /**
   * End panning operation
   */
  endPan(): void {
    this.panState.isDragging = false;
  }

  /**
   * Handle mouse down event
   * @param event - Mouse event
   */
  handleMouseDown(event: MouseEvent): void {
    const pixel = this.pixelFrom(event.clientX, event.clientY, event.target);

    this.startPan(pixel.x, pixel.y);
  }

  /**
   * Handle mouse move event
   * @param event - Mouse event
   * @param currentBounds - Current fractal bounds
   * @returns New fractal bounds or null if no change
   */
  handleMouseMove(
    event: MouseEvent,
    currentBounds: FractalBounds,
  ): FractalBounds | null {
    const pixel = this.pixelFrom(event.clientX, event.clientY, event.target);

    return this.updatePan(pixel.x, pixel.y, currentBounds);
  }

  /**
   * Handle mouse up event
   */
  handleMouseUp(): void {
    this.endPan();
  }

  /**
   * Handle touch events for mobile support
   */
  handleTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const pixel = this.pixelFrom(touch.clientX, touch.clientY, event.target);

      this.startPan(pixel.x, pixel.y);
    }
  }

  handleTouchMove(
    event: TouchEvent,
    currentBounds: FractalBounds,
  ): FractalBounds | null {
    if (event.touches.length === 1 && this.panState.isDragging) {
      event.preventDefault();
      const touch = event.touches[0];
      const pixel = this.pixelFrom(touch.clientX, touch.clientY, event.target);

      return this.updatePan(pixel.x, pixel.y, currentBounds);
    }
    return null;
  }

  handleTouchEnd(): void {
    this.endPan();
  }

  /**
   * Get current zoom state
   */
  getZoomState(): ZoomState {
    return { ...this.zoomState };
  }

  /**
   * Check if currently panning
   */
  isPanning(): boolean {
    return this.panState.isDragging;
  }

  /**
   * Reset to default zoom/pan state
   * @param defaultBounds - Default fractal bounds
   */
  reset(defaultBounds: FractalBounds): void {
    this.zoomState = boundsToView(defaultBounds);
    this.endPan();
  }

  /**
   * Update canvas dimensions
   */
  updateCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }
}
