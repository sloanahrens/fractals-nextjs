/**
 * A view as a link: the explorer's state as a short URL fragment, and back.
 *
 * Everything a picture is made of lives in the page — which fractal, where it
 * is framed, how deep, which colours, how many iterations, how big the canvas
 * is — so a view somebody found has no way of leaving the browser it was found
 * in. This module is the one description of what a link carries and the one
 * reader of it, kept apart from the page so both halves are pure: no window, no
 * location, no history, and a round trip a test can drive in Node.
 *
 * The form is a query string without its `#`, version first, then one short key
 * per field in a fixed order:
 *
 *   v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600
 *
 * `v` is the version, so a link from a build that means something else by these
 * keys is refused rather than half-read. `f` names the fractal and `k`, written
 * only beside a Julia fractal, names its constant. `x` and `y` are the centre,
 * `z` the zoom, `s` the colour scheme — colour is part of the picture, so all
 * five travel — `i` the iteration setting, `auto` or the count when the slider
 * is in charge, and `w`/`h` the canvas size as a pair. Short keys, because a
 * link is meant to be pasted into a chat; a fixed order, so one view is always
 * one string.
 *
 * A number is written as plain decimal digits: at most ten significant of them,
 * no trailing zeros, never an exponent. Ten, because the deepest zoom shows
 * 4e-4 of the plane and a coordinate has to survive to about 1e-9 to come back
 * where it was.
 *
 * Reading is the suspicious half. A link arrives from anywhere, so nothing in
 * it is trusted: an unknown key is ignored, and every value is judged on its
 * own and left out when it fails, which puts the page on its default for that
 * field rather than on a broken one. Nothing here throws — not for a truncated
 * fragment, not for a percent sign that ends the string, not for a 600
 * character paste — so a bad link is a page looking the way it did before,
 * never an error screen.
 */

import type { ColorScheme } from "../types/fractal";
import { getAvailableColorSchemes } from "./colorMapping";
import { FRACTAL_TYPES } from "./fractalTypes";
import { JULIA_CONSTANTS } from "./julia";
import {
  ITERATION_STEP,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  clampZoom,
} from "./mandelbrot";

/**
 * The view the explorer is in, as a link carries it.
 *
 * The field names are the page's own, so wiring this up is a pass field by
 * field rather than a translation between two vocabularies.
 */
export interface ViewLinkState {
  /** Id of the fractal drawn, from {@link FRACTAL_TYPES} */
  fractalType: string;
  /**
   * Name of the Julia constant, from {@link JULIA_CONSTANTS}.
   *
   * Written only beside a Julia fractal, because the fractal and its constant
   * are one choice; a state that names a constant for another fractal is not
   * one this codec writes, and its link reads back without it.
   */
  juliaConstant?: string;
  /** Real part of the centre of the view */
  centerX: number;
  /** Imaginary part of the centre of the view */
  centerY: number;
  /** Magnification: 1 is the whole base view, 10000 the deepest the app goes */
  zoomLevel: number;
  /** Colour scheme the picture is drawn in */
  colorScheme: ColorScheme;
  /** Whether the zoom picks the iteration count instead of the slider */
  autoIterationsOn: boolean;
  /**
   * The count the slider is on, in force when {@link autoIterationsOn} is
   * false.
   *
   * An auto view carries no count: the zoom picks one, and a number left over
   * from before the switch is not part of the picture.
   */
  maxIterations?: number;
  /** Canvas width in pixels */
  canvasWidth: number;
  /** Canvas height in pixels */
  canvasHeight: number;
}

/** The version this build writes, and the only one it reads. */
const VERSION = 1;

/**
 * The canvas sizes the resolution buttons offer, as the pairs a link carries.
 *
 * A size is one of these three pairs rather than any width with any height,
 * because the buttons are the only way the app makes a canvas: a link naming
 * another pair names a view the app cannot reach.
 */
export const CANVAS_SIZES: readonly { width: number; height: number }[] = [
  { width: 400, height: 300 },
  { width: 800, height: 600 },
  { width: 1200, height: 900 },
];

/**
 * How far from the origin a link may put the centre.
 *
 * Every fractal here is framed within a few units of it and the base view is
 * 4 x 3, so a coordinate outside this box is not a view anyone found; reading
 * one would be following a link to empty plane.
 */
const COORDINATE_LIMIT = 10;

/** Significant digits a number is written with. */
const SIGNIFICANT_DIGITS = 10;

/**
 * The longest fragment worth reading.
 *
 * A link for even the busiest state is about 90 characters, so a longer paste
 * is not one, and there is no reason to walk it.
 */
const MAX_FRAGMENT_LENGTH = 500;

/** What `i` says when the zoom, not the slider, picks the count. */
const AUTO_ITERATIONS = "auto";

/** A number written the way {@link numberText} writes one. */
const NUMBER_PATTERN = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * A number as the format writes it: plain decimal digits, at most ten
 * significant of them, no trailing zeros and never an exponent.
 *
 * @param value - The number to write
 * @returns Its text, or null when the format cannot carry the value at all:
 *   one that is not finite, or one so small that plain decimal needs more
 *   places than JavaScript will write
 */
function numberText(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  if (value === 0) return "0";

  // The most significant digit sits at 10^exponent, so this many places past
  // the point keeps SIGNIFICANT_DIGITS of them. A number at or above 10^9
  // needs none of them.
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const places = Math.max(0, SIGNIFICANT_DIGITS - 1 - exponent);

  let text: string;
  try {
    text = value.toFixed(places);
  } catch {
    // toFixed writes at most 100 places, which is a number below about 1e-91.
    return null;
  }

  // 2.560000000 -> 2.56, 10000.0000000 -> 10000. The integer case keeps its
  // zeros: they are the magnitude, not padding. A value that rounds away to
  // nothing (-0.000) is zero at this precision and says so.
  const trimmed = text.includes(".")
    ? text.replace(/0+$/, "").replace(/\.$/, "")
    : text;

  return trimmed === "-0" ? "0" : trimmed;
}

/**
 * The number a link's text stands for, or null when it is not one this format
 * writes.
 *
 * Strict on purpose. `Number` on its own reads `0x10` as 16, `1e3` as 1000 and
 * ` 12 ` as 12; a link is text from somewhere else, and the only number this
 * format writes is decimal digits with an optional sign and point.
 *
 * @param text - The value out of the fragment, or null when the key was absent
 * @returns The number, or null when the text is not one
 */
function numberFrom(text: string | null): number | null {
  if (text === null || !NUMBER_PATTERN.test(text)) return null;

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** A fractal id this build draws, or null. */
function fractalNamed(id: string | null | undefined): string | null {
  return id != null && FRACTAL_TYPES.some((type) => type.id === id) ? id : null;
}

/** A Julia constant name this build offers, or null. */
function constantNamed(name: string | null | undefined): string | null {
  return name != null &&
    JULIA_CONSTANTS.some((constant) => constant.name === name)
    ? name
    : null;
}

/** A colour scheme this build draws in, or null. */
function schemeNamed(value: string | null | undefined): ColorScheme | null {
  return (
    getAvailableColorSchemes().find((scheme) => scheme.value === value)
      ?.value ?? null
  );
}

/** A centre inside the box a link may name, or null. */
function coordinateOf(value: number | null): number | null {
  return value !== null && Math.abs(value) <= COORDINATE_LIMIT ? value : null;
}

/**
 * A zoom inside the explorer's range, or null.
 *
 * Clamped rather than refused: a zoom past either end is a view of this
 * fractal, just not as far out or as far in as it says, and the app clamps a
 * wheel or a drag the same way.
 */
function zoomOf(value: number | null): number | null {
  return value === null ? null : clampZoom(value);
}

/**
 * An iteration count inside the slider's range, landed on its step, or null.
 *
 * A count outside the range is not one the explorer can be in and is refused.
 * One inside it but off the step is put on the step, the way the count the zoom
 * picks is, so a hand-written link still lands on a value the slider can show
 * rather than being thrown away over one digit.
 */
function countOnStep(value: number | null): number | null {
  if (value === null || !Number.isInteger(value)) return null;
  if (value < MIN_ITERATIONS || value > MAX_ITERATIONS) return null;

  const onStep = Math.round(value / ITERATION_STEP) * ITERATION_STEP;

  return Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, onStep));
}

/**
 * The canvas size a link carries, or null.
 *
 * The width and the height are one value: a pair the resolution buttons do not
 * offer is not a size, so neither is read rather than the width being taken and
 * the height dropped.
 */
function canvasSize(
  width: number | null,
  height: number | null,
): { width: number; height: number } | null {
  if (width === null || height === null) return null;

  return (
    CANVAS_SIZES.find(
      (size) => size.width === width && size.height === height,
    ) ?? null
  );
}

/** Write a number under its key, when the format can carry it. */
function addNumber(
  fields: URLSearchParams,
  key: string,
  value: number | null,
): void {
  const text = value === null ? null : numberText(value);

  if (text !== null) fields.set(key, text);
}

/**
 * The link for a view.
 *
 * A field the format cannot carry is left out of the link, exactly as the
 * decoder leaves out a field it cannot read, so the two halves agree on what a
 * link holds and the page keeps its default for whatever is missing. The
 * version is always written.
 *
 * @param state - The view to write
 * @returns The fragment's text, beginning `v=1&` and with no leading `#`
 */
export function encodeView(state: ViewLinkState): string {
  const fields = new URLSearchParams();

  // Written in this order because the string a view produces is part of the
  // format: one view is always one link.
  fields.set("v", String(VERSION));

  const fractal = fractalNamed(state.fractalType);
  if (fractal !== null) fields.set("f", fractal);

  // The constant belongs to the fractal it was chosen with, so it is written
  // beside a Julia fractal and nowhere else.
  if (fractal === "julia") {
    const constant = constantNamed(state.juliaConstant);
    if (constant !== null) fields.set("k", constant);
  }

  addNumber(fields, "x", coordinateOf(state.centerX));
  addNumber(fields, "y", coordinateOf(state.centerY));
  addNumber(fields, "z", zoomOf(state.zoomLevel));

  const scheme = schemeNamed(state.colorScheme);
  if (scheme !== null) fields.set("s", scheme);

  if (state.autoIterationsOn) {
    fields.set("i", AUTO_ITERATIONS);
  } else {
    const count = countOnStep(state.maxIterations ?? null);
    if (count !== null) fields.set("i", String(count));
  }

  const size = canvasSize(state.canvasWidth, state.canvasHeight);
  if (size !== null) {
    addNumber(fields, "w", size.width);
    addNumber(fields, "h", size.height);
  }

  return fields.toString();
}

/**
 * The view a link describes, field by field, with everything unreadable left
 * out.
 *
 * @param fragment - The link, with or without its leading `#`
 * @returns The fields the link carried and this build could read; an empty
 *   object for a fragment that is not a link of this version, including one
 *   past {@link MAX_FRAGMENT_LENGTH}
 */
export function decodeView(fragment: string): Partial<ViewLinkState> {
  const state: Partial<ViewLinkState> = {};

  if (typeof fragment !== "string") return state;
  if (fragment.length > MAX_FRAGMENT_LENGTH) return state;

  // A fragment copied out of a URL bar carries its `#`, and the one a Copy
  // link button writes does not.
  const text = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const fields = new URLSearchParams(text);

  // The version is read first and nothing else is read without it: a link from
  // a build that means something else by these keys is not half a view, it is
  // no view.
  if (fields.get("v") !== String(VERSION)) return state;

  const fractal = fractalNamed(fields.get("f"));
  if (fractal !== null) state.fractalType = fractal;

  // Read on its own, like every other value here: the format writes a constant
  // only beside a Julia fractal, and a link that carries one without its
  // fractal still names a constant this build can draw.
  const constant = constantNamed(fields.get("k"));
  if (constant !== null) state.juliaConstant = constant;

  const centerX = coordinateOf(numberFrom(fields.get("x")));
  if (centerX !== null) state.centerX = centerX;

  const centerY = coordinateOf(numberFrom(fields.get("y")));
  if (centerY !== null) state.centerY = centerY;

  const zoom = zoomOf(numberFrom(fields.get("z")));
  if (zoom !== null) state.zoomLevel = zoom;

  const scheme = schemeNamed(fields.get("s"));
  if (scheme !== null) state.colorScheme = scheme;

  if (fields.get("i") === AUTO_ITERATIONS) {
    state.autoIterationsOn = true;
  } else {
    const count = countOnStep(numberFrom(fields.get("i")));
    if (count !== null) {
      state.autoIterationsOn = false;
      state.maxIterations = count;
    }
  }

  const size = canvasSize(
    numberFrom(fields.get("w")),
    numberFrom(fields.get("h")),
  );
  if (size !== null) {
    state.canvasWidth = size.width;
    state.canvasHeight = size.height;
  }

  return state;
}
