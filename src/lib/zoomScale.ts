/**
 * The zoom slider's scale, and how the app prints a coordinate for the user.
 *
 * A slider running linearly from MIN_ZOOM to MAX_ZOOM puts nine tenths of its
 * travel above 1000x: the whole 1x-100x range, where most exploring happens,
 * is a sliver at the left end. Mapping the slider position through a power of
 * ten instead makes every equal step the same zoom ratio, so the low end gets
 * as much travel as the high end. The slider itself stays a plain range input
 * (components/ui/Slider.tsx) — callers hand it the mapped position, and it
 * never hears the word "zoom".
 *
 * Coordinates have the mirror-image problem: a float64 such as
 * -1.8965650826446265 carries sixteen digits, and the ones past the sixth say
 * nothing a fractal explorer can act on. formatCoordinate shortens the text
 * without shortening the value behind it.
 *
 * Everything here is pure, so both the round trip and the formatting are
 * testable without a browser.
 */

import { MAX_ZOOM, MIN_ZOOM } from "./mandelbrot";

/** How the slider is quantised. Fine enough that a keyboard arrow is a
 * sub-percent change of zoom, coarse enough that the thumb does not jitter. */
export const ZOOM_SLIDER_STEP = 0.001;

/** Powers of ten between MIN_ZOOM and MAX_ZOOM — what the slider spans. */
const ZOOM_DECADES = Math.log10(MAX_ZOOM / MIN_ZOOM);

/** Digits kept when a number is shown to the user in a fixed or exponential
 * form. */
const DISPLAY_DIGITS = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The zoom a slider position stands for: position t in 0..1 maps to
 * 10^(4t) times the minimum, so t = 0 is 1x, t = 0.5 is 100x and t = 1 is
 * 10000x. Equal steps of t are equal zoom *ratios*, not equal zoom amounts.
 *
 * @param position slider position, clamped to 0..1
 */
export function sliderToZoom(position: number): number {
  return MIN_ZOOM * Math.pow(10, ZOOM_DECADES * clamp(position, 0, 1));
}

/**
 * The slider position that shows a zoom level — the inverse of sliderToZoom.
 * A zoom outside the slider's range pins the slider to the end it lies beyond,
 * and a zoom of zero or less (or anything that is not a number) reads as the
 * left end, since there is no position for it.
 *
 * @param zoom a zoom level
 */
export function zoomToSlider(zoom: number): number {
  const decades = zoom > 0 ? Math.log10(zoom / MIN_ZOOM) : 0;
  return clamp(decades / ZOOM_DECADES, 0, 1);
}

/**
 * A number as short text for a coordinate box: at most six significant digits,
 * with trailing zeros dropped so 0.75 does not print as 0.750000. Values whose
 * magnitude needs it (below 1e-6, above 1e6) keep their exponent rather than
 * printing a row of zeros.
 *
 * This formats text only. Callers hold the full-precision value and hand this
 * the digits to show, so nothing downstream loses precision to a rounded
 * string.
 */
export function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) return value.toString();

  const [mantissa, exponent] = value.toPrecision(DISPLAY_DIGITS).split("e");
  const trimmed = mantissa.includes(".")
    ? mantissa.replace(/0+$/, "").replace(/\.$/, "")
    : mantissa;

  return exponent ? `${trimmed}e${exponent}` : trimmed;
}
