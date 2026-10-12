import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLACES, type Place } from "../places";
import {
  TOUR_RECENT_LIMIT,
  initialTourState,
  nextTourStop,
  type TourState,
} from "../tour";
import { createRng } from "../wander";
import {
  DEFAULT_WANDER_INTERVAL_SECONDS,
  WANDER_HOP_EVERY,
  WanderController,
} from "../wanderController";

const DEFAULT_MS = DEFAULT_WANDER_INTERVAL_SECONDS * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** One scheduled step: the interval passes, then the step's own render. */
function stepOnce(wander: WanderController) {
  vi.advanceTimersByTime(DEFAULT_MS);
  wander.notifyRenderStart();
  wander.notifyRenderDone();
}

/**
 * The controller wired straight to the tour engine's own hop: a hop asks it,
 * from a state of its own, with the walk's generator; a drift leaves the place
 * alone. The page's hops now go through the variety walk
 * (`wanderVarietyHops.test.ts`); this holds the engine's rules under the
 * controller's cadence.
 */
function wiredWalk(seed: number, isBlank: () => boolean = () => false) {
  const rng = createRng(seed);
  const wander = new WanderController();
  wander.setBlankDetector(isBlank);
  const steps: ("drift" | Place)[] = [];
  let state: TourState | null = null;
  let current: Place | null = null;

  wander.setStepHandler(({ hop }) => {
    if (!hop) {
      steps.push("drift");
      return;
    }

    const view = current ?? PLACES[0];
    const next = nextTourStop(
      { ...(state ?? initialTourState(view)), view },
      PLACES,
      rng,
    );
    state = next.state;
    current = next.place;
    steps.push(next.place);
  });
  wander.start();

  return { steps, wander };
}

describe("Auto-wander over twenty steps", () => {
  it("makes exactly every fourth one a hop to a catalogue place", () => {
    const { steps, wander } = wiredWalk(7);

    for (let step = 0; step < 20; step += 1) stepOnce(wander);

    expect(steps).toHaveLength(20);
    steps.forEach((step, index) => {
      if ((index + 1) % WANDER_HOP_EVERY === 0) {
        expect(PLACES).toContain(step);
      } else {
        expect(step).toBe("drift");
      }
    });
    expect(steps.filter((step) => step !== "drift")).toHaveLength(5);
  });

  it("replaces a drift that settles blank with a hop, and only that drift", () => {
    let blank = false;
    const { steps, wander } = wiredWalk(7, () => blank);

    stepOnce(wander);
    stepOnce(wander);
    blank = true;
    wander.notifySettled();

    expect(steps[2]).not.toBe("drift");
    expect(PLACES).toContain(steps[2]);
    expect(steps).toHaveLength(3);

    // The replacement is a hop, so the next three scheduled steps drift.
    blank = false;
    stepOnce(wander);
    stepOnce(wander);
    stepOnce(wander);
    expect(steps.slice(3)).toEqual(["drift", "drift", "drift"]);
  });
});

describe("Auto-wander hops over a long walk", () => {
  const HOPS = 600;

  function hopsOf(seed: number): Place[] {
    const { steps, wander } = wiredWalk(seed);
    for (let step = 0; step < HOPS * WANDER_HOP_EVERY; step += 1) {
      stepOnce(wander);
    }

    return steps.filter((step): step is Place => step !== "drift");
  }

  it("change fractal about one hop in six", () => {
    const hops = hopsOf(11);
    expect(hops).toHaveLength(HOPS);

    // The first hop starts on PLACES[0]'s fractal.
    const fractals = [PLACES[0].fractal, ...hops.map((hop) => hop.fractal)];
    const switches = fractals.filter(
      (fractal, index) => index > 0 && fractal !== fractals[index - 1],
    ).length;

    expect(switches / HOPS).toBeGreaterThan(1 / 6 - 0.05);
    expect(switches / HOPS).toBeLessThan(1 / 6 + 0.05);
  });

  it("never go to the place they are on, or back inside the recent window", () => {
    const hops = hopsOf(23);
    let repeats = 0;

    hops.forEach((hop, index) => {
      if (index === 0) return;
      const previous = hops[index - 1];
      expect(hop.id).not.toBe(previous.id);

      // The window is the last TOUR_RECENT_LIMIT distinct places.
      const window = new Set<string>();
      for (let back = index - 1; back >= 0; back -= 1) {
        if (window.size === TOUR_RECENT_LIMIT) break;
        window.add(hops[back].id);
      }
      if (!window.has(hop.id)) return;

      // The engine repeats a place only when nothing else of the fractal it
      // chose is outside the window (Julia and the ship have ten places
      // against a window of twelve).
      repeats += 1;
      const alternatives = PLACES.filter(
        (place) =>
          place.fractal === hop.fractal &&
          place.id !== previous.id &&
          !window.has(place.id),
      );
      expect(alternatives).toEqual([]);
    });

    // Most hops are fresh places; the repeats are the exception.
    expect(repeats).toBeLessThan(hops.length / 10);
  });
});
