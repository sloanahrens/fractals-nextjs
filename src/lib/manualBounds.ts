import { FractalBounds } from "../types/fractal";
import { BASE_HEIGHT, BASE_WIDTH } from "./mandelbrot";

/**
 * What the Manual Coordinates panel makes of the four boxes
 *
 * Two questions, both of them about a box the user typed in: can Apply use it
 * at all, and is it the shape of the view? The first answer is the bounds to
 * apply or the messages to show instead; the second decides whether a valid box
 * needs a note, because the view it lands on is fitted around the box's centre
 * rather than shaped like it.
 */

/**
 * A coordinate box the user never touched is not empty: it mirrors the view, and
 * Apply then has the view's own float64 to work with. A box the user *did* type
 * in is read as text, and this is the read.
 *
 * @param text - Exactly what is in the box
 * @returns The number it holds, or NaN for an empty box or one holding
 * something that is not a number — the same answer `checkManualBounds` reports
 */
export function readManualCoordinate(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return NaN;

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : NaN;
}

/** The four boxes as numbers, NaN for a box that could not be read. */
export interface ManualBoundsInput {
  minReal: number;
  maxReal: number;
  minImaginary: number;
  maxImaginary: number;
}

/** Either the bounds a box stands for, or why Apply cannot use it. */
export type ManualBoundsCheck =
  { ok: true; bounds: FractalBounds } | { ok: false; messages: string[] };

/**
 * Said when a box is empty or holds something that is not a number. One
 * sentence for the four together, because the four are read together and the
 * boxes that are wrong would otherwise need naming.
 */
export const MANUAL_NUMBER_MESSAGE = "Enter all four coordinates as numbers.";

/** Said when the real pair runs the wrong way, including two equal values. */
export const MANUAL_REAL_ORDER_MESSAGE = "Min Real must be less than Max Real.";

/** Said when the imaginary pair runs the wrong way. */
export const MANUAL_IMAGINARY_ORDER_MESSAGE =
  "Min Imaginary must be less than Max Imaginary.";

/**
 * Said when a valid box of another shape is fitted to the view. The view keeps
 * the 4:3 shape of the canvas, so the box's width is what survives the apply.
 */
export const MANUAL_FITTED_MESSAGE =
  "Fitted to the 4:3 view around the centre of your box.";

/** The shape every view has: the base view's 4 x 3. */
export const BASE_ASPECT = BASE_WIDTH / BASE_HEIGHT;

/**
 * How far a box's shape may sit from 4:3 and still count as that shape, as a
 * fraction of 4:3. Bounds arrive from zooms, drags and coordinate round-trips,
 * so the last bits of the four numbers are not the bits multiplying by 4/3
 * would produce, while a box meant as another shape is off by far more.
 */
export const ASPECT_TOLERANCE = 1e-6;

/**
 * Whether a box is the shape of the view, so applying it fits it to nothing
 *
 * @param bounds - The box to measure
 * @returns True when the box is 4:3 within `ASPECT_TOLERANCE`
 */
export function hasBaseAspect(bounds: FractalBounds): boolean {
  const width = bounds.maxReal - bounds.minReal;
  const height = bounds.maxImaginary - bounds.minImaginary;
  const aspect = width / height;

  return Math.abs(aspect - BASE_ASPECT) <= ASPECT_TOLERANCE * BASE_ASPECT;
}

/**
 * Read the four boxes the way Apply does
 *
 * A box that could not be read is reported on its own: comparing the order of
 * four values when one of them is not a number would accuse a pair the user can
 * see nothing wrong with. An order is wrong when the minimum is not below the
 * maximum, equality included, and each axis is reported separately so a box
 * reversed on both is corrected in one pass.
 *
 * A valid box is returned as it stands. Whether the view can take its shape is
 * `hasBaseAspect`'s question, asked by the caller so a fitted box is a note
 * rather than a refusal.
 *
 * @param values - The four boxes as numbers, NaN for one that could not be read
 * @returns The bounds, or the messages to show under the boxes
 */
export function checkManualBounds(
  values: ManualBoundsInput,
): ManualBoundsCheck {
  const { minReal, maxReal, minImaginary, maxImaginary } = values;

  if (![minReal, maxReal, minImaginary, maxImaginary].every(Number.isFinite)) {
    return { ok: false, messages: [MANUAL_NUMBER_MESSAGE] };
  }

  const messages: string[] = [];
  if (minReal >= maxReal) messages.push(MANUAL_REAL_ORDER_MESSAGE);
  if (minImaginary >= maxImaginary) {
    messages.push(MANUAL_IMAGINARY_ORDER_MESSAGE);
  }
  if (messages.length > 0) return { ok: false, messages };

  return { ok: true, bounds: { minReal, maxReal, minImaginary, maxImaginary } };
}
