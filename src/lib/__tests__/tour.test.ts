import { describe, expect, it } from "vitest";

import {
  PLACES,
  placeColorScheme,
  suggest,
  type Place,
  type PlaceView,
} from "../places";
import {
  TOUR_CROSSFADE_MS,
  TOUR_DWELL_MS,
  TOUR_FRACTAL_SWITCH_ODDS,
  TOUR_RECENT_LIMIT,
  TOUR_SWITCH_LOCKOUT_HOPS,
  initialTourState,
  nextStopOnFractal,
  nextTourStop,
  type TourState,
} from "../tour";

/** A small seeded generator (mulberry32), so a run replays. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function place(id: string, fractal: string, centerX: number, zoom = 4): Place {
  return { id, name: id, fractal, centerX, centerY: 0, zoom };
}

function viewOf(p: Place): PlaceView {
  return {
    fractal: p.fractal,
    variant: p.variant,
    centerX: p.centerX,
    centerY: p.centerY,
    zoom: p.zoom,
  };
}

interface Hop {
  before: TourState;
  place: Place;
  after: TourState;
}

/** Runs `hops` hops from the catalogue's first place. */
function walk(
  places: readonly Place[],
  hops: number,
  rng: () => number,
): Hop[] {
  let state = initialTourState(viewOf(places[0]));
  const out: Hop[] = [];

  for (let i = 0; i < hops; i += 1) {
    const step = nextTourStop(state, places, rng);
    out.push({ before: state, place: step.place, after: step.state });
    state = step.state;
  }

  return out;
}

const switched = (hop: Hop) => hop.place.fractal !== hop.before.view.fractal;

/** The fractals of a catalogue and how many of its places each holds. */
function placeCounts(places: readonly Place[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of places) {
    counts.set(p.fractal, (counts.get(p.fractal) ?? 0) + 1);
  }

  return counts;
}

/**
 * The share of a long tour each fractal earns, from its place count.
 *
 * A hop switches fractal about once in `1 / TOUR_FRACTAL_SWITCH_ODDS`, choosing
 * the place uniformly among the places of every other fractal, so a switch out
 * of fractal i lands on fractal j with chance n_j / (N - n_i). The walk between
 * fractals is then in detailed balance with a share of hops on a fractal of n
 * places, out of N in all, of n(N - n) / SUM, over the fractals, of g(N - g):
 * n_i(N - n_i) n_j / (N - n_i) is n_i n_j either way round, and every visit to
 * a fractal has the same mean length because the switch roll does not depend on
 * the fractal. The recent window moves a pick from a place visited lately to
 * another place of the same fractal, so it leaves this share alone; what it
 * does bend is that neighbouring hops are not independent.
 */
function modelledShares(places: readonly Place[]): Map<string, number> {
  const counts = placeCounts(places);
  const weights = new Map(
    [...counts].map(
      ([fractal, n]) => [fractal, n * (places.length - n)] as const,
    ),
  );
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);

  return new Map(
    [...weights].map(([fractal, weight]) => [fractal, weight / total]),
  );
}

/** A catalogue with the run length its place counts ask for. */
interface TourModel {
  readonly places: readonly Place[];
  /** Each fractal's modelled share of the hops, by id. */
  readonly shares: ReadonlyMap<string, number>;
  /** How long a walk has to be for the share bounds to mean anything. */
  readonly hops: number;
}

/**
 * A catalogue and the walk the share and reach tests measure over.
 *
 * The run is long enough that the rarest fractal is expected on 30 stays,
 * where a stay is a switch plus the first hop: a run of H hops holds about
 * H * TOUR_FRACTAL_SWITCH_ODDS switches, so H = ceil(30 / p_min /
 * TOUR_FRACTAL_SWITCH_ODDS), with p_min the smallest {@link modelledShares}
 * share. Adding a fractal with few places lowers p_min and so lengthens the
 * run by itself.
 */
function tourModel(places: readonly Place[]): TourModel {
  const shares = modelledShares(places);
  const rarest = Math.min(...shares.values());

  return {
    places,
    shares,
    hops: Math.ceil(30 / rarest / TOUR_FRACTAL_SWITCH_ODDS),
  };
}

/** One fixed seed, so the committed walk replays; not a seed picked for luck. */
const TOUR_SEED = 8;

const walks = new WeakMap<TourModel, Hop[]>();

/** The model's one walk, computed on first use and shared after. */
function modelWalk(model: TourModel): Hop[] {
  let hops = walks.get(model);
  if (hops === undefined) {
    hops = walk(model.places, model.hops, seeded(TOUR_SEED));
    walks.set(model, hops);
  }

  return hops;
}

/** A catalogue of fifteen fractals, the last of them with only two places. */
const SYNTHETIC_PLACES: Place[] = [
  19, 15, 12, 10, 10, 9, 6, 6, 6, 6, 6, 5, 4, 3, 2,
].flatMap((count, fractal) =>
  Array.from({ length: count }, (_, index) =>
    place(`f${fractal}-p${index}`, `fractal-${fractal}`, fractal * 10 + index),
  ),
);

describe("tour constants", () => {
  it("are the owner-approved timings and odds", () => {
    expect(TOUR_DWELL_MS).toBe(8000);
    expect(TOUR_CROSSFADE_MS).toBe(1500);
    expect(TOUR_FRACTAL_SWITCH_ODDS).toBeCloseTo(1 / 6, 12);
    expect(TOUR_RECENT_LIMIT).toBe(12);
  });
});

describe("nextTourStop", () => {
  it("is deterministic for a seeded rng and leaves the state alone", () => {
    const state = initialTourState(viewOf(PLACES[0]));
    const frozen = JSON.stringify(state);

    const first = nextTourStop(state, PLACES, seeded(7));
    const second = nextTourStop(state, PLACES, seeded(7));

    expect(second).toEqual(first);
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it("replays a whole walk from the same seed", () => {
    const ids = (seed: number) =>
      walk(PLACES, 100, seeded(seed)).map((hop) => hop.place.id);

    expect(ids(3)).toEqual(ids(3));
    expect(ids(3)).not.toEqual(ids(4));
  });

  it("returns the state at the place it chose", () => {
    const [hop] = walk(PLACES, 1, seeded(1));

    expect(hop.after.view).toEqual(viewOf(hop.place));
    expect(hop.after.recent).toEqual([hop.place.id]);
  });

  it("never returns the place the view is on", () => {
    for (const seed of [1, 2, 3]) {
      for (const hop of walk(PLACES, 600, seeded(seed))) {
        if (switched(hop)) continue;

        // suggest() leaves out the place that is the view, so a place it
        // keeps is a different one.
        expect(suggest(hop.before.view, [hop.place], 1)).toHaveLength(1);
      }
    }
  });

  it("never repeats inside the recent window while an alternative exists", () => {
    for (const seed of [1, 2, 3, 4]) {
      for (const hop of walk(PLACES, 1500, seeded(seed))) {
        const recent = new Set(hop.before.recent);
        if (!recent.has(hop.place.id)) continue;

        // A repeat is only allowed when the pool the hop drew from had
        // nothing else: the fractal's other places, or the places of the
        // other fractals when the hop switched.
        const pool = switched(hop)
          ? PLACES.filter((p) => p.fractal !== hop.before.view.fractal)
          : suggest(hop.before.view, PLACES, PLACES.length);

        expect(pool.filter((p) => !recent.has(p.id))).toEqual([]);
      }
    }
  });

  it("keeps the recent list bounded, distinct and ending at the place", () => {
    const hops = walk(PLACES, 200, seeded(11));

    for (const hop of hops) {
      expect(hop.after.recent.length).toBeLessThanOrEqual(TOUR_RECENT_LIMIT);
      expect(new Set(hop.after.recent).size).toBe(hop.after.recent.length);
      expect(hop.after.recent.at(-1)).toBe(hop.place.id);
    }
    expect(hops.at(-1)!.after.recent).toHaveLength(TOUR_RECENT_LIMIT);
  });

  it("switches fractal about one hop in six over 5000 hops", () => {
    const hops = walk(PLACES, 5000, seeded(2026));
    const rate = hops.filter(switched).length / hops.length;

    expect(Math.abs(rate - 1 / 6)).toBeLessThan(0.03);
  });

  it("never switches within two hops of a switch", () => {
    const hops = walk(PLACES, 5000, seeded(99));
    const at = hops.flatMap((hop, index) => (switched(hop) ? [index] : []));

    expect(at.length).toBeGreaterThan(100);
    for (let i = 1; i < at.length; i += 1) {
      expect(at[i] - at[i - 1]).toBeGreaterThan(TOUR_SWITCH_LOCKOUT_HOPS);
    }
  });

  it("changes colour scheme as places change, by the shared rule", () => {
    const schemes = new Set(
      walk(PLACES, 100, seeded(6)).map((hop) =>
        placeColorScheme(hop.place, "fire"),
      ),
    );

    expect(schemes.size).toBeGreaterThan(1);
  });

  it("holds an rng that answers outside [0, 1) to the ends", () => {
    const state = initialTourState(viewOf(PLACES[0]));

    for (const odd of [-1, 1, 2, Number.NaN, Infinity]) {
      const step = nextTourStop(state, PLACES, () => odd);
      expect(PLACES).toContain(step.place);
    }
  });
});

// The same assertions over the real catalogue and over one built to be unlike
// it (fifteen fractals, place counts from nineteen down to two), so a
// fourteenth fractal with any number of places cannot turn them red.
const CATALOGUES: readonly { name: string; places: readonly Place[] }[] = [
  { name: "the real catalogue", places: PLACES },
  {
    name: "a synthetic catalogue of fifteen fractals",
    places: SYNTHETIC_PLACES,
  },
];

for (const { name, places } of CATALOGUES) {
  describe(`a place-weighted tour over ${name}`, () => {
    const model = tourModel(places);

    it("reaches every fractal in the catalogue", () => {
      const seen = new Set(modelWalk(model).map((hop) => hop.place.fractal));

      expect(seen).toEqual(new Set(placeCounts(places).keys()));
    });

    it("gives each fractal the share its place count earns", () => {
      const hops = modelWalk(model);
      const stays = hops.filter(switched).length + 1;

      const visits = new Map<string, number>();
      for (const hop of hops) {
        visits.set(hop.place.fractal, (visits.get(hop.place.fractal) ?? 0) + 1);
      }

      // One stay draws a fractal with the modelled share, so a share measured
      // over S stays varies by about sqrt(p (1 - p) / S). A walk is streaky —
      // it bobs about one fractal rather than drawing every stay afresh — and
      // measured spreads over seeds ran about 1.15 times that figure, so the
      // bound here is four of those; the floor never asks for less than one
      // visit, and the ceiling never more than the run.
      const misses: {
        fractal: string;
        seen: number;
        floor: number;
        ceiling: number;
      }[] = [];

      for (const [fractal, share] of model.shares) {
        const expected = share * hops.length;
        const tolerance =
          4 * 1.15 * Math.sqrt((share * (1 - share)) / stays) * hops.length;
        const seen = visits.get(fractal) ?? 0;
        const floor = Math.max(1, expected - tolerance);
        const ceiling = Math.min(hops.length, expected + tolerance);

        if (seen < floor || seen > ceiling) {
          misses.push({ fractal, seen, floor, ceiling });
        }
      }

      expect(misses).toEqual([]);
    });
  });
}

describe("nextTourStop on a degenerate catalogue", () => {
  const view: PlaceView = {
    fractal: "mandelbrot",
    centerX: 0,
    centerY: 0,
    zoom: 1,
  };

  it("does not throw on an empty catalogue and returns a place at the view", () => {
    const step = nextTourStop(initialTourState(view), [], seeded(1));

    expect(step.place).toMatchObject(view);
    expect(step.state.view).toEqual(view);
  });

  it("returns the one place when the view is on it", () => {
    const only = place("only", "mandelbrot", 0, 1);
    const step = nextTourStop(
      initialTourState(viewOf(only)),
      [only],
      seeded(1),
    );

    expect(step.place).toBe(only);
  });

  it("goes to the one place when the view is elsewhere", () => {
    const only = place("only", "mandelbrot", 3, 8);
    const step = nextTourStop(initialTourState(view), [only], seeded(1));

    expect(step.place).toBe(only);
  });

  it("stays on a catalogue of one fractal and never switches", () => {
    const places = ["a", "b", "c", "d"].map((id, i) =>
      place(id, "mandelbrot", i + 1),
    );

    for (const hop of walk(places, 300, seeded(4))) {
      expect(hop.place.fractal).toBe("mandelbrot");
    }
  });

  it("leaves a fractal that has only the place it is on", () => {
    const here = place("here", "mandelbrot", 0, 1);
    const there = place("there", "julia", 0, 1);
    const step = nextTourStop(
      initialTourState(viewOf(here)),
      [here, there],
      () => 0.99,
    );

    expect(step.place).toBe(there);
    expect(step.state.hopsSinceSwitch).toBe(0);
  });

  it("does not throw on a view that cannot be measured", () => {
    const broken: PlaceView = { ...view, zoom: Number.NaN };
    const step = nextTourStop(initialTourState(broken), PLACES, seeded(1));

    expect(PLACES).toContain(step.place);
  });
});

describe("nextStopOnFractal", () => {
  const a1 = place("a1", "mandelbrot", 0, 1);
  const a2 = place("a2", "mandelbrot", 1, 4);
  const a3 = place("a3", "mandelbrot", 2, 8);
  const b1 = place("b1", "julia", 0, 1);
  const b2 = place("b2", "julia", 1, 4);
  const catalogue = [a1, a2, a3, b1, b2];

  it("stays on the view's fractal by the tour's within-fractal rule", () => {
    const state = initialTourState(viewOf(a1));
    const step = nextStopOnFractal(state, catalogue, "mandelbrot", seeded(4));

    expect(step).not.toBeNull();
    expect([a2, a3]).toContain(step!.place);
    expect(step!.state.hopsSinceSwitch).toBe(state.hopsSinceSwitch + 1);
  });

  it("picks the place nextTourStop picks when it stays", () => {
    // A state that cannot switch, so the tour makes its roll and then the pick.
    const state = { ...initialTourState(viewOf(a1)), hopsSinceSwitch: 0 };
    const viaTour = nextTourStop(state, catalogue, seeded(9));
    const rng = seeded(9);
    rng(); // the tour's switch roll, which the helper does not make
    const viaHelper = nextStopOnFractal(state, catalogue, "mandelbrot", rng);

    expect(viaHelper!.place).toBe(viaTour.place);
  });

  it("goes to a place of another fractal, preferring one not visited lately", () => {
    const state: TourState = {
      ...initialTourState(viewOf(a1)),
      recent: ["b1"],
    };

    for (let seed = 1; seed <= 20; seed += 1) {
      const step = nextStopOnFractal(state, catalogue, "julia", seeded(seed));

      expect(step!.place).toBe(b2);
      expect(step!.state.hopsSinceSwitch).toBe(0);
    }
  });

  it("takes a visited place of the other fractal when all have been visited", () => {
    const state: TourState = {
      ...initialTourState(viewOf(a1)),
      recent: ["b1", "b2"],
    };
    const step = nextStopOnFractal(state, catalogue, "julia", seeded(1));

    expect([b1, b2]).toContain(step!.place);
  });

  it("answers null when the fractal has no place to go to", () => {
    const state = initialTourState(viewOf(a1));

    expect(
      nextStopOnFractal(state, [a1, b1], "mandelbrot", seeded(1)),
    ).toBeNull();
    expect(nextStopOnFractal(state, catalogue, "newton", seeded(1))).toBeNull();
  });

  it("does not change the state it is handed", () => {
    const state = initialTourState(viewOf(a1));
    const frozen = JSON.stringify(state);

    nextStopOnFractal(state, catalogue, "julia", seeded(1));
    nextStopOnFractal(state, catalogue, "mandelbrot", seeded(1));

    expect(JSON.stringify(state)).toBe(frozen);
  });
});
