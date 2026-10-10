/**
 * What a shared view link says about itself to a crawler.
 *
 * `previewFor` turns the query of a request into the link a preview is built
 * from, or null. It is the server's half of `viewQuery.ts`: the same text, read
 * by the same decoder, and it is strict in the way `/api/og` is, because the
 * image it points at is drawn by that route and a preview that names a view the
 * route would refuse is a broken card. So a query previews only when
 * `parseOgQuery` accepts it, and what reaches the URL is the view *re-encoded
 * from the decoded state*: only known fields, in the codec's order, never the
 * visitor's text. The sentence about the view is built from the same state out
 * of this build's own labels and formatted numbers, so no input is echoed into
 * the page's head.
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
import { parseOgQuery } from "./ogView";
import { formatZoom } from "./presets";
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
 * The preview a request's query asks for.
 *
 * @param searchParams - The route's search parameters
 * @returns The link and phrase for a view `/api/og` can draw — a tour link's
 *   being its first stop — or null for no parameters, for garbage, and for
 *   anything the route would refuse
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

    return {
      fragment: encodeView(first),
      line: describeTourLine(stops.length, describeViewLine(first)),
    };
  }

  if (!parseOgQuery(query).ok) return null;

  const view = viewLinkToUpdates(decodeView(query));

  return { fragment: encodeView(view), line: describeViewLine(view) };
}
