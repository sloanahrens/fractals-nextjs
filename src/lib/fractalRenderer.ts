import { FractalConfig, FractalKind } from "../types/fractal";
import { mandelbrotKind } from "./mandelbrot";
import { BYTES_PER_PIXEL, renderRgbaRows } from "./renderRgba";

/**
 * Fractal renderer class for managing canvas rendering operations
 */
export class FractalRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private isRendering = false;
  /**
   * Identifies the run that owns the canvas. Starting a render takes the next
   * token, which supersedes whatever was drawing: that older run stops at its
   * next checkpoint, paints no further rows and makes no further progress
   * reports. A counter rather than a flag, so that wiping out one run cannot
   * also wipe out the run replacing it.
   */
  private runToken = 0;
  private kind: FractalKind;

  /**
   * @param canvas - Canvas to paint
   * @param kind - Formula to iterate; defaults to the Mandelbrot set
   */
  constructor(canvas: HTMLCanvasElement, kind: FractalKind = mandelbrotKind) {
    this.canvas = canvas;
    this.kind = kind;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get 2D rendering context");
    }
    this.ctx = ctx;
    this.imageData = ctx.createImageData(canvas.width, canvas.height);
  }

  /**
   * Render this renderer's fractal kind with the given configuration
   * @param config - Fractal rendering configuration
   * @param onProgress - Optional progress callback (0-1)
   * @param useSmooth - Whether to use smooth coloring for better gradients
   */
  async renderFractal(
    config: FractalConfig,
    onProgress?: (progress: number) => void,
    useSmooth: boolean = true,
  ): Promise<void> {
    // Claim the canvas. Whatever was drawing before this call — a render the
    // user's last control has just made obsolete, or one cancelRender stopped
    // — is stale from here on and stops at its next checkpoint. This render
    // does not wait for it: the two share only this token, and the older one
    // drops out the moment it next looks at it.
    const token = ++this.runToken;
    const superseded = () => token !== this.runToken;

    this.isRendering = true;

    // Resize canvas if needed
    if (
      this.canvas.width !== config.width ||
      this.canvas.height !== config.height
    ) {
      this.canvas.width = config.width;
      this.canvas.height = config.height;
      this.imageData = this.ctx.createImageData(config.width, config.height);
    }

    const { width, height, bounds, maxIterations, colorScheme } = config;
    const totalPixels = width * height;
    let processedPixels = 0;

    // A row at a time, into a buffer of its own, so nothing reaches the
    // canvas's image data until the superseded check below has passed. The
    // pixels are `renderRgbaRows`, the function the server draws a link
    // preview with.
    const row = new Uint8ClampedArray(width * BYTES_PER_PIXEL);

    for (let y = 0; y < height && !superseded(); y++) {
      renderRgbaRows(
        row,
        y,
        y + 1,
        bounds,
        width,
        height,
        maxIterations,
        colorScheme,
        this.kind,
        useSmooth,
      );

      // Give a render started from a promise continuation its turn to claim
      // the canvas before this row is painted.
      await Promise.resolve();

      // The row was computed while another run may have claimed the canvas, so
      // drop it rather than colouring pixels of a view the user has left. This
      // is the only place a superseded run could paint or report after the
      // await above suspends it, and nothing here writes before this check.
      if (superseded()) break;

      this.imageData.data.set(row, y * width * BYTES_PER_PIXEL);

      processedPixels += width;

      // Update progress and render every few rows
      if (y % 10 === 0 || y === height - 1) {
        this.ctx.putImageData(this.imageData, 0, 0);
        onProgress?.(processedPixels / totalPixels);

        // Yield control to allow UI updates
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // A run that has been superseded owns neither the final frame nor the
    // rendering flag: both belong to the run that superseded it, which is
    // still going. Leaving them alone is also what keeps the flag honest —
    // the last render to finish is the one that clears it.
    if (superseded()) return;

    // Final render
    this.ctx.putImageData(this.imageData, 0, 0);
    onProgress?.(1);

    this.isRendering = false;
  }

  /**
   * Cancel the render in flight. It keeps whatever it has already painted and
   * stops at its next checkpoint. Nothing is drawing after this call until a
   * new render starts, so the renderer reports not rendering straight away
   * rather than waiting for the cancelled run to notice.
   */
  cancelRender(): void {
    this.runToken++;
    this.isRendering = false;
  }

  /**
   * Check if currently rendering
   */
  isCurrentlyRendering(): boolean {
    return this.isRendering;
  }

  /**
   * Render a low-resolution preview for faster feedback
   */
  async renderPreview(
    config: FractalConfig,
    scale: number = 0.25,
  ): Promise<void> {
    const previewConfig = {
      ...config,
      width: Math.floor(config.width * scale),
      height: Math.floor(config.height * scale),
    };

    // Create a temporary canvas for the preview
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = previewConfig.width;
    previewCanvas.height = previewConfig.height;
    const previewCtx = previewCanvas.getContext("2d");

    if (!previewCtx) return;

    // The preview is the same fractal at fewer pixels, so it draws the kind
    // this renderer was built with rather than falling back to the default.
    const previewRenderer = new FractalRenderer(previewCanvas, this.kind);
    await previewRenderer.renderFractal(previewConfig, undefined, false);

    // Scale up the preview to fill the main canvas
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(
      previewCanvas,
      0,
      0,
      previewConfig.width,
      previewConfig.height,
      0,
      0,
      config.width,
      config.height,
    );
    this.ctx.imageSmoothingEnabled = true;
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
