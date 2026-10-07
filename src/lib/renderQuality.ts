/**
 * How a redraw of the canvas is drawn.
 *
 * "preview" is the cheap low-resolution pass (FractalRenderer.renderPreview),
 * "full" is a full-resolution FractalRenderer.renderFractal.
 */
export type RenderQuality = "preview" | "full";

/**
 * Decides what quality each redraw of the canvas gets while the view moves.
 *
 * A wheel, drag or touch gesture publishes a new view on every pointer step,
 * and drawing each of those at full resolution is what makes the canvas stutter
 * under the hand. So while a gesture is in flight the decider answers "preview"
 * for every redraw, and remembers that the canvas is showing something less
 * than the final view. Ending the gesture then reports that one full-resolution
 * render is owed, which leaves the user with a sharp final frame without paying
 * for a full render at every intermediate step.
 *
 * A gesture that never moved the view — a click, a two-finger touch the browser
 * took over — leaves the canvas alone and owes nothing.
 *
 * The caller drives it: a redraw asks requestRender(), the gesture's start and
 * end call the matching methods. It holds no reference to the canvas, so the
 * decision is testable without a browser.
 */
export class RenderQualityDecider {
  private interacting = false;
  private stale = false;

  /** A wheel, drag or touch gesture started moving the view. */
  beginGesture(): void {
    this.interacting = true;
  }

  /**
   * The canvas is showing something out of date: a full-resolution pass was
   * cancelled part-way, or the view moved without a redraw of its own. A full
   * render is owed even if this gesture never publishes a view of its own.
   */
  invalidate(): void {
    this.stale = true;
  }

  /**
   * The gesture finished and the view will not move again from it.
   *
   * @returns true when the gesture left a preview (or a cancelled frame) on the
   * canvas, so the caller owes one full-quality render of the final view
   */
  endGesture(): boolean {
    this.interacting = false;
    const owed = this.stale;
    this.stale = false;
    return owed;
  }

  /**
   * Something the canvas shows has changed, so it has to be drawn again.
   *
   * @returns the quality to draw at
   */
  requestRender(): RenderQuality {
    if (this.interacting) {
      this.stale = true;
      return "preview";
    }

    this.stale = false;
    return "full";
  }
}
