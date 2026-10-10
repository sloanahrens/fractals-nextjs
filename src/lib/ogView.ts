/**
 * The view a `/api/og` query names, judged strictly.
 *
 * The query is exactly what the link codec writes after the `#`
 * (`v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600`),
 * and it is read with the codec's own decoder, so there is one description of
 * what a view link means. Where the page is forgiving of a link (a field it
 * cannot read keeps its default, because a page that looks a little different
 * is better than an error screen), this reader is strict: a query that names no
 * view, or whose known keys carry a value the decoder refuses, is not a view.
 * The page's own head uses the same reader (`viewPreview.ts`), so an old
 * `/api/og` URL and the page it was shared from agree about what it names.
 *
 * The route no longer draws anything (fr-5om): it answers with the pre-built
 * picture the view previews as, so all this has to decide is *whether* a query
 * is a view — the picture itself comes from `ogImage.ts`. That is why nothing
 * here resolves a kind or works out an iteration count any more; `cardBounds`
 * is the one piece of geometry that remains, because the preview generator
 * (`scripts/make-og-previews.mjs`) frames every place with it.
 */

import type { FractalBounds } from "../types/fractal";
import { BASE_HEIGHT, calculateZoomBounds } from "./mandelbrot";
import {
  MAX_FRAGMENT_LENGTH,
  VIEW_LINK_VERSION,
  decodeView,
  type ViewLinkState,
} from "./viewLink";
import { viewLinkToUpdates, type ViewLinkUpdates } from "./viewLinkState";

/** The shape every preview picture is drawn at: the Open Graph card's. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** What reading a query comes to: the view it names, or why it does not. */
export type OgParse =
  { ok: true; view: ViewLinkUpdates } | { ok: false; message: string };

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
 * Read a request's query into the view it names.
 *
 * The values are filled the way the page fills them (`viewLinkToUpdates`), so a
 * link that names a fractal and no centre means that fractal's own frame here
 * and in the browser, and the picture the route sends a crawler to is the one
 * the page's own head names for the same query.
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

  return { ok: true, view: viewLinkToUpdates(decoded) };
}

/**
 * The bounds the 1.91:1 card draws for a view: the page's 4:3 view widened to
 * the card's shape, keeping its centre and height.
 *
 * The pre-built previews are framed with this (`scripts/make-og-previews.mjs`),
 * which is the frame the on-demand card drew in, so a picture cannot drift from
 * the app's own view of the place.
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
