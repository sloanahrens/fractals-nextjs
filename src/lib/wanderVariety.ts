import type { TrapShape } from "../types/fractal";
import { TRAP_SHAPES } from "./orbitTrap";
import type { Place, PlaceView } from "./places";
import { initialTourState, nextStopOnFractal, type TourState } from "./tour";
import type { Rng } from "./wander";

/**
 * A Look: how the picture is coloured. Normal is the iteration count (no trap);
 * the others are the three orbit traps, which the page calls Glass.
 */
export type Look = TrapShape | null;

/** Every Look Auto-wander cycles through: Normal first, then the three traps. */
export const WANDER_LOOKS: readonly Look[] = [null, ...TRAP_SHAPES];

/** One stop of the variety walk: a fractal shown in a Look. */
export interface WanderPair {
  fractal: string;
  look: Look;
}

/** What the variety walk remembers between hops. */
export interface WanderVarietyState {
  /** The pairs not yet taken from the current bag, next first. */
  bag: readonly WanderPair[];
  /** The tour engine's memory of places visited, which the walk shares. */
  tour: TourState | null;
}

/** The state of a walk that has not hopped yet. */
export const INITIAL_WANDER_VARIETY: WanderVarietyState = {
  bag: [],
  tour: null,
};

/** Where a hop goes. */
export interface WanderHop {
  /**
   * The place to go to, or null when the fractal has no place but the one the
   * view is on and the hop only changes the Look on the current view.
   */
  place: Place | null;
  /** The Look the hop lands in. */
  look: Look;
  /** The state once there. */
  state: WanderVarietyState;
}

/** Whether two pairs name the same fractal in the same Look. */
function samePair(a: WanderPair, b: WanderPair): boolean {
  return a.fractal === b.fractal && a.look === b.look;
}

/** A random number held to [0, 1), whatever `rng` answered. */
function draw(rng: Rng): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0;

  return Math.min(Math.max(value, 0), 1 - Number.EPSILON);
}

/**
 * A fresh bag: every fractal in every Look once, shuffled (Fisher-Yates, one
 * `rng` draw per swap), and never opening with `current`. A bag that opened
 * with the pair already on screen would make its first hop a hop to where the
 * walk is; that pair is moved to the end instead, so it is still taken once.
 */
function freshBag(
  fractals: readonly string[],
  current: WanderPair,
  rng: Rng,
): WanderPair[] {
  const bag: WanderPair[] = fractals.flatMap((fractal) =>
    WANDER_LOOKS.map((look) => ({ fractal, look })),
  );

  for (let at = bag.length - 1; at > 0; at -= 1) {
    const other = Math.floor(draw(rng) * (at + 1));
    [bag[at], bag[other]] = [bag[other], bag[at]];
  }

  if (bag.length > 1 && samePair(bag[0], current)) bag.push(bag.shift()!);

  return bag;
}

/**
 * Where an Auto-wander hop goes next: the next fractal-and-Look pair from a
 * shuffled bag of all of them, and a place of that fractal.
 *
 * Each bag holds every (fractal, Look) pair once, so over `fractals.length * 4`
 * consecutive hops from a new walk each pair is visited exactly once. The bag is
 * reshuffled when it runs out, and the new one never opens with the pair the
 * walk is on. The pair a hop takes can still equal the one on screen if the
 * visitor changed the Look by hand in between; that hop then moves within the
 * fractal and keeps the Look.
 *
 * The place comes from the tour engine's own rules (`nextStopOnFractal`): on the
 * same fractal the nearest places first and never the one the view is on, on
 * another fractal a place not visited lately. A fractal with no other place
 * answers a null place, and the caller changes the Look and nothing else. A
 * fractal with a variant takes the chosen place's, as any place does.
 *
 * Pure: `state` is not changed and the same arguments and `rng` sequence give
 * the same hop. A shuffle draws `rng` once per swap and the place once.
 *
 * @param state - What the walk remembers
 * @param view - Where the walk is now
 * @param look - The Look it is in now
 * @param places - The catalogue to choose from
 * @param fractals - Every fractal the walk visits, normally the picker's ids
 * @param rng - A random number in [0, 1), like `Math.random`
 * @returns The hop and the state after it
 */
export function nextWanderHop(
  state: WanderVarietyState,
  view: PlaceView,
  look: Look,
  places: readonly Place[],
  fractals: readonly string[],
  rng: Rng,
): WanderHop {
  const current: WanderPair = { fractal: view.fractal, look };
  const bag =
    state.bag.length > 0 ? [...state.bag] : freshBag(fractals, current, rng);
  const target = bag.shift() ?? current;

  const tour = { ...(state.tour ?? initialTourState(view)), view };
  const stop = nextStopOnFractal(tour, places, target.fractal, rng);

  return {
    place: stop?.place ?? null,
    look: target.look,
    state: { bag, tour: stop?.state ?? tour },
  };
}
