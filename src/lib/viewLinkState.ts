/**
 * The page's side of a view link: what a decoded link means as the values the
 * page holds, and when the address bar may be written.
 *
 * `viewLink.ts` is the format — it writes a view as a fragment and reads a
 * fragment back into the fields it could. This module is what the page does
 * with that reading. A link is *partial* and the page's state is not, so every
 * field the link did not carry — including every field the codec refused,
 * which it reports by leaving the field out — has to be filled with the value
 * the page opens on. That filling is `viewLinkToUpdates`, and it lives here
 * rather than in the page so the whole of the rule can be driven in Node.
 *
 * `DEFAULT_VIEW_LINK_UPDATES` is that opening view, and the page initialises
 * its state from it. A link's defaults are therefore the page's defaults by
 * construction, instead of two lists that have to be kept in step by hand.
 *
 * `viewLinkUpdatesFrom` is that reading and that filling in one call, because
 * the page asks the question twice with the same answer wanted both times: once
 * for the fragment the document loaded with, and again for every fragment that
 * arrives afterwards through `hashchange`. A paste is a load, so there is one
 * function.
 *
 * The rest is the throttle. The address bar follows the view, but a view moves
 * many times a second — a drag, a wheel burst, a step of the random walk — and
 * a `replaceState` per settled view is work the browser does for a string
 * nobody is reading. `shouldWriteLink` is the rule that limits those writes:
 * not twice within `LINK_WRITE_INTERVAL_MS`, and never for a view the address
 * bar already describes.
 */

import type { ColorScheme } from "../types/fractal";
import { defaultVariant, defaultViewFor, isVariantValue } from "./fractalTypes";
import { decodeView, type ViewLinkState } from "./viewLink";

/**
 * A view as the page holds it: one value per piece of state a link can move.
 *
 * Every field is present, so applying a link is ten assignments rather than a
 * set of questions about which fields arrived and which did not.
 */
export interface ViewLinkUpdates {
  /** Id of the fractal to draw, from {@link FRACTAL_TYPES} */
  fractalType: string;
  /**
   * The fractal's variant: for Julia a constant, named or a custom spelling of
   * a point. One string for every fractal, kept across a change of fractal, so
   * it opens on Julia's default whatever fractal the page opens on.
   */
  variant: string;
  /** Real part of the centre of the view */
  centerX: number;
  /** Imaginary part of the centre of the view */
  centerY: number;
  /** Magnification, 1 for the whole base view */
  zoomLevel: number;
  /** Colour scheme to draw in */
  colorScheme: ColorScheme;
  /** Whether the zoom picks the iteration count */
  autoIterationsOn: boolean;
  /** The count the slider is on, in force when auto is off */
  maxIterations: number;
  /** Canvas width in pixels */
  canvasWidth: number;
  /** Canvas height in pixels */
  canvasHeight: number;
}

/** Where the Mandelbrot set is framed, which is where the page opens. */
const DEFAULT_VIEW = defaultViewFor("mandelbrot");

/**
 * The view the page opens on, and so the view a link's missing fields leave
 * alone.
 *
 * The page takes its initial state from this, which is what makes a link's
 * defaults and a fresh visit the same view: a field the format cannot carry,
 * or one out of a link this build refuses, lands on exactly what the page
 * shows before anything is touched.
 */
export const DEFAULT_VIEW_LINK_UPDATES: ViewLinkUpdates = {
  fractalType: "mandelbrot",
  variant: defaultVariant("julia"),
  centerX: DEFAULT_VIEW.centerX,
  centerY: DEFAULT_VIEW.centerY,
  zoomLevel: DEFAULT_VIEW.zoom,
  colorScheme: "classic",
  autoIterationsOn: true,
  maxIterations: 100,
  canvasWidth: 800,
  canvasHeight: 600,
};

/**
 * What a decoded link means for the page.
 *
 * A field the link did not carry keeps the value the page opens on. Nothing
 * arriving here has to be refused: the codec judges each value on its own and
 * leaves out what it cannot read, so a fragment from another build, or from
 * nowhere at all, decodes to no fields and leaves every default standing.
 *
 * The variant is only applied to a fractal that takes one, which is the codec's
 * own rule seen from this side: it writes `k` only beside `f=julia`, because the
 * fractal and its constant are one choice. A link naming the Mandelbrot set
 * and a constant is a link about the Mandelbrot set, with a field in it that
 * means nothing. The name is judged once more on the way in, because of all
 * these fields it is the one whose shape is a spelling rather than a range:
 * asking the codec's own question again costs a call and leaves this
 * function's answer about the constant a function of its argument rather than
 * of its caller.
 *
 * @param decoded - The fields a link carried, as `decodeView` read them
 * @returns The ten values to set, defaults included
 */
export function viewLinkToUpdates(
  decoded: Partial<ViewLinkState>,
): ViewLinkUpdates {
  const defaults = DEFAULT_VIEW_LINK_UPDATES;
  const fractalType = decoded.fractalType ?? defaults.fractalType;

  return {
    fractalType,
    variant: isVariantValue(fractalType, decoded.variant)
      ? decoded.variant
      : defaults.variant,
    centerX: decoded.centerX ?? defaults.centerX,
    centerY: decoded.centerY ?? defaults.centerY,
    zoomLevel: decoded.zoomLevel ?? defaults.zoomLevel,
    colorScheme: decoded.colorScheme ?? defaults.colorScheme,
    autoIterationsOn: decoded.autoIterationsOn ?? defaults.autoIterationsOn,
    maxIterations: decoded.maxIterations ?? defaults.maxIterations,
    canvasWidth: decoded.canvasWidth ?? defaults.canvasWidth,
    canvasHeight: decoded.canvasHeight ?? defaults.canvasHeight,
  };
}

/**
 * The view a fragment means, read and filled in one call.
 *
 * The page asks this of two fragments, and wants the same answer for both: the
 * one the document loaded with, and every one that arrives afterwards because
 * the fragment was edited in the address bar of a page already open (which is a
 * `hashchange`, and never a reload). A paste is a load — the fragment names the
 * view the page is to be in, and the page is to be in it whole.
 *
 * That is also the whole answer to a fragment this build cannot read in full. A
 * link from another version, a coordinate with a typo in it, a fragment that is
 * not a link at all: none is refused and none is half-applied. What the
 * fragment does carry is applied and the page's opening view stands for the
 * rest (see {@link viewLinkToUpdates}), so the page settles on the view that
 * URL describes. Ignoring such a fragment instead was rejected: the
 * address-bar follower writes only the view a render settled on, so a fragment
 * nobody read would sit in the bar contradicting the canvas until the user
 * moved something else. Read, it is written back, and bar and canvas agree
 * whether or not every field arrived.
 *
 * @param fragment - The fragment, as `window.location.hash` gives it: with its
 *   leading `#` when the address bar has one
 * @returns The ten values to set, the page's opening view for anything the
 *   fragment did not say
 */
export function viewLinkUpdatesFrom(fragment: string): ViewLinkUpdates {
  return viewLinkToUpdates(decodeView(fragment));
}

/**
 * How long the address bar is left alone after a write, in milliseconds.
 *
 * A gesture settles many views in well under this, and each one produces its
 * own fragment. Half a second keeps the address bar a little behind the canvas
 * instead of rewriting it a dozen times over a drag, while staying short enough
 * that the URL describes what is on screen by the time anyone could copy it.
 */
export const LINK_WRITE_INTERVAL_MS = 500;

/**
 * Whether the address bar may be written now.
 *
 * Two rules, and both are needed: a fragment the address bar already carries is
 * not written again, and two writes are never closer together than
 * {@link LINK_WRITE_INTERVAL_MS}. Being held back is not being dropped — the
 * caller comes back with {@link linkWriteDelayMs} when the interval is out — so
 * a view is never left out of the URL, only written late.
 *
 * @param previous - What the address bar says now
 * @param next - The fragment the view on screen produces
 * @param nowMs - The current time
 * @param lastWriteMs - When this page last wrote the address bar, or any time
 *   far enough in the past that a first write is not held back
 * @returns True when the write may happen now
 */
export function shouldWriteLink(
  previous: string,
  next: string,
  nowMs: number,
  lastWriteMs: number,
): boolean {
  if (previous === next) return false;

  return nowMs - lastWriteMs >= LINK_WRITE_INTERVAL_MS;
}

/**
 * How long the address bar must be left alone yet.
 *
 * Zero once the interval is out, so a caller can always schedule with this and
 * find the write allowed when its timer fires.
 *
 * @param nowMs - The current time
 * @param lastWriteMs - When this page last wrote the address bar
 * @returns Milliseconds to wait, never negative
 */
export function linkWriteDelayMs(nowMs: number, lastWriteMs: number): number {
  return Math.max(0, LINK_WRITE_INTERVAL_MS - (nowMs - lastWriteMs));
}
