/** `WheelEvent.deltaMode` for a delta measured in pixels. */
export const DOM_DELTA_PIXEL = 0;
/** `WheelEvent.deltaMode` for a delta measured in lines of text. */
export const DOM_DELTA_LINE = 1;
/** `WheelEvent.deltaMode` for a delta measured in pages. */
export const DOM_DELTA_PAGE = 2;

/** Pixels a browser scrolls for one line, for a wheel that reports lines. */
export const PIXELS_PER_LINE = 16;

/** The most scroll, in pixels, one event may count for, in either direction. */
export const MAX_WHEEL_DELTA = 120;

/** Zoom per pixel of scroll on a plain wheel or a two-finger trackpad swipe. */
export const WHEEL_ZOOM_RATE = 0.0016;

/**
 * Zoom per pixel of scroll when Control is held. A trackpad pinch reaches the
 * page as a Control+wheel event with small deltas, so it needs a steeper rate
 * than a swipe to feel like a pinch.
 */
export const CTRL_WHEEL_ZOOM_RATE = 0.01;

/**
 * The zoom factor one wheel event asks for. Scroll adds up: the factor is an
 * exponential of the scroll amount, so the dozens of small events of a
 * trackpad swipe zoom the view by what the swipe was worth in all, and a mouse
 * notch of about 100 pixels zooms it by about 1.17x. A fixed step per event
 * made one light swipe zoom twenty-fold.
 *
 * A negative delta (scrolling up, away from you) zooms in, as the wheel
 * always has here. Zooming in by a delta and out by the same delta multiplies
 * to 1, so a gesture that reverses lands where it began.
 * @param deltaY - The event's vertical scroll amount
 * @param deltaMode - The event's `deltaMode`: pixels, lines or pages. A mode
 * this does not know is read as pixels
 * @param ctrlKey - Whether Control was held, which is how a trackpad pinch
 * arrives
 * @param viewportHeight - The viewport's height in pixels, which a page of
 * scroll is measured by
 * @returns The factor to zoom by: above 1 zooms in, below 1 zooms out, and 1
 * when the delta is zero or not a number
 */
export function wheelZoomFactor(
  deltaY: number,
  deltaMode: number,
  ctrlKey: boolean,
  viewportHeight: number,
): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return 1;
  }

  let pixels = deltaY;
  if (deltaMode === DOM_DELTA_LINE) {
    pixels = deltaY * PIXELS_PER_LINE;
  } else if (deltaMode === DOM_DELTA_PAGE) {
    pixels = deltaY * viewportHeight;
  }

  // A page delta against an unusable viewport is not a number worth zooming by.
  if (!Number.isFinite(pixels)) {
    return 1;
  }

  const clamped = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, pixels));
  const rate = ctrlKey ? CTRL_WHEEL_ZOOM_RATE : WHEEL_ZOOM_RATE;

  return Math.exp(-clamped * rate);
}
