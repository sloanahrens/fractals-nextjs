import { FractalBounds, ZoomState, PanState } from "../types/fractal";
import { pixelToComplex, calculateZoomBounds } from "./mandelbrot";

/**
 * Zoom and pan manager for fractal navigation
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
    this.zoomState = {
      centerX: (initialBounds.minReal + initialBounds.maxReal) / 2,
      centerY: (initialBounds.minImaginary + initialBounds.maxImaginary) / 2,
      scale: 1,
    };
  }

  /**
   * Handle zoom in/out at a specific point
   * @param pixelX - X coordinate of zoom center in pixels
   * @param pixelY - Y coordinate of zoom center in pixels
   * @param zoomFactor - Factor to zoom by (>1 = zoom in, <1 = zoom out)
   * @param currentBounds - Current fractal bounds
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

    // Update zoom state
    this.zoomState.centerX = zoomCenter.real;
    this.zoomState.centerY = zoomCenter.imaginary;
    this.zoomState.scale *= zoomFactor;

    // Calculate new bounds
    return calculateZoomBounds(
      this.zoomState.centerX,
      this.zoomState.centerY,
      this.zoomState.scale,
    );
  }

  /**
   * Handle mouse wheel zoom
   * @param event - Wheel event
   * @param currentBounds - Current fractal bounds
   * @returns New fractal bounds or null if no change
   */
  handleWheel(
    event: WheelEvent,
    currentBounds: FractalBounds,
  ): FractalBounds | null {
    event.preventDefault();

    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const pixelX = event.clientX - rect.left;
    const pixelY = event.clientY - rect.top;

    // Determine zoom direction and factor
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;

    return this.zoom(pixelX, pixelY, zoomFactor, currentBounds);
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

    // Update zoom state center
    this.zoomState.centerX += realDelta;
    this.zoomState.centerY += imaginaryDelta;

    // Return new bounds
    return {
      minReal: currentBounds.minReal + realDelta,
      maxReal: currentBounds.maxReal + realDelta,
      minImaginary: currentBounds.minImaginary + imaginaryDelta,
      maxImaginary: currentBounds.maxImaginary + imaginaryDelta,
    };
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
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const pixelX = event.clientX - rect.left;
    const pixelY = event.clientY - rect.top;

    this.startPan(pixelX, pixelY);
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
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const pixelX = event.clientX - rect.left;
    const pixelY = event.clientY - rect.top;

    return this.updatePan(pixelX, pixelY, currentBounds);
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
      const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
      const pixelX = touch.clientX - rect.left;
      const pixelY = touch.clientY - rect.top;

      this.startPan(pixelX, pixelY);
    }
  }

  handleTouchMove(
    event: TouchEvent,
    currentBounds: FractalBounds,
  ): FractalBounds | null {
    if (event.touches.length === 1 && this.panState.isDragging) {
      event.preventDefault();
      const touch = event.touches[0];
      const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
      const pixelX = touch.clientX - rect.left;
      const pixelY = touch.clientY - rect.top;

      return this.updatePan(pixelX, pixelY, currentBounds);
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
    this.zoomState = {
      centerX: (defaultBounds.minReal + defaultBounds.maxReal) / 2,
      centerY: (defaultBounds.minImaginary + defaultBounds.maxImaginary) / 2,
      scale: 1,
    };
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
