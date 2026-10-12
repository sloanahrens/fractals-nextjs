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

  it("reaches every fractal in the catalogue", () => {
    const fractals = new Set(PLACES.map((p) => p.fractal));
    const seen = new Set(
      walk(PLACES, 400, seeded(5)).map((h) => h.place.fractal),
    );

    expect(fractals.size).toBe(8);
    expect(seen).toEqual(fractals);
  });

  it("gives each fractal a plausible share of a 400-hop run", () => {
    const share = new Map<string, number>();
    for (const hop of walk(PLACES, 400, seeded(8))) {
      share.set(hop.place.fractal, (share.get(hop.place.fractal) ?? 0) + 1);
    }

    // Eight fractals share the 400 hops, about 50 each. A walk stays on a
    // fractal for a few hops at a time, so one seed's share is streaky, and a
    // short run can leave one fractal with almost nothing (over 200 hops,
    // twelve seeds ranged from 0 to 62); 400 hops is long enough that twelve
    // seeds ranged from 8 to 124, so the floor only rules out a fractal the
    // walk has all but forgotten.
    for (const fractal of new Set(PLACES.map((p) => p.fractal))) {
      const visits = share.get(fractal) ?? 0;
      expect(visits).toBeGreaterThanOrEqual(10);
      expect(visits).toBeLessThanOrEqual(120);
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
