/**
 * What a shared view link says about itself to a crawler.
 *
 * `previewFor` turns the query of a request into the link a preview is built
 * from, or null. It is the server's half of `viewQuery.ts`: the same text, read
 * by the same decoder, and it is strict in the way `/api/og` is, because a link
 * the codec cannot read is not a view and a preview of half of one is a broken
 * card. So a query previews only when `parseOgQuery` accepts it, and what
 * reaches the URL is the view *re-encoded from the decoded state*: only known
 * fields, in the codec's order, never the visitor's text. The sentence about
 * the view is built from the same state out of this build's own labels and
 * formatted numbers, so no input is echoed into the page's head. The picture is
 * a pre-built one — the nearest place of the view's fractal (`ogImage.ts`) —
 * so nothing a request asks for is drawn for it.
 *
 * A tour link (`tourLink.ts`) previews as its first stop — the card can draw one
 * picture, so it draws the one the walk begins at — and its sentence says how
 * many views the tour is. A query that carries both a tour link and a single
 * view previews as the tour: the link that names a walk is the one that was
 * sent to be watched.
 */

import { formatComplex } from "./fractalMath";
import { fractalVariants } from "./fractalTypes";
import { parseJuliaConstant } from "./julia";
import { CARD_PATH, ogImageFor } from "./ogImage";
import { parseOgQuery } from "./ogView";
import { PLACES, nearestPlace, type PlaceView } from "./places";
import { formatZoom } from "./presets";
import { CARD_ALT } from "./siteText";
import { decodeTourLink } from "./tourLink";
import { decodeView, encodeView } from "./viewLink";
import { viewLinkToUpdates, type ViewLinkUpdates } from "./viewLinkState";

/** A route's `searchParams`, as Next hands them over. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** A view worth previewing. */
export interface ViewPreview {
  /** The validated, re-encoded link, no `#` and no `?` */
  fragment: string;
  /** One short phrase for the view, such as "Julia set, Dendrite, 400x" */
  line: string;
  /**
   * The pre-built picture this view previews as, as a path on the serving
   * origin: `/og/<place-id>.jpg`, or the application's own card when the view
   * names a fractal the catalogue has no place of.
   */
  image: string;
  /** The picture's media type, which is the file's own. */
  imageType: "image/jpeg" | "image/png";
  /**
   * The alt text for it: the same line, and the place the picture is of —
   * which is what the picture is, since it is not the view's own frame.
   */
  alt: string;
}

/** The query as one string. A repeated key counts once, first value first, as `URLSearchParams.get` reads it. */
function queryOf(searchParams: SearchParams): string {
  const fields = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") fields.set(key, first);
  }

  return fields.toString();
}

/** What the fractal is called in a phrase. */
const FRACTAL_NOUNS: Record<string, string> = {
  mandelbrot: "Mandelbrot set",
  julia: "Julia set",
  "burning-ship": "Burning Ship",
  tricorn: "Tricorn",
  multibrot: "Multibrot",
  newton: "Newton fractal",
};

/**
 * "Julia set, Dendrite, 400x": the fractal, its setting when it has one, and
 * the zoom.
 *
 * @param view - The view as the page would hold it
 */
export function describeViewLine(view: ViewLinkUpdates): string {
  const parts = [FRACTAL_NOUNS[view.fractalType] ?? view.fractalType];
  const option = fractalVariants(view.fractalType)?.options.find(
    (choice) => choice.value === view.variant,
  );

  if (option) {
    parts.push(option.label);
  } else {
    const constant =
      view.fractalType === "julia" ? parseJuliaConstant(view.variant) : null;
    if (constant) {
      parts.push(`c = ${formatComplex(constant.real, constant.imaginary)}`);
    }
  }

  parts.push(`${formatZoom(view.zoomLevel)}x`);

  return parts.join(", ");
}

/**
 * "Tour of 5 views, starting at Julia set, Dendrite, 400x": a walk, described by
 * the view it begins at and how long it is.
 *
 * @param count - How many stops the tour has
 * @param first - The line of its first stop
 */
export function describeTourLine(count: number, first: string): string {
  return `Tour of ${count} ${count === 1 ? "view" : "views"}, starting at ${first}`;
}

/**
 * Where a decoded link says the view is, in the catalogue's own field names.
 *
 * `ViewLinkUpdates` is what a link decodes to and a `PlaceView` is what the
 * catalogue is searched by; this is the one place the two vocabularies meet.
 */
function placeViewOf(view: ViewLinkUpdates): PlaceView {
  return {
    fractal: view.fractalType,
    variant: view.variant,
    centerX: view.centerX,
    centerY: view.centerY,
    zoom: view.zoomLevel,
  };
}

/**
 * The rest of a preview: the picture the view is shown as, and its alt text.
 *
 * The picture is the nearest catalogue place's, pre-built (`ogImage.ts`), so
 * what a crawler fetches is a static file rather than a render. The alt names
 * that place — the picture is of the place and not of the view's own frame —
 * under the line the head itself carries, which for a tour is the tour's. A
 * view whose fractal has no place, which the catalogue's own test rules out for
 * every fractal this build knows, falls back to the application's card, whose
 * alt text is `siteText.ts`'s.
 *
 * @param view - The view the preview is of
 * @param line - The phrase this preview's title and descriptions use
 */
function imageFor(
  view: ViewLinkUpdates,
  line: string,
): Pick<ViewPreview, "image" | "imageType" | "alt"> {
  const place = nearestPlace(placeViewOf(view), PLACES);

  if (place === null) {
    return { image: CARD_PATH, imageType: "image/png", alt: CARD_ALT };
  }

  return {
    image: ogImageFor(placeViewOf(view)),
    imageType: "image/jpeg",
    alt: `${line}, a picture of ${place.name}`,
  };
}

/**
 * The preview a request's query asks for.
 *
 * @param searchParams - The route's search parameters
 * @returns The link, phrase and picture for a view the query codec can read —
 *   a tour link's being its first stop — or null for no parameters, for
 *   garbage, and for anything the codec would refuse
 */
export function previewFor(searchParams: SearchParams): ViewPreview | null {
  const query = queryOf(searchParams);
  if (query === "") return null;

  // A tour before a view, because a link that names a walk is about the walk:
  // the card is one picture, so it is the picture the walk begins at, and the
  // phrase says how many views follow. The two are read from one query without
  // either key being taken for the other's (`tourLink.ts`).
  const stops = decodeTourLink(query);
  if (stops !== null) {
    const first = stops[0];
    const line = describeTourLine(stops.length, describeViewLine(first));

    return { fragment: encodeView(first), line, ...imageFor(first, line) };
  }

  if (!parseOgQuery(query).ok) return null;

  const view = viewLinkToUpdates(decodeView(query));
  const line = describeViewLine(view);

  return { fragment: encodeView(view), line, ...imageFor(view, line) };
}
