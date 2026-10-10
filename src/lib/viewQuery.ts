/**
 * A link in the query string: the form that can be previewed.
 *
 * A crawler never sees the part of an address after `#`, so a shared link whose
 * view lives in the fragment previews as the generic card. The same text in the
 * query (`/?v=1&f=julia&k=Dendrite&x=...`) reaches the server, which can point
 * og:image at that view (`viewPreview.ts`). The address bar keeps showing the
 * hash form; only the copy buttons write the query form, and a page opened with
 * one reads it once and settles into the hash form.
 *
 * Both forms carry the codec's own text, so there is one description of what a
 * view is and one reader of it — and a tour link (`tourLink.ts`) is the same
 * story for a walk: `copyTourUrl` is the query form Copy tour link writes, and
 * a page load reads one as readily as the other.
 */

import { decodeTourLink, encodeTourLink } from "./tourLink";
import { decodeTour, decodeView } from "./viewLink";
import type { ViewLinkUpdates } from "./viewLinkState";

/** What a page load makes of the address it was opened with. */
export interface LocationLink {
  /**
   * The link to put into effect, with its leading `#` the way
   * `window.location.hash` gives one; `""` when the address names no view.
   */
  fragment: string;
  /**
   * Whether the query held a view link and so has to leave the address bar.
   * True when the query was read, and also when a hash beat it: a bar that
   * names one view in its query and another in its hash would preview as the
   * first and open as the second.
   */
  dropQuery: boolean;
}

/** The query without its `?`. */
function queryText(search: string): string {
  return search.startsWith("?") ? search.slice(1) : search;
}

/**
 * Whether a query is a link: of this version, with at least one field the codec
 * can read, asking for a tour, or naming a walk of several views. `?v=1` alone,
 * a query of another version and the usual tracking parameters are not, and are
 * left in the address bar untouched.
 */
function isViewQuery(query: string): boolean {
  return (
    Object.keys(decodeView(query)).length > 0 ||
    decodeTour(query) ||
    decodeTourLink(query) !== null
  );
}

/**
 * The link an address names. A hash wins when it holds anything (the form the
 * address bar has always shown); otherwise a query that is a view link is read
 * as the same text. Reading goes through `decodeView` afterwards, so a query
 * gets the validation a hash does, field by field.
 *
 * @param search - `window.location.search`
 * @param hash - `window.location.hash`
 * @returns The fragment to apply and whether the query has to go
 */
export function readLocationLink(search: string, hash: string): LocationLink {
  const query = queryText(search);
  const viewQuery = isViewQuery(query);

  if (hash.length > 1) return { fragment: hash, dropQuery: viewQuery };
  if (viewQuery) return { fragment: `#${query}`, dropQuery: true };

  return { fragment: hash, dropQuery: false };
}

/**
 * The address Copy link puts on the clipboard: the view as a query on the
 * current origin and path.
 *
 * @param origin - `window.location.origin`
 * @param pathname - `window.location.pathname`
 * @param link - The view as `encodeView` writes it, no leading `#`
 */
export function copyLinkUrl(
  origin: string,
  pathname: string,
  link: string,
): string {
  return `${origin}${pathname}?${link}`;
}

/**
 * The address Copy tour link puts on the clipboard: a walk as a query on the
 * current origin and path.
 *
 * The same form as {@link copyLinkUrl}, and for the same reason: a crawler sees
 * a query and never a fragment, so only this form previews — as the walk's first
 * stop, which is what a card can draw (`viewPreview.ts`).
 *
 * @param origin - `window.location.origin`
 * @param pathname - `window.location.pathname`
 * @param stops - The views to walk, in order
 * @returns The URL, or null when those stops are not a walk (fewer than two of
 *   them, which is a view and has a link of its own)
 */
export function copyTourUrl(
  origin: string,
  pathname: string,
  stops: readonly ViewLinkUpdates[],
): string | null {
  const link = encodeTourLink([...stops]);

  return link === null ? null : copyLinkUrl(origin, pathname, link);
}
