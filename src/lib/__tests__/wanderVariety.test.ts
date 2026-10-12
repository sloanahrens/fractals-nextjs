import { describe, expect, it } from "vitest";

import { FRACTAL_TYPES } from "../fractalTypes";
import { PLACES, type Place, type PlaceView } from "../places";
import { createRng } from "../wander";
import {
  INITIAL_WANDER_VARIETY,
  WANDER_LOOKS,
  nextWanderHop,
  type Look,
  type WanderVarietyState,
} from "../wanderVariety";

const FRACTALS = FRACTAL_TYPES.map((type) => type.id);
const PAIR_COUNT = FRACTALS.length * WANDER_LOOKS.length;

const START: PlaceView = {
  fractal: "mandelbrot",
  centerX: -0.75,
  centerY: 0,
  zoom: 1,
};

function viewOf(place: Place): PlaceView {
  return {
    fractal: place.fractal,
    variant: place.variant,
    centerX: place.centerX,
    centerY: place.centerY,
    zoom: place.zoom,
  };
}

interface Visit {
  fractal: string;
  look: Look;
  place: Place | null;
}

/** A walk of `hops` hops from the opening view in Normal, as the page makes them. */
function walk(
  seed: number,
  hops: number,
  places: readonly Place[] = PLACES,
  fractals: readonly string[] = FRACTALS,
): Visit[] {
  const rng = createRng(seed);
  let state: WanderVarietyState = INITIAL_WANDER_VARIETY;
  let view = START;
  let look: Look = null;
  const visits: Visit[] = [];

  for (let hop = 0; hop < hops; hop += 1) {
    const next = nextWanderHop(state, view, look, places, fractals, rng);
    state = next.state;
    look = next.look;
    if (next.place !== null) view = viewOf(next.place);
    visits.push({ fractal: view.fractal, look, place: next.place });
  }

  return visits;
}

const key = (visit: { fractal: string; look: Look }) =>
  `${visit.fractal}|${visit.look}`;

describe("the Looks", () => {
  it("are Normal and the three orbit traps", () => {
    expect(WANDER_LOOKS).toEqual([null, "point", "line", "circle"]);
  });

  it("make 44 pairs over the picker's eleven fractals", () => {
    expect(FRACTALS).toHaveLength(11);
    expect(PAIR_COUNT).toBe(44);
  });
});

describe("a bag of pairs", () => {
  it.each([1, 2, 7, 99])(
    "visits every fractal in every Look exactly once in 44 hops (seed %i)",
    (seed) => {
      const visits = walk(seed, PAIR_COUNT);

      expect(new Set(visits.map(key)).size).toBe(PAIR_COUNT);
      expect(visits).toHaveLength(PAIR_COUNT);
      for (const fractal of FRACTALS) {
        for (const look of WANDER_LOOKS) {
          expect(visits.map(key)).toContain(key({ fractal, look }));
        }
      }
    },
  );

  it("takes every pair once per bag over several bags", () => {
    const visits = walk(5, PAIR_COUNT * 3);

    for (let bag = 0; bag < 3; bag += 1) {
      const slice = visits.slice(bag * PAIR_COUNT, (bag + 1) * PAIR_COUNT);
      expect(new Set(slice.map(key)).size).toBe(PAIR_COUNT);
    }
  });

  it("never opens a new bag on the pair that is on screen, and never repeats a pair across the boundary", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const visits = walk(seed, PAIR_COUNT * 4);

      for (let at = 1; at < visits.length; at += 1) {
        expect(key(visits[at])).not.toBe(key(visits[at - 1]));
      }
    }
  });

  it("shuffles: two seeds give two orders", () => {
    expect(walk(1, PAIR_COUNT).map(key)).not.toEqual(
      walk(2, PAIR_COUNT).map(key),
    );
  });

  it("is deterministic: the same seed gives the same sequence", () => {
    const a = walk(11, PAIR_COUNT * 2);
    const b = walk(11, PAIR_COUNT * 2);

    expect(a.map((visit) => [key(visit), visit.place?.id])).toEqual(
      b.map((visit) => [key(visit), visit.place?.id]),
    );
  });

  it("does not change the state it is handed", () => {
    const rng = createRng(3);
    const first = nextWanderHop(
      INITIAL_WANDER_VARIETY,
      START,
      null,
      PLACES,
      FRACTALS,
      rng,
    );
    const frozen = JSON.stringify(first.state);

    nextWanderHop(
      first.state,
      viewOf(first.place!),
      first.look,
      PLACES,
      FRACTALS,
      rng,
    );

    expect(JSON.stringify(first.state)).toBe(frozen);
    expect(INITIAL_WANDER_VARIETY.bag).toEqual([]);
  });

  it("opens the first bag on a pair other than the one on screen even when it is drawn first", () => {
    // Whatever the seed, the first hop of a walk on Mandelbrot/Normal is not it.
    for (let seed = 1; seed <= 200; seed += 1) {
      const [first] = walk(seed, 1);

      expect(key(first)).not.toBe(key({ fractal: "mandelbrot", look: null }));
    }
  });
});

describe("the place a hop chooses", () => {
  it("always belongs to the pair's fractal", () => {
    for (const seed of [1, 4, 8]) {
      for (const visit of walk(seed, PAIR_COUNT * 2)) {
        if (visit.place !== null) {
          expect(visit.place.fractal).toBe(visit.fractal);
        }
      }
    }
  });

  it("is never the place the view is on when the fractal stays", () => {
    const rng = createRng(21);
    let state: WanderVarietyState = INITIAL_WANDER_VARIETY;
    let view = START;
    let look: Look = null;

    for (let hop = 0; hop < PAIR_COUNT * 2; hop += 1) {
      const before = view;
      const next = nextWanderHop(state, view, look, PLACES, FRACTALS, rng);
      state = next.state;
      look = next.look;

      if (next.place !== null) {
        view = viewOf(next.place);
        if (next.place.fractal === before.fractal) {
          expect(
            next.place.centerX === before.centerX &&
              next.place.centerY === before.centerY &&
              next.place.zoom === before.zoom &&
              next.place.variant === before.variant,
          ).toBe(false);
        }
      }
    }
  });

  it("carries a variant for a fractal that takes one", () => {
    const visits = walk(2, PAIR_COUNT * 2);

    for (const fractal of [
      "julia",
      "multibrot",
      "newton",
      "magnet",
      "phoenix",
    ]) {
      const there = visits.filter((visit) => visit.fractal === fractal);

      expect(there.length).toBeGreaterThan(0);
      for (const visit of there) {
        expect(visit.place?.variant).toBeTruthy();
      }
    }
  });
});

describe("a fractal with one place", () => {
  const only = PLACES.find((place) => place.fractal === "tricorn")!;
  const lone: Place[] = [
    ...PLACES.filter((place) => place.fractal !== "tricorn"),
    only,
  ];

  it("changes only the Look on the view it is on", () => {
    const rng = createRng(1);
    const view = viewOf(only);
    // A bag of one fractal in the four Looks, from a view on that fractal.
    const first = nextWanderHop(
      INITIAL_WANDER_VARIETY,
      view,
      null,
      lone,
      ["tricorn"],
      rng,
    );

    expect(first.place).toBeNull();
    expect(first.look).not.toBeNull();
    expect(first.state.bag).toHaveLength(WANDER_LOOKS.length - 1);
  });

  it("is still reached from another fractal, by its one place", () => {
    const visits = walk(3, PAIR_COUNT, lone);

    const tricorn = visits.filter((visit) => visit.fractal === "tricorn");
    expect(tricorn).toHaveLength(WANDER_LOOKS.length);
  });

  it("leaves a fractal with no place at all as a Look change", () => {
    const hop = nextWanderHop(
      INITIAL_WANDER_VARIETY,
      START,
      null,
      PLACES,
      ["no-such-fractal"],
      createRng(1),
    );

    expect(hop.place).toBeNull();
  });
});
