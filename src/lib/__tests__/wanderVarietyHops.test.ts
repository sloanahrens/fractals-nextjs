import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FRACTAL_TYPES } from "../fractalTypes";
import { PLACES, type PlaceView } from "../places";
import { createRng } from "../wander";
import {
  DEFAULT_WANDER_INTERVAL_SECONDS,
  WANDER_HOP_EVERY,
  WanderController,
} from "../wanderController";
import {
  INITIAL_WANDER_VARIETY,
  WANDER_LOOKS,
  nextWanderHop,
  type Look,
  type WanderVarietyState,
} from "../wanderVariety";

const DEFAULT_MS = DEFAULT_WANDER_INTERVAL_SECONDS * 1000;
const FRACTALS = FRACTAL_TYPES.map((type) => type.id);
const PAIR_COUNT = FRACTALS.length * WANDER_LOOKS.length;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function stepOnce(wander: WanderController) {
  vi.advanceTimersByTime(DEFAULT_MS);
  wander.notifyRenderStart();
  wander.notifyRenderDone();
}

interface Step {
  hop: boolean;
  fractal: string;
  look: Look;
  /** Whether the step handler made its one replaced history entry. */
  replaced: boolean;
}

/**
 * The controller wired as the page wires it: a drift moves the view on the same
 * fractal in the same Look, and a hop takes the next pair from the variety walk
 * and lands on its place with the new Look through `handlePlaceSelect`'s
 * `replace` flight.
 */
function wiredWalk(seed: number) {
  const rng = createRng(seed);
  const wander = new WanderController();
  const steps: Step[] = [];
  let state: WanderVarietyState = INITIAL_WANDER_VARIETY;
  let view: PlaceView = {
    fractal: "mandelbrot",
    centerX: -0.75,
    centerY: 0,
    zoom: 1,
  };
  let look: Look = null;

  wander.setStepHandler(({ hop }) => {
    if (!hop) {
      view = { ...view, centerX: view.centerX + 0.01 };
      steps.push({ hop, fractal: view.fractal, look, replaced: false });
      return;
    }

    const next = nextWanderHop(state, view, look, PLACES, FRACTALS, rng);
    state = next.state;
    look = next.look;
    if (next.place !== null) {
      view = {
        fractal: next.place.fractal,
        variant: next.place.variant,
        centerX: next.place.centerX,
        centerY: next.place.centerY,
        zoom: next.place.zoom,
      };
    }
    steps.push({ hop, fractal: view.fractal, look, replaced: true });
  });
  wander.start();

  return { steps, wander };
}

describe("Auto-wander through every fractal and Look", () => {
  it("visits every (fractal, Look) pair exactly once in 44 consecutive hops", () => {
    for (const seed of [1, 3, 17]) {
      const { steps, wander } = wiredWalk(seed);
      for (let step = 0; step < PAIR_COUNT * WANDER_HOP_EVERY; step += 1) {
        stepOnce(wander);
      }

      const hops = steps.filter((step) => step.hop);
      expect(hops).toHaveLength(PAIR_COUNT);

      const seen = new Set(hops.map((hop) => `${hop.fractal}|${hop.look}`));
      expect(seen.size).toBe(PAIR_COUNT);
    }
  });

  it("changes the fractal and the Look only on a hop, which replaces its one history entry", () => {
    const { steps, wander } = wiredWalk(5);
    for (let step = 0; step < 60; step += 1) stepOnce(wander);

    let previous = { fractal: "mandelbrot", look: null as Look };
    for (const step of steps) {
      if (step.hop) {
        expect(step.replaced).toBe(true);
      } else {
        expect(step.replaced).toBe(false);
        expect(step.fractal).toBe(previous.fractal);
        expect(step.look).toBe(previous.look);
      }
      previous = { fractal: step.fractal, look: step.look };
    }

    // Every fourth step is the hop, as before.
    steps.forEach((step, index) => {
      expect(step.hop).toBe((index + 1) % WANDER_HOP_EVERY === 0);
    });
  });
});
