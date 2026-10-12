/**
 * A tour as a link: a short walk of several views, in order, in one fragment.
 *
 * `viewLink.ts` is the one description of what a single view is; this module is
 * what a *sequence* of them is. A tour link is what a visitor would send
 * somebody to say "look at these five places" — up to {@link MAX_TOUR_STOPS}
 * views, in the order they were seen — and it is built out of the view codec
 * rather than beside it: every stop is encoded by `encodeView` and read back by
 * `decodeView`, under the codec's own keys, so a stop is judged exactly as a
 * single view is and there is no second set of rules to keep in step.
 *
 * The form is the view link's own query string with the stops laid side by side
 * instead of one after another: one column per field, each column the value that
 * field has in every stop, separated by `~`:
 *
 *   v=1&t.f=mandelbrot~julia&t.k=~Dendrite&t.x=-0.75~-0.5&t.y=0~0.25&t.z=1~400
 *
 * `v` is the version, the codec's own: a stop is a version-1 view, and the
 * fields of a column are the fields of that view. `t.f` is the fractal of stop
 * 0, then stop 1, and so on; an empty entry is a field that stop does not carry,
 * which is read as the page's default for it exactly as a missing key is. The
 * `t.` prefix is what keeps the two readers apart: a tour's columns are not a
 * view's fields, so a query or a hash that carries both a view and a tour link
 * is read as both, with no key of one mistaken for a key of the other.
 *
 * A stop carries what a view carries except the canvas size, which is the page's
 * own and not the view's, and the iteration setting when the zoom picks it — a
 * stop with no count is drawn at the count its zoom asks for, so writing `auto`
 * would be writing the default. Everything else travels: the fractal and its
 * variant, the centre, the zoom, the colour scheme and the scheme's two own
 * settings.
 *
 * A column is written whichever way is shortest, and every value in it is
 * percent-encoded on its own with `encodeURIComponent` rather than by the
 * serializer, because the serializer would escape the `~` that holds the column
 * together and there would be nothing left to split on. The codec's own writer
 * escapes `~` too, so a value the codec produced can never contain one. The
 * eight longest stops this build can name — every field present, the longest
 * custom Julia constant in each, ten-significant-digit negative centres, the
 * deepest zoom, the largest count — come to 397 characters, so a tour link is
 * well under a single view's 500 most of the time and
 * {@link MAX_TOUR_LINK_LENGTH} (900) is where reading stops: above the busiest
 * tour and clear of a single view's limit, so the two readers cannot be confused
 * about which half of a paste they are holding.
 */

import { VIEW_LINK_VERSION, decodeView, encodeView } from "./viewLink";
import {
  DEFAULT_VIEW_LINK_UPDATES,
  viewLinkToUpdates,
  type ViewLinkUpdates,
} from "./viewLinkState";

/** The most stops a tour link carries. */
export const MAX_TOUR_STOPS = 8;

/** The fewest: a tour of one view is a view, and it has a link of its own. */
export const MIN_TOUR_STOPS = 2;

/**
 * The longest tour link worth reading, in characters.
 *
 * A tour owns its own limit rather than borrowing the view codec's, so the two
 * readers cannot be confused about a paste: a single view is read up to
 * `MAX_FRAGMENT_LENGTH` (500) and nothing longer, and a tour up to this. The
 * eight longest stops this build can name come to 397 characters, so the ceiling
 * is where reading stops rather than where a tour stops fitting.
 */
export const MAX_TOUR_LINK_LENGTH = 900;

/**
 * The fields a stop carries, in the codec's own order.
 *
 * The codec's keys less `v`, which is the link's once instead of every stop's,
 * and less `w` and `h`: a stop is a view of the plane, and how big the canvas is
 * is the page's business rather than the tour's.
 */
const STOP_KEYS = [
  "f",
  "k",
  "x",
  "y",
  "z",
  "s",
  "r",
  "o",
  "m",
  "i",
] as const;

/** What makes a column a tour's own field rather than a view's. */
const COLUMN_PREFIX = "t.";

/** Between one stop's value and the next, inside a column. */
const STOP_SEPARATOR = "~";

/**
 * One stop as the codec's own fields, under the codec's own keys.
 *
 * The encoding goes through `encodeView` and is then taken apart again, so a
 * stop is written by exactly the rules a single view is — the same number
 * writer, the same validation, the same fields left out when they cannot be
 * carried. What is dropped afterwards is what a stop does not carry.
 *
 * @param stop - The view this stop is
 * @returns Its fields by key, `""` for a field the codec did not write
 */
function stopFields(stop: ViewLinkUpdates): Map<string, string> {
  const text = encodeView({
    fractalType: stop.fractalType,
    variant: stop.variant,
    centerX: stop.centerX,
    centerY: stop.centerY,
    zoomLevel: stop.zoomLevel,
    colorScheme: stop.colorScheme,
    reverse: stop.reverse,
    shift: stop.shift,
    trap: stop.trap,
    autoIterationsOn: stop.autoIterationsOn,
    maxIterations: stop.maxIterations,
    // Any size the codec reads will do, since the columns are not written; the
    // page's own keeps the state this is handed one a link carries.
    canvasWidth: DEFAULT_VIEW_LINK_UPDATES.canvasWidth,
    canvasHeight: DEFAULT_VIEW_LINK_UPDATES.canvasHeight,
  });
  const fields = new URLSearchParams(text);
  const values = new Map<string, string>();

  for (const key of STOP_KEYS) values.set(key, fields.get(key) ?? "");

  // The codec writes `i=auto` whenever the zoom picks the count; a stop without
  // a count is drawn at that count, so the column carries the counts alone.
  if (stop.autoIterationsOn) values.set("i", "");

  return values;
}

/**
 * The last {@link MAX_TOUR_STOPS} stops that are not the same view as one
 * already kept, in the order they were given.
 *
 * Only for a tour longer than a link can hold: what is dropped is the earliest
 * stops, and one that is the same view as one kept later is dropped with them,
 * so a link that names eight places is a link about eight places. The stops
 * compared are the fields the codec wrote, which is what "the same view" means
 * to a link.
 *
 * @param rows - Every stop's fields, in order
 * @returns The last distinct eight, in order; fewer when fewer are distinct
 */
function lastDistinctStops(rows: Map<string, string>[]): Map<string, string>[] {
  const kept: Map<string, string>[] = [];
  const seen = new Set<string>();

  for (let i = rows.length - 1; i >= 0 && kept.length < MAX_TOUR_STOPS; i--) {
    const key = STOP_KEYS.map((field) => rows[i].get(field) ?? "").join(
      "\u0000",
    );
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(rows[i]);
  }

  return kept.reverse();
}

/**
 * The link for a tour.
 *
 * A tour of fewer than {@link MIN_TOUR_STOPS} stops has no link: there is
 * nothing to walk. A longer one is cut to its last {@link MAX_TOUR_STOPS}
 * distinct stops. The link is written in the codec's key order, one column per
 * field, so one tour is always one string.
 *
 * @param stops - The views to walk, in order
 * @returns The fragment's text, beginning `v=1&` and with no leading `#`; null
 *   when there are too few stops to be a tour, or when the link those stops
 *   make is longer than {@link MAX_TOUR_LINK_LENGTH} can be read back at
 */
export function encodeTourLink(stops: ViewLinkUpdates[]): string | null {
  if (!Array.isArray(stops) || stops.length < MIN_TOUR_STOPS) return null;

  const rows =
    stops.length > MAX_TOUR_STOPS
      ? lastDistinctStops(stops.map(stopFields))
      : stops.map(stopFields);
  if (rows.length < MIN_TOUR_STOPS) return null;

  const parts = [`v=${VIEW_LINK_VERSION}`];

  for (const key of STOP_KEYS) {
    const column = rows.map((row) => row.get(key) ?? "");
    if (column.every((value) => value === "")) continue;

    parts.push(
      `${COLUMN_PREFIX}${key}=${column.map(encodeURIComponent).join(STOP_SEPARATOR)}`,
    );
  }

  const text = parts.join("&");

  return text.length > MAX_TOUR_LINK_LENGTH ? null : text;
}

/**
 * The stop at one place in the columns, or null when it carries nothing this
 * build can read.
 *
 * The column values are put back under their own keys and handed to the codec's
 * decoder, so what makes a stop readable is exactly what makes a view readable.
 * The `v` the codec insists on is this link's own version, which is how a stop
 * is judged as a view of it.
 *
 * @param columns - The values of each field, one per stop
 * @param index - Which stop to read
 * @returns The stop, filled in with the page's defaults for what it does not
 *   carry; null when no field of it was readable
 */
function stopAt(
  columns: Map<string, string[]>,
  index: number,
): ViewLinkUpdates | null {
  const pairs: [string, string][] = [["v", String(VIEW_LINK_VERSION)]];

  for (const key of STOP_KEYS) {
    const value = columns.get(key)?.[index];
    if (value) pairs.push([key, value]);
  }
  if (pairs.length === 1) return null;

  const decoded = decodeView(new URLSearchParams(pairs).toString());

  return Object.keys(decoded).length === 0 ? null : viewLinkToUpdates(decoded);
}

/**
 * The tour a link describes.
 *
 * Reading is the suspicious half, as it is for a single view and for the same
 * reason: the text arrives from anywhere. Nothing here throws — not for a
 * truncated paste, not for a percent sign at the end, not for a query of five
 * thousand characters — and nothing is taken on trust: the version has to be
 * this build's, the length has to be one a tour can be, and every field is
 * judged by the codec, which leaves out what it cannot read. A stop with no
 * readable field at all is dropped and the rest of the walk is kept, because a
 * tour is a list of views and one bad name in it is not the end of the list.
 *
 * @param text - The link, with or without its leading `#`
 * @returns The stops, each filled in with the page's defaults, up to
 *   {@link MAX_TOUR_STOPS} of them; null for a link of another version, for one
 *   past {@link MAX_TOUR_LINK_LENGTH}, and for fewer than
 *   {@link MIN_TOUR_STOPS} readable stops
 */
export function decodeTourLink(text: string): ViewLinkUpdates[] | null {
  if (typeof text !== "string") return null;
  if (text.length > MAX_TOUR_LINK_LENGTH) return null;

  const body = text.startsWith("#") ? text.slice(1) : text;
  const fields = new URLSearchParams(body);

  if (fields.get("v") !== String(VIEW_LINK_VERSION)) return null;

  const columns = new Map<string, string[]>();
  let longest = 0;

  for (const key of STOP_KEYS) {
    const column = fields.get(`${COLUMN_PREFIX}${key}`);
    if (column === null) continue;

    const values = column.split(STOP_SEPARATOR);
    columns.set(key, values);
    longest = Math.max(longest, values.length);
  }

  const count = Math.min(longest, MAX_TOUR_STOPS);
  if (count < MIN_TOUR_STOPS) return null;

  const stops: ViewLinkUpdates[] = [];
  for (let index = 0; index < count; index++) {
    const stop = stopAt(columns, index);
    if (stop !== null) stops.push(stop);
  }

  return stops.length >= MIN_TOUR_STOPS ? stops : null;
}
