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
 * only beside a fractal that takes a variant, names it: for Julia its constant
 * — one of the four the picker offers, or a custom name that is a point of the
 * plane written out (see `julia.ts`) — and for the Multibrot its power, `3`,
 * `4` or `5` (`f=multibrot&k=4`). `x` and `y` are the centre,
 * `z` the zoom, `s` the colour scheme — colour is part of the picture, so all
 * five travel — `i` the iteration setting, `auto` or the count when the slider
 * is in charge, and `w`/`h` the canvas size as a pair. Short keys, because a
 * link is meant to be pasted into a chat; a fixed order, so one view is always
 * one string.
 *
 * The scheme has two settings of its own, written between `s` and `i` because
 * they are colour, not shape: `r=1` when the scheme is reversed, and `o` how
 * far round the palette it starts (`s=fire&r=1&o=0.25`). Each is written only
 * when it is asking for something — no `r` is not reversed, no `o` is a shift
 * of nought — so the link of a view that touches neither is byte for byte what
 * it was before these existed.
 *
 * `m` names the colouring method when it is not the iteration count: `point`,
 * `line` or `circle`, an orbit trap (`orbitTrap.ts`), written after `o`. It is
 * carried like `r` and `o` — no `m` is the iteration count, and a value this
 * build cannot read is no trap — but it is not a colour-only key
 * (`linkWithoutColour` keeps it), because a trap picture is made of other
 * numbers than a count picture and a change of `m` is a new render.
 *
 * A number is written as plain decimal digits: at most ten significant of them,
 * no trailing zeros, never an exponent. Ten, because the deepest zoom shows
 * 4e-4 of the plane and a coordinate has to survive to about 1e-9 to come back
 * where it was.
 *
 * Reading is the suspicious half. A link arrives from anywhere, so nothing in
 * it is trusted: an unknown key is ignored, and every value is judged on its
 * own and left out when it fails, which puts the page on its default for that
 * field rather than on a broken one — and that default is the named fractal's
 * own frame for a centre or a zoom, since a link may name a picture and no
 * place in it (`viewLinkState.ts`). Nothing here throws — not for a truncated
 * fragment, not for a percent sign that ends the string, not for a 600
 * character paste — so a bad link is a page looking the way it did before,
 * never an error screen.
 *
 * Several of these views in order are a *tour link* (`tourLink.ts`): the module
 * writes the same fields under one column per field, so a stop of a tour is
 * this codec's view and is written and read by these functions. The other
 * meaning of the word in this file is {@link decodeTour} below, the `#tour`
 * fragment that asks a page for a wandering tour rather than naming views to
 * walk.
 */

import type { ColorScheme, TrapShape } from "../types/fractal";
import { getAvailableColorSchemes } from "./colorMapping";
import { FRACTAL_TYPES, isVariantValue } from "./fractalTypes";
import {
  ITERATION_STEP,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  clampZoom,
} from "./mandelbrot";
import { TRAP_SHAPES } from "./orbitTrap";

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
   * The fractal's variant (`fractalVariants`), written as `k`. Julia and the
   * Multibrot have one: for Julia one of the named four constants, or a custom
   * name that spells out a point (`julia.ts` has both spellings); for the
   * Multibrot its power, "3", "4" or "5".
   *
   * Written only beside a fractal that takes it and can draw the value,
   * because the fractal and its variant are one choice; a state that names a
   * variant for another fractal, or a power for Julia, is not one this codec
   * writes, and its link reads back without it.
   */
  variant?: string;
  /** Real part of the centre of the view */
  centerX: number;
  /** Imaginary part of the centre of the view */
  centerY: number;
  /** Magnification: 1 is the whole base view, 10000 the deepest the app goes */
  zoomLevel: number;
  /** Colour scheme the picture is drawn in */
  colorScheme: ColorScheme;
  /**
   * Whether the colour scheme is walked backwards (`ColorOptions.reverse`).
   * Written as `r=1`, and only when it is true: a link that says nothing about
   * reversing names the scheme the app has always drawn.
   */
  reverse?: boolean;
  /**
   * How far round the palette the colours start, a fraction of a turn
   * (`ColorOptions.shift`). Written as `o`, and only when it is not nought.
   */
  shift?: number;
  /**
   * The orbit trap the picture is coloured by, or null for the iteration-count
   * picture. Written as `m` (the colouring method), and only when it is a
   * shape: a link that says nothing about it names the picture the app has
   * always drawn.
   */
  trap?: TrapShape | null;
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
export const VIEW_LINK_VERSION = 1;

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
export const MAX_FRAGMENT_LENGTH = 500;

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

/**
 * A variant value this build reads, or null: a Julia constant (named or custom)
 * or a Multibrot power. Which fractal a value belongs to is not asked here,
 * since the codec reads every field on its own; the page's half
 * (`viewLinkToUpdates`) keeps a value for a fractal that can use it.
 */
function variantNamed(name: string | null | undefined): string | null {
  return FRACTAL_TYPES.some((type) => isVariantValue(type.id, name))
    ? (name ?? null)
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
 * The trap a link's `m` names, or null when it names none this build reads.
 *
 * Only the three spellings are traps, exactly: no case folding, no padding, so
 * `m=Point`, `m=` and `m=spiral` are no trap and the page keeps its own.
 */
function trapFrom(text: string | null): TrapShape | null {
  return TRAP_SHAPES.find((shape) => shape === text) ?? null;
}

/** How many decimals of a palette shift a link carries. */
const SHIFT_DECIMALS = 2;

/**
 * The shift a link's `o` names, or null when it names none this build reads.
 *
 * Only a number inside 0 to 1 is a shift of this palette: the mapping adds the
 * shift modulo a whole turn, so a whole turn is no shift at all and reads as
 * nought, while a value outside the range — negative, past 1, or not a number
 * — is left out rather than wrapped. A link that says `o=7` is not a link about
 * any palette this app draws.
 */
function shiftFrom(text: string | null): number | null {
  const value = numberFrom(text);
  if (value === null || value < 0 || value > 1) return null;

  return value === 1 ? 0 : value;
}

/**
 * The shift a link writes, or null when it writes none.
 *
 * The shift is a fraction of a turn and two decimals is enough of one: a
 * hundredth of the way round a palette is a shade nobody can name, and the
 * shorter `o` keeps a link short. A shift whose two decimals come to a whole
 * turn — 0.999 rounds there — is the colours a shift of nought gives, so none
 * is written, exactly as for a shift of nought itself. A value outside 0 to 1
 * is written as the fraction it is worth (`shiftFrom` reads it back the same
 * way), since the mapping reads every shift modulo a turn.
 */
function shiftForLink(shift: number | undefined): number | null {
  if (shift === undefined || !Number.isFinite(shift)) return null;

  const places = 10 ** SHIFT_DECIMALS;
  const wrapped = shift - Math.floor(shift);
  const rounded = (Math.round(wrapped * places) % places) / places;

  return rounded === 0 ? null : rounded;
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
 * link holds and the reader fills in whatever is missing: the page's opening
 * view, or the named fractal's own frame for a centre or a zoom
 * (`viewLinkState.ts`). The version is always written.
 *
 * @param state - The view to write
 * @returns The fragment's text, beginning `v=1&` and with no leading `#`
 */
export function encodeView(state: ViewLinkState): string {
  const fields = new URLSearchParams();

  // Written in this order because the string a view produces is part of the
  // format: one view is always one link.
  fields.set("v", String(VIEW_LINK_VERSION));

  const fractal = fractalNamed(state.fractalType);
  if (fractal !== null) fields.set("f", fractal);

  // The variant belongs to the fractal it was chosen with, so it is written
  // beside a fractal that takes one and can draw it (a Julia constant beside
  // Julia, a power beside the Multibrot) and nowhere else.
  if (fractal !== null && isVariantValue(fractal, state.variant)) {
    fields.set("k", state.variant);
  }

  addNumber(fields, "x", coordinateOf(state.centerX));
  addNumber(fields, "y", coordinateOf(state.centerY));
  addNumber(fields, "z", zoomOf(state.zoomLevel));

  const scheme = schemeNamed(state.colorScheme);
  if (scheme !== null) fields.set("s", scheme);

  // The scheme's own two settings, beside it and before the iteration count:
  // they colour the picture without changing what it is made of.
  if (state.reverse) fields.set("r", "1");
  addNumber(fields, "o", shiftForLink(state.shift));
  const trap = trapFrom(state.trap ?? null);
  if (trap !== null) fields.set("m", trap);

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

/** The fragment that is nothing but a request for a tour. */
const TOUR_FRAGMENT = "tour";

/** The fields that colour a picture without changing what it is made of. */
const COLOUR_ONLY_KEYS = ["s", "r", "o"];

/**
 * A link with everything that only colours it left out.
 *
 * Colour is the one part of a view that does not change what the picture is
 * made of: the same fractal, framed the same way, drawn another way. That is
 * the scheme itself and its two settings — a reversal and a shift — and two
 * links that agree in everything else name a picture whose iteration counts are
 * the same numbers, so the page asks this before it repaints the canvas from
 * the counts of the render that finished (`FractalRenderer.recolour`) rather
 * than counting the view again.
 *
 * @param fragment - The link, with or without its leading `#`
 * @returns The same link without its `s`, `r` and `o` fields, and without a
 *   leading `#`
 */
export function linkWithoutColour(fragment: string): string {
  const text = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const fields = new URLSearchParams(text);

  for (const key of COLOUR_ONLY_KEYS) fields.delete(key);

  return fields.toString();
}

/**
 * Whether a link asks for a tour to start.
 *
 * Two spellings do: the whole fragment is `#tour`, or a link of this version
 * carries `tour=1` beside its view. Neither is something `encodeView` writes —
 * a tour is a thing a link does when it is opened, not part of the view — so
 * the address bar goes back to following the view once the tour has started.
 *
 * `tour=1` is read only in a link the decoder would read: a fragment from
 * another version, or one past {@link MAX_FRAGMENT_LENGTH}, asks for nothing,
 * and so does any other value of `tour`. The view a `#tour` link opens on is
 * the page's default, because the fragment carries no field of a view.
 *
 * This is the *wandering* tour, which carries no views. A link that names the
 * views to walk is a tour link (`tourLink.ts`), whose columns this function
 * does not read; the two are told apart by their own limits and keys.
 *
 * @param fragment - The link, with or without its leading `#`
 * @returns True when the link asks for a tour; false for anything else,
 *   garbage included
 */
export function decodeTour(fragment: string): boolean {
  if (typeof fragment !== "string") return false;
  if (fragment.length > MAX_FRAGMENT_LENGTH) return false;

  const text = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (text === TOUR_FRAGMENT) return true;

  const fields = new URLSearchParams(text);

  return (
    fields.get("v") === String(VIEW_LINK_VERSION) && fields.get("tour") === "1"
  );
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
  if (fields.get("v") !== String(VIEW_LINK_VERSION)) return state;

  const fractal = fractalNamed(fields.get("f"));
  if (fractal !== null) state.fractalType = fractal;

  // Read on its own, like every other value here: the format writes a variant
  // only beside a fractal that takes one, and a link that carries one without
  // its fractal still names a value this build can draw.
  const variant = variantNamed(fields.get("k"));
  if (variant !== null) state.variant = variant;

  const centerX = coordinateOf(numberFrom(fields.get("x")));
  if (centerX !== null) state.centerX = centerX;

  const centerY = coordinateOf(numberFrom(fields.get("y")));
  if (centerY !== null) state.centerY = centerY;

  const zoom = zoomOf(numberFrom(fields.get("z")));
  if (zoom !== null) state.zoomLevel = zoom;

  const scheme = schemeNamed(fields.get("s"));
  if (scheme !== null) state.colorScheme = scheme;

  // Read on their own, as every field here is: a link that carries the
  // scheme's two settings without a scheme the build knows still names a
  // reversal and a shift, and the scheme they are applied to is the page's.
  if (fields.get("r") === "1") state.reverse = true;

  const shift = shiftFrom(fields.get("o"));
  if (shift !== null) state.shift = shift;

  const trap = trapFrom(fields.get("m"));
  if (trap !== null) state.trap = trap;

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
