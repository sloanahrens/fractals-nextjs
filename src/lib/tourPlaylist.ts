/**
 * A walk somebody shared: the stops a tour link names, in the order to show
 * them, and where the walk has got to.
 *
 * `tourLink.ts` is what a walk *is* — up to eight views in one fragment — and
 * `tour.ts` is where an unattended tour goes next. This module is the half in
 * between: playing one. The first stop of a tour link is the view the page puts
 * on screen as soon as it opens, and the rest are shown in order, one per dwell,
 * fading as the Tour's hops do; when the walk runs out the ordinary tour carries
 * on from the last stop, so a shared walk is a way in rather than a second kind
 * of tour.
 *
 * It is pure and holds no clock of its own: `nextPlaylistStop` answers with the
 * stop to show and the walk after showing it, and the page's tour clock decides
 * when that happens. The state is never changed, so a walk can be replayed, and
 * a caller asking twice gets the same stop twice.
 */

import { MAX_TOUR_STOPS, MIN_TOUR_STOPS } from "./tourLink";
import { viewLinkUpdatesFrom, type ViewLinkUpdates } from "./viewLinkState";

/**
 * The fields that say which picture a view is: everything a link carries but
 * the canvas size, which is the page's own business rather than the view's
 * (`tourLink.ts` drops it from a stop for the same reason). Two views that agree
 * in these are the same picture, however big a canvas it was drawn on.
 */
const VIEW_FIELDS = [
  "fractalType",
  "variant",
  "centerX",
  "centerY",
  "zoomLevel",
  "colorScheme",
  "reverse",
  "shift",
  "autoIterationsOn",
  "maxIterations",
] as const;

/**
 * A walk of several views, and how far through it the page is.
 *
 * The stop the page is on is not held: it is the `view` the next stop is judged
 * against, and the stops still to come are what is left. A walk that has been
 * given up has no stops left at all, which is what makes stopping final rather
 * than a pause.
 */
export interface PlaylistState {
  /** The stops still to visit, in the order the link names them. */
  readonly stops: readonly ViewLinkUpdates[];
  /** The view on screen: what a stop is compared with to see it is the one up. */
  readonly view: ViewLinkUpdates;
}

/** A stop to show, and the walk after showing it. */
export interface PlaylistStep {
  /** The view to go to. */
  readonly stop: ViewLinkUpdates;
  /** What is left of the walk once it is on screen. */
  readonly state: PlaylistState;
}

/**
 * Whether two views are the same picture.
 *
 * The canvas size is not part of it: a stop carries none (`tourLink.ts`), and a
 * view drawn on a 400 px canvas is the view drawn on an 800 px one. This is what
 * asks whether a stop of a walk is the picture already on screen.
 *
 * @param a - One view
 * @param b - The other
 */
export function sameView(a: ViewLinkUpdates, b: ViewLinkUpdates): boolean {
  return VIEW_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * The walk a tour link asks for.
 *
 * Fewer than {@link MIN_TOUR_STOPS} stops is not a walk: one view is a view, and
 * it has a link of its own. A longer list is taken as it is — the link itself
 * never carries more than {@link MAX_TOUR_STOPS} — with the view on screen as
 * what the first stop is compared against, so the stop the link already put up
 * is not shown a second time.
 *
 * @param stops - The stops, in the order the link names them
 * @param view - The view on screen, which is normally the first stop
 * @returns The walk, or null when there is nothing to walk
 */
export function createPlaylist(
  stops: readonly ViewLinkUpdates[],
  view: ViewLinkUpdates,
): PlaylistState | null {
  if (stops.length < MIN_TOUR_STOPS) return null;

  return { stops, view };
}

/**
 * The next stop of the walk, or null when there is none left.
 *
 * A stop that is the view on screen is skipped rather than stopped at: showing
 * it would draw the picture already up, so it is not a step of the walk. That
 * covers the link's own first stop, which the page put up as it opened, and any
 * place the link names twice in a row.
 *
 * Null is also the answer for a walk that has been given up
 * ({@link stopPlaylist}) and for one that has run out, and the two mean the same
 * thing to the caller: the tour carries on wandering from where it is.
 *
 * @param state - The walk and the view on screen
 * @returns The stop to show and the walk after it, or null when there is none
 */
export function nextPlaylistStop(state: PlaylistState): PlaylistStep | null {
  for (let index = 0; index < state.stops.length; index++) {
    const stop = state.stops[index];
    if (sameView(stop, state.view)) continue;

    return {
      stop,
      state: { stops: state.stops.slice(index + 1), view: stop },
    };
  }

  return null;
}

/**
 * Give the walk up.
 *
 * A tour that is taken back — a key, a touch, a click, the page being navigated
 * — does not carry on where it left off, so what is left of the walk is thrown
 * away: the result has no stop to show, however often
 * {@link nextPlaylistStop} is asked, and the next tour is the ordinary one.
 *
 * @param state - The walk to give up
 * @returns The same walk with nothing left to visit
 */
export function stopPlaylist(state: PlaylistState): PlaylistState {
  return { ...state, stops: [] };
}

/**
 * The stops a tour link would name for a journey.
 *
 * The places the visitor has been, in the order they were walked, with the view
 * on screen last — it may not have reached the journey's own record yet, and a
 * walk wants to end where the visitor is. A view visited twice is one stop, kept
 * at the later visit, because two entries of one picture are one place to
 * somebody being shown around. More than {@link MAX_TOUR_STOPS} are cut to the
 * last of them, which keeps the recent half of a long journey, and the view on
 * screen with it since it is last.
 *
 * @param fragments - The journey's entries, in order, as the address bar holds
 *   them: a view link, `""` for the entry the page opened on with none, or
 *   whatever was pasted there
 * @param current - The view on screen
 * @returns The stops, oldest first, at most {@link MAX_TOUR_STOPS} of them
 */
export function playlistStops(
  fragments: readonly string[],
  current: ViewLinkUpdates,
): ViewLinkUpdates[] {
  const kept: ViewLinkUpdates[] = [];

  for (const view of [
    ...fragments.map((text) => viewLinkUpdatesFrom(text)),
    current,
  ]) {
    const seen = kept.findIndex((other) => sameView(other, view));
    if (seen !== -1) kept.splice(seen, 1);
    kept.push(view);
  }

  return kept.slice(-MAX_TOUR_STOPS);
}
