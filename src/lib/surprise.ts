import { suggest, type Place, type PlaceView } from "./places";

/** How many of the nearest places a Surprise me press chooses among. */
export const SURPRISE_CANDIDATES = 6;

/**
 * Where "Surprise me" goes: one of the places `suggest` offers near the view,
 * chosen at random.
 *
 * The candidates are the same six the Nearby strip leads with, so a surprise is
 * never somewhere the strip would not have offered, and never the place the
 * view already is (`suggest` leaves that one out). The choice is made by
 * `pick`, which stands in for `Math.random` — a number from 0 up to but not
 * including 1 — so a test can name the place it expects. A `pick` that answers
 * outside that range, or not a number, is held to the nearest end rather than
 * indexing past the list.
 *
 * @param view - Where the explorer is
 * @param places - The catalogue to choose from
 * @param pick - A random number in [0, 1); defaults to `Math.random`
 * @returns The place to go to, or `null` when nothing is near enough to offer
 */
export function surpriseTarget(
  view: PlaceView,
  places: readonly Place[],
  pick: () => number = Math.random,
): Place | null {
  const candidates = suggest(view, places, SURPRISE_CANDIDATES);
  if (candidates.length === 0) return null;

  const drawn = pick();
  const fraction = Number.isFinite(drawn) ? Math.min(Math.max(drawn, 0), 1) : 0;
  const index = Math.min(
    Math.floor(fraction * candidates.length),
    candidates.length - 1,
  );

  return candidates[index];
}
