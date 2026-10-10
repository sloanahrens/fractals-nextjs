import { suggest, type Place, type PlaceView } from "./places";

/** How long a tour lingers on one place, in milliseconds. */
export const TOUR_DWELL_MS = 8000;

/** How long the crossfade from one place to the next takes, in milliseconds. */
export const TOUR_CROSSFADE_MS = 1500;

/**
 * The share of hops that change fractal, over a whole tour: one in six.
 *
 * It is the long-run rate, not the chance on each roll. A hop right after a
 * switch may not switch again ({@link TOUR_SWITCH_LOCKOUT_HOPS}), so the hops
 * that do roll roll for a little more than this; see {@link switchChance}.
 */
export const TOUR_FRACTAL_SWITCH_ODDS = 1 / 6;

/** How many of the places last visited a tour tries not to visit again. */
export const TOUR_RECENT_LIMIT = 12;

/** The hops right after a switch that stay on the new fractal. */
export const TOUR_SWITCH_LOCKOUT_HOPS = 2;

/** How many of the nearest places a hop within a fractal chooses among. */
export const TOUR_NEAR_CANDIDATES = 8;

/** What the tour remembers between hops. */
export interface TourState {
  /** Where the tour is, as {@link suggest} takes a view. */
  view: PlaceView;
  /**
   * The ids of the places last visited, oldest first. Holds each id once and
   * at most {@link TOUR_RECENT_LIMIT} of them.
   */
  recent: readonly string[];
  /** Hops made since the last fractal switch. */
  hopsSinceSwitch: number;
}

/**
 * The state of a tour that has not hopped yet.
 *
 * The count starts at the lockout, so the first hop may switch fractal: the
 * lockout is about the hops after a switch, and there has been none.
 *
 * @param view - Where the tour starts, normally the page's view
 * @returns A state with nothing visited
 */
export function initialTourState(view: PlaceView): TourState {
  return {
    view,
    recent: [],
    hopsSinceSwitch: TOUR_SWITCH_LOCKOUT_HOPS,
  };
}

/**
 * The chance a hop that is allowed to switch does switch.
 *
 * Each switch is followed by {@link TOUR_SWITCH_LOCKOUT_HOPS} hops that cannot
 * switch, so rolling the plain odds on the rest would give
 * `odds / (1 + lockout * odds)` over the tour (one in eight, not one in six).
 * Solving for the rate the odds name gives `odds / (1 - lockout * odds)`.
 */
function switchChance(): number {
  const chance =
    TOUR_FRACTAL_SWITCH_ODDS /
    (1 - TOUR_SWITCH_LOCKOUT_HOPS * TOUR_FRACTAL_SWITCH_ODDS);

  return Number.isFinite(chance) && chance > 0 ? Math.min(chance, 1) : 1;
}

/** A random number held to [0, 1), whatever `rng` answered. */
function draw(rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0;

  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
}

/** One of `items`, chosen by `rng`; `items` must not be empty. */
function pickOne<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(draw(rng) * items.length)];
}

/** The part of a place that locates a view. */
function viewOf(place: Place): PlaceView {
  return {
    fractal: place.fractal,
    variant: place.variant,
    centerX: place.centerX,
    centerY: place.centerY,
    zoom: place.zoom,
  };
}

/**
 * The place a view is on, if the catalogue has it.
 *
 * Asks {@link suggest} rather than comparing numbers, so "is the view" means
 * what it means to the Nearby strip: a place of the view's fractal that
 * `suggest` leaves out of its own answer.
 */
function currentPlace(
  view: PlaceView,
  places: readonly Place[],
): Place | undefined {
  return places.find(
    (place) =>
      place.fractal === view.fractal && suggest(view, [place], 1).length === 0,
  );
}

/** The state after hopping to `place`. */
function arrive(state: TourState, place: Place, switched: boolean): TourState {
  const recent = [...state.recent.filter((id) => id !== place.id), place.id];

  return {
    view: viewOf(place),
    recent: recent.slice(-TOUR_RECENT_LIMIT),
    hopsSinceSwitch: switched ? 0 : state.hopsSinceSwitch + 1,
  };
}

/**
 * Where an unattended tour goes next.
 *
 * Pure and deterministic: the same state, catalogue and `rng` sequence give the
 * same place, and `state` is not changed. `rng` is drawn twice per hop, first
 * for the switch roll and then for the pick, so a replayed tour is replayed.
 *
 * Most hops stay on the view's fractal. A hop that is allowed to switch (not
 * within {@link TOUR_SWITCH_LOCKOUT_HOPS} hops of the last switch) switches
 * with a chance that makes one hop in six a switch over a long tour, to a
 * place of another fractal, preferring one not visited lately. Any other hop
 * takes the nearest places {@link suggest} offers and chooses among those not
 * visited lately. When that leaves nothing it widens in steps: the unvisited
 * places of the fractal beyond the nearest, then the nearest again, then any
 * other place of the fractal. The place the view is on is never chosen.
 *
 * The place is returned as the catalogue has it. Its colours are
 * `placeColorScheme(place, current)` — the place's own scheme, else the one the
 * page is in — which is the caller's to apply, so the scheme changes as places
 * do and this module invents none.
 *
 * A catalogue with no other place to go to cannot move the tour: the place the
 * view is on comes back unchanged, and when the view is on no catalogue place
 * (an empty catalogue) a place made from the view itself does, so the caller
 * can always apply the result.
 *
 * @param state - Where the tour is and what it has visited
 * @param places - The catalogue to choose from
 * @param rng - A random number in [0, 1), like `Math.random`
 * @returns The place to go to and the state once there
 */
export function nextTourStop(
  state: TourState,
  places: readonly Place[],
  rng: () => number,
): { place: Place; state: TourState } {
  const recent = new Set(state.recent);
  const unvisited = (candidates: readonly Place[]) =>
    candidates.filter((place) => !recent.has(place.id));

  const switchRoll = draw(rng);
  const mayRoll = state.hopsSinceSwitch >= TOUR_SWITCH_LOCKOUT_HOPS;

  const others = places.filter((place) => place.fractal !== state.view.fractal);
  if (mayRoll && others.length > 0 && switchRoll < switchChance()) {
    const fresh = unvisited(others);
    const place = pickOne(fresh.length > 0 ? fresh : others, rng);

    return { place, state: arrive(state, place, true) };
  }

  // Every place of this fractal but the one the view is on, nearest first.
  const ranked = suggest(state.view, places, places.length);
  const nearest = ranked.slice(0, TOUR_NEAR_CANDIDATES);
  const pool = [unvisited(nearest), unvisited(ranked), nearest, ranked].find(
    (candidates) => candidates.length > 0,
  );

  if (pool !== undefined) {
    const place = pickOne(pool, rng);

    return { place, state: arrive(state, place, false) };
  }

  // The fractal has no other place. Leaving it is the only move, and the
  // lockout and the roll are about choosing to, so this is neither.
  if (others.length > 0) {
    const fresh = unvisited(others);
    const place = pickOne(fresh.length > 0 ? fresh : others, rng);

    return { place, state: arrive(state, place, true) };
  }

  const here: Place = currentPlace(state.view, places) ?? {
    id: "tour-here",
    name: "Here",
    ...state.view,
  };

  return {
    place: here,
    state: { ...state, hopsSinceSwitch: state.hopsSinceSwitch + 1 },
  };
}
