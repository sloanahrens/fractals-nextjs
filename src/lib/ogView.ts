/**
 * The view a `/api/og` request names, judged and turned into what the shared
 * renderer takes.
 *
 * The query is exactly what the link codec writes after the `#`
 * (`v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600`),
 * and it is read with the codec's own decoder, so there is one description of
 * what a view link means. Where the page is forgiving of a link (a field it
 * cannot read keeps its default, because a page that looks a little different
 * is better than an error screen), this route is strict, because it is an
 * unauthenticated CPU endpoint and a card that quietly shows another place than
 * the link names is worse than a 400: a query that names no view, or whose
 * known keys carry a value the decoder refuses, is rejected before any work.
 *
 * What the route draws, and how it differs from the page:
 *
 * - The picture is always 1200x630 (`OG_WIDTH` x `OG_HEIGHT`, the Open Graph
 *   card). `w` and `h` are read and checked like every key but change nothing,
 *   and they are left out of the canonical query, so two links that differ only
 *   in canvas size share one cached image.
 * - Bounds. The page draws `calculateZoomBounds(centre, zoom)` onto a canvas of
 *   the same 4:3 shape, and the Download PNG button saves that canvas, so a
 *   download shows 4/zoom by 3/zoom of the plane. The 1.91:1 card keeps that
 *   rule's height (3/zoom) and centre and widens to the card's shape, so its
 *   pixels are square and the whole 4:3 view a visitor had is inside the card,
 *   centred, with extra plane at the sides (`cardBounds`). Cropping the 4:3 view
 *   to the card's height instead would cut off the top and bottom of what the
 *   link names.
 * - Colour. The scheme and its two settings travel together: `r` and `o`
 *   (`viewLink.ts`) are read like every other key, kept in the canonical query
 *   and handed to the renderer, so a shared reversed or shifted scheme previews
 *   in the colours the link names. A key that is present and refused — `o=2`,
 *   `r=2` — is a 400 like any other.
 * - Iterations. The page's rule, then a cap: Auto picks `autoIterations(zoom)`
 *   (a multiple of 10 from 50 to 1000), a count the link names is taken as it is,
 *   and either is held to `OG_MAX_ITERATIONS` (400) so one render has a bounded
 *   cost. Colour is the count over the cap, so a deep view's colours differ a
 *   little from the page's at the same view; that is the price of the limit.
 */

import type {
  ColorOptions,
  ColorScheme,
  FractalBounds,
  FractalKind,
} from "../types/fractal";
import { resolveFractalKind } from "./fractalTypes";
import { BASE_HEIGHT, autoIterations, calculateZoomBounds } from "./mandelbrot";
import {
  MAX_FRAGMENT_LENGTH,
  VIEW_LINK_VERSION,
  decodeView,
  encodeView,
  type ViewLinkState,
} from "./viewLink";
import { viewLinkToUpdates } from "./viewLinkState";

/** The card's size in pixels: the Open Graph image shape. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** The most iterations one render may run. */
export const OG_MAX_ITERATIONS = 400;

/** A view ready to draw. */
export interface OgView {
  /**
   * The canonical query for the view: the link codec's own encoding of the
   * resolved view, with Auto replaced by the count it picks and the canvas size
   * left out. Two requests that draw the same picture have the same key, and
   * the picture is drawn from this text, so the key names the image exactly.
   */
  key: string;
  /** The formula to iterate. */
  kind: FractalKind;
  /** The region of the plane the card covers. */
  bounds: FractalBounds;
  /** Iteration cap, 400 at most. */
  maxIterations: number;
  /** Colour scheme to draw in. */
  colorScheme: ColorScheme;
  /**
   * Reverse and shift of that scheme, exactly as the link carried them, so the
   * card is the shared picture and not the same view in the default palette.
   */
  colorOptions: ColorOptions;
}

/** What reading a query comes to: a view, or one sentence on why not. */
export type OgParse =
  { ok: true; view: OgView } | { ok: false; message: string };

/**
 * The bounds the 1.91:1 card draws for a view: the page's 4:3 view widened to
 * the card's shape, keeping its centre and height (see the module note).
 *
 * @param centerX - Real part of the centre
 * @param centerY - Imaginary part of the centre
 * @param zoom - Magnification, 1 being the whole base view
 * @param width - Picture width in pixels
 * @param height - Picture height in pixels
 */
export function cardBounds(
  centerX: number,
  centerY: number,
  zoom: number,
  width: number = OG_WIDTH,
  height: number = OG_HEIGHT,
): FractalBounds {
  const view = calculateZoomBounds(centerX, centerY, zoom);
  const halfWidth = ((BASE_HEIGHT / zoom) * (width / height)) / 2;

  return {
    minReal: centerX - halfWidth,
    maxReal: centerX + halfWidth,
    minImaginary: view.minImaginary,
    maxImaginary: view.maxImaginary,
  };
}

/**
 * Whether every key the query carries was read.
 *
 * `decodeView` leaves out what it cannot read, which is the right thing for a
 * page and hides a typo here. This asks, key by key, whether a key that is
 * present produced its field.
 *
 * @returns The first key that was present and refused, or null
 */
function unreadableKey(
  fields: URLSearchParams,
  decoded: Partial<ViewLinkState>,
): string | null {
  const read: [string, boolean][] = [
    ["f", decoded.fractalType !== undefined],
    ["k", decoded.variant !== undefined],
    ["x", decoded.centerX !== undefined],
    ["y", decoded.centerY !== undefined],
    ["z", decoded.zoomLevel !== undefined],
    ["s", decoded.colorScheme !== undefined],
    ["r", decoded.reverse !== undefined],
    ["o", decoded.shift !== undefined],
    ["i", decoded.autoIterationsOn !== undefined],
    // The size is one value: either key present needs the pair to be read.
    ["w", decoded.canvasWidth !== undefined],
    ["h", decoded.canvasWidth !== undefined],
  ];

  for (const [key, wasRead] of read) {
    if (fields.has(key) && !wasRead) return key;
  }

  return null;
}

/**
 * Read a request's query into a view to draw.
 *
 * @param search - The URL's query string, with or without its `?`
 * @returns The view, or a short sentence on why the query is not one. The
 *   sentence names a key and never echoes a value.
 */
export function parseOgQuery(search: string): OgParse {
  const text = search.startsWith("?") ? search.slice(1) : search;
  const fields = new URLSearchParams(text);
  const decoded = decodeView(text);
  const notAView: OgParse = {
    ok: false,
    message:
      "Not a view: send a link of version 1, such as v=1&f=mandelbrot&x=-0.75&y=0&z=1.",
  };

  // Not a link of this version (or too long to be one): the decoder reads
  // nothing from it, so "which key was refused" would be every key.
  if (
    text.length > MAX_FRAGMENT_LENGTH ||
    fields.get("v") !== String(VIEW_LINK_VERSION)
  ) {
    return notAView;
  }

  const bad = unreadableKey(fields, decoded);
  if (bad !== null) {
    return { ok: false, message: `Cannot read the value of "${bad}".` };
  }

  // `v=1` and nothing else: a version and no view.
  if (Object.keys(decoded).length === 0) return notAView;

  const updates = viewLinkToUpdates(decoded);
  const maxIterations = Math.min(
    OG_MAX_ITERATIONS,
    updates.autoIterationsOn
      ? autoIterations(updates.zoomLevel)
      : updates.maxIterations,
  );

  // Round-trip through the codec once so the key names the image: the codec
  // writes ten significant digits, and the render uses what it wrote.
  const key = encodeView({
    fractalType: updates.fractalType,
    variant: updates.variant,
    centerX: updates.centerX,
    centerY: updates.centerY,
    zoomLevel: updates.zoomLevel,
    colorScheme: updates.colorScheme,
    reverse: updates.reverse,
    shift: updates.shift,
    autoIterationsOn: false,
    maxIterations,
    canvasWidth: OG_WIDTH,
    canvasHeight: OG_HEIGHT,
  });
  const canonical = viewLinkToUpdates(decodeView(key));

  return {
    ok: true,
    view: {
      key,
      kind: resolveFractalKind(canonical.fractalType, canonical.variant),
      bounds: cardBounds(
        canonical.centerX,
        canonical.centerY,
        canonical.zoomLevel,
      ),
      maxIterations,
      colorScheme: canonical.colorScheme,
      colorOptions: { reverse: canonical.reverse, shift: canonical.shift },
    },
  };
}
