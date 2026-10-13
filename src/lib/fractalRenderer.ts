import {
  ColorOptions,
  ColorScheme,
  FractalConfig,
  FractalKind,
  TrapShape,
} from "../types/fractal";
import { mandelbrotKind } from "./mandelbrot";
import {
  BYTES_PER_PIXEL,
  colourRgbaRows,
  colourTrapRows,
  countRgbaRows,
  countTrapRows,
} from "./renderRgba";

/**
 * What the last finished render left to repaint from: either its iteration
 * counts, or, drawn in trap mode, its orbit-trap distances and the shape they
 * are to. One buffer at a time, never both: trap mode holds half the memory of
 * count mode, and a toggle is a render whichever is held.
 */
type KeptRender =
  | { mode: "counts"; data: Float64Array }
  | { mode: "trap"; shape: TrapShape; data: Float32Array };

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
   * What the last render to finish on this canvas left, one value per pixel,
   * row by row — what {@link FractalRenderer.recolour} repaints from: the
   * smooth counts, or, for a render drawn in trap mode, the trap distances and
   * their shape.
   *
   * Null whenever there are none: before the first render, from the moment a
   * render starts until the run that finishes keeps its own, and from a
   * `cancelRender`. Counts are a `Float64Array` because a count is then the
   * very number the renderer drew with, so a repaint from it is the picture the
   * render drew; see `CountBuffer` in `renderRgba.ts` for what float32 would
   * cost. Distances are a `Float32Array`, rounded once when stored and coloured
   * from the rounded value by the render and the repaint alike
   * (`TrapBuffer`).
   */
  private kept: KeptRender | null = null;

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

    // The counts (or trap distances) this renderer was holding are the view's
    // this render is replacing, so they go now rather than at the end: a
    // recolour asked for while this runs has nothing to repaint from and is
    // answered false, which is how a colour change that arrives mid-render
    // still draws in full.
    this.kept = null;

    if (
      this.canvas.width !== config.width ||
      this.canvas.height !== config.height
    ) {
      this.canvas.width = config.width;
      this.canvas.height = config.height;
      this.imageData = this.ctx.createImageData(config.width, config.height);
    }

    const {
      width,
      height,
      bounds,
      maxIterations,
      colorScheme,
      colorOptions,
      trap,
    } = config;
    const totalPixels = width * height;
    let processedPixels = 0;

    // One row at a time: the row's iteration counts (or, in trap mode, its trap
    // distances), the row's pixels, and — only for a smooth run — a copy of
    // those numbers to keep. The two steps are `countRgbaRows` and
    // `colourRgbaRows` (`countTrapRows` and `colourTrapRows` in trap mode), the
    // halves of the pipeline `scripts/make-og-previews.mjs` draws the pre-built
    // link previews with, so nothing reaches the canvas's image data until the
    // superseded check below has passed.
    const rowCounts = trap ? null : new Float64Array(width);
    const rowDistances = trap ? new Float32Array(width) : null;
    const row = new Uint8ClampedArray(width * BYTES_PER_PIXEL);
    // Only a smooth run's numbers are the picture: a whole-count pass (a
    // preview) would repaint a different one, and draws at fewer pixels anyway.
    // In trap mode "smooth" means only "not a preview".
    const keptCounts =
      useSmooth && !trap ? new Float64Array(totalPixels) : null;
    const keptDistances =
      useSmooth && trap ? new Float32Array(totalPixels) : null;

    for (let y = 0; y < height && !superseded(); y++) {
      if (trap && rowDistances) {
        countTrapRows(
          rowDistances,
          y,
          y + 1,
          bounds,
          width,
          height,
          maxIterations,
          this.kind,
          trap,
        );
        colourTrapRows(
          row,
          rowDistances,
          y,
          y + 1,
          width,
          colorScheme,
          colorOptions,
        );
      } else if (rowCounts) {
        countRgbaRows(
          rowCounts,
          y,
          y + 1,
          bounds,
          width,
          height,
          maxIterations,
          this.kind,
          useSmooth,
        );
        colourRgbaRows(
          row,
          rowCounts,
          y,
          y + 1,
          width,
          maxIterations,
          colorScheme,
          colorOptions,
        );
      }

      // Give a render started from a promise continuation its turn to claim
      // the canvas before this row is painted.
      await Promise.resolve();

      // The row was computed while another run may have claimed the canvas, so
      // drop it rather than colouring pixels of a view the user has left. This
      // is the only place a superseded run could paint or report after the
      // await above suspends it, and nothing here writes before this check.
      if (superseded()) break;

      if (keptCounts && rowCounts) keptCounts.set(rowCounts, y * width);
      if (keptDistances && rowDistances) {
        keptDistances.set(rowDistances, y * width);
      }
      this.imageData.data.set(row, y * width * BYTES_PER_PIXEL);

      processedPixels += width;

      if (y % 10 === 0 || y === height - 1) {
        this.ctx.putImageData(this.imageData, 0, 0);
        onProgress?.(processedPixels / totalPixels);

        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // A run that has been superseded owns neither the final frame nor the
    // rendering flag: both belong to the run that superseded it, which is
    // still going. Leaving them alone is also what keeps the flag honest —
    // the last render to finish is the one that clears it.
    if (superseded()) return;

    // The counts (or distances) are this renderer's to keep only now: the
    // picture they make is the picture on the canvas, and a colour change can
    // repaint from them without counting the view again.
    if (keptDistances && trap) {
      this.kept = { mode: "trap", shape: trap, data: keptDistances };
    } else if (keptCounts) {
      this.kept = { mode: "counts", data: keptCounts };
    } else {
      this.kept = null;
    }

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
    // Whatever the cancelled run had half counted is not a picture, and the
    // view it is counting is the one the user has left: nothing is kept.
    this.kept = null;
  }

  /**
   * Repaint the canvas in another colour scheme from the iteration counts the
   * last render to finish left, computing no orbit at all — the whole of a
   * colour change, since a view's counts do not depend on the scheme.
   *
   * The counts are the picture's own: only a smooth run that finished keeps
   * them, and they are dropped the moment another render starts or the canvas
   * is cancelled. So a caller that knows the view has not moved can be sure the
   * repaint is what a full render would draw — and the caller's half of that
   * knowledge is the view it is looking at: it asks for this only when nothing
   * but the scheme has changed since the render that finished.
   *
   * Answers false, with the canvas untouched, whenever there is nothing to
   * repaint from — a renderer whose first render has not finished, one whose
   * run was cancelled or replaced, one rebuilt for a new size or fractal, one
   * drawn only in whole counts. That is the caller's cue to render in full.
   *
   * @param scheme - Colour scheme to repaint in
   * @param maxIterations - The cap the counts are judged against, which is the
   *   one they were counted with
   * @param options - Reverse and shift of the scheme, or nothing for the scheme
   *   as it is
   * @param trap - The trap shape the caller expects the picture to be drawn
   *   with, or nothing for the iteration-count picture. The repaint is made only
   *   when the buffer held is of that mode (and shape); any other pairing is
   *   answered false, the caller's cue to render, so a stale buffer is harmless
   *   even if the page is wrong about it, and a caller that knows nothing of
   *   buffers (the colour-cycling frame loop) cannot paint the wrong picture.
   * @returns Whether the canvas was repainted
   */
  recolour(
    scheme: ColorScheme,
    maxIterations: number,
    options?: ColorOptions,
    trap?: TrapShape,
  ): boolean {
    const kept = this.kept;
    const { width, height } = this.canvas;

    // The numbers are always the canvas's own size — a render keeps them only
    // for the canvas it drew on, and the page builds a new renderer for a new
    // canvas or a new fractal — but a repaint from another size's would be a
    // scrambled picture rather than a wrong shade, so it is refused.
    if (kept === null || kept.data.length !== width * height) return false;

    if (kept.mode === "trap") {
      if (trap !== kept.shape) return false;

      colourTrapRows(
        this.imageData.data,
        kept.data,
        0,
        height,
        width,
        scheme,
        options,
      );
    } else {
      if (trap !== undefined) return false;

      colourRgbaRows(
        this.imageData.data,
        kept.data,
        0,
        height,
        width,
        maxIterations,
        scheme,
        options,
      );
    }
    this.ctx.putImageData(this.imageData, 0, 0);

    return true;
  }

  isCurrentlyRendering(): boolean {
    return this.isRendering;
  }

  /**
   * Draw the same fractal at fewer pixels for faster feedback.
   * @param scale - Fraction of the canvas's size to draw at
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

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
