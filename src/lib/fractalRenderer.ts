import {
  FractalConfig,
  FractalBounds,
  FractalKind,
  RenderPoint,
} from "../types/fractal";
import { mandelbrotKind, pixelToComplex } from "./mandelbrot";
import { mapIterationsToColor } from "./colorMapping";

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

    // Render in chunks to avoid blocking the UI. The floor keeps canvases
    // under 10000 pixels (where totalPixels / 100 rounds to 0) from wedging
    // the row loop on a zero-sized step.
    const chunkSize = Math.max(
      1,
      Math.min(1000, Math.floor(totalPixels / 100)),
    );

    for (let y = 0; y < height && !superseded(); y++) {
      const rowPromises: Promise<RenderPoint[]>[] = [];

      // Process row in chunks
      for (let chunkStart = 0; chunkStart < width; chunkStart += chunkSize) {
        const chunkEnd = Math.min(chunkStart + chunkSize, width);
        const chunkPromise = this.renderRowChunk(
          y,
          chunkStart,
          chunkEnd,
          width,
          height,
          bounds,
          maxIterations,
          useSmooth,
        );
        rowPromises.push(chunkPromise);
      }

      // Wait for all chunks in the row to complete
      const rowResults = await Promise.all(rowPromises);

      // The row was computed while another run may have claimed the canvas, so
      // drop it rather than colouring pixels of a view the user has left. This
      // is the only place a superseded run could paint or report after the
      // await above suspends it, and nothing here writes before this check.
      if (superseded()) break;

      const rowPoints = rowResults.flat();

      // Apply colors to pixels
      for (const point of rowPoints) {
        const color = mapIterationsToColor(
          point.iterations,
          maxIterations,
          colorScheme,
        );
        this.setPixel(point.x, point.y, color.r, color.g, color.b, 255);
      }

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
   * Render a chunk of a row (for parallel processing)
   */
  private async renderRowChunk(
    y: number,
    startX: number,
    endX: number,
    width: number,
    height: number,
    bounds: FractalBounds,
    maxIterations: number,
    useSmooth: boolean,
  ): Promise<RenderPoint[]> {
    const points: RenderPoint[] = [];

    for (let x = startX; x < endX; x++) {
      const complex = pixelToComplex(x, y, width, height, bounds);
      const iterations = this.kind.iterations(
        complex,
        maxIterations,
        useSmooth,
      );

      points.push({ x, y, iterations });
    }

    return points;
  }

  /**
   * Set a pixel color in the image data
   */
  private setPixel(
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): void {
    const index = (y * this.canvas.width + x) * 4;
    this.imageData.data[index] = r; // Red
    this.imageData.data[index + 1] = g; // Green
    this.imageData.data[index + 2] = b; // Blue
    this.imageData.data[index + 3] = a; // Alpha
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
