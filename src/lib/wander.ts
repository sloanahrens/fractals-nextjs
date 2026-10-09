import type { FractalKind } from "../types/fractal";
import { defaultViewFor } from "./fractalTypes";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  autoIterations,
  calculateZoomBounds,
  clampZoom,
  pixelToComplex,
} from "./mandelbrot";

/**
 * A source of random numbers, uniform in [0, 1).
 *
 * Injected rather than reached for: the walk is a pure function of its
 * arguments, so a seeded generator makes it reproducible and a test can pin
 * the exact sequence of views it produces.
 */
export type Rng = () => number;

/**
 * A view of the plane: what the explorer pans and zooms.
 *
 * Only these three move; the fractal, its Julia constant, the colour scheme and
 * the iteration settings are the walker's fixed context, not its subject.
 */
export interface WanderView {
  centerX: number;
  centerY: number;
  zoom: number;
}

// How far a step moves, in units of the current view. The centre step is a
// Gaussian with a standard deviation of this fraction of the current view's
// width or height, so a step covers the same apparent distance at every zoom
// and two steps at 10000x stay as local as two at 1x.
const CENTER_SIGMA = 0.15;
// The zoom step is a Gaussian with this standard deviation on the *logarithm*
// of the zoom, so equal steps are equal ratios: the walk drifts as far in
// magnification from 100x to 200x as from 1000x to 2000x.
const LOG_ZOOM_SIGMA = 0.25;
// Both draws are clipped here, in standard deviations, so no single step is
// unbounded: the centre moves at most 0.375 of the view and the zoom changes by
// a factor between about 0.53 and 1.87.
const CLIP_SIGMA = 2.5;

// How many candidate steps to try before giving up on finding an interesting
// one. Eight attempts, each 16 x 12 samples, is the whole cost of a step.
const MAX_DRAWS = 8;

// How far the centre may stray from the fractal's own default centre, on each
// axis. The fractals are each framed on a part of the plane — the set around
// -0.75, the ship around -0.45 by -0.5 — and a walk that wandered past this box
// would be inspecting empty plane and calling it a fractal.
const NEIGHBOURHOOD = 2.0;

// The grid a view is judged on: 16 x 12 samples across the bounds, which is
// coarse enough to cost nothing and fine enough to see a view that has gone
// flat.
const SAMPLE_COLUMNS = 16;
const SAMPLE_ROWS = 12;

// Distinct iteration counts a coarse sample has to show to count as
// interesting. A view that has escaped almost everywhere at once reports one
// count for nearly every sample, and a view deep inside the set reports the cap
// for all of them; both are one flat colour on the canvas, which is the state
// this test exists to reject.
const MIN_DISTINCT_ITERATIONS = 5;

// What a step falls back to when no candidate is worth showing: the same
// centre, 25% less zoom, which walks back toward the full view that is
// interesting rather than letting the walk sit still on a flat one.
const FALLBACK_ZOOM_FACTOR = 0.75;

/**
 * A seeded generator producing the same sequence for the same seed, so a walk
 * can be replayed exactly.
 *
 * mulberry32: one 32-bit counter advanced by a fixed increment and passed
 * through a few integer mixing steps. Small enough to read, and its output is a
 * function of the seed alone — nothing here reads the clock or the platform.
 * @param seed - Any number; the same seed always yields the same sequence
 * @returns A generator uniform in [0, 1)
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One standard normal draw, clipped to a few standard deviations.
 *
 * Box-Muller: two uniform draws become one normal one. The clip is what makes
 * the step bound a guarantee rather than a statement about the tails — without
 * it a rare draw would move the view a long way.
 * @param rng - Source of uniform numbers in [0, 1)
 * @returns A standard normal value, no larger than CLIP_SIGMA in magnitude
 */
function clippedGaussian(rng: Rng): number {
  // A draw of exactly 0 would take the logarithm below to -Infinity, and the
  // cosine can be 0 at the same time, which is how that becomes a NaN step.
  const first = Math.max(rng(), Number.MIN_VALUE);
  const second = rng();
  const normal =
    Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);

  return Math.min(CLIP_SIGMA, Math.max(-CLIP_SIGMA, normal));
}

/**
 * Whether a view is worth looking at: whether a coarse sample of it shows
 * variety rather than one flat colour.
 *
 * The sample is a 16 x 12 grid across the view's bounds, each point run through
 * the fractal's own formula at the iteration count the zoom calls for. A view
 * with at least five distinct counts out of the 192 is one with structure
 * across it — the edge of the set, a filament, a spiral — and a view with fewer
 * is one the app paints as a single colour, which is what walking into a deep
 * flat region looks like.
 * @param view - View to judge
 * @param kind - Fractal the view is drawn with
 * @returns True when the sample shows at least MIN_DISTINCT_ITERATIONS counts
 */
export function isInteresting(view: WanderView, kind: FractalKind): boolean {
  const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);
  const cap = autoIterations(view.zoom);
  const counts = new Set<number>();

  for (let row = 0; row < SAMPLE_ROWS; row++) {
    for (let column = 0; column < SAMPLE_COLUMNS; column++) {
      // Sample points at the centre of each grid cell, so the grid covers the
      // view evenly instead of leaning on one edge of it.
      const point = pixelToComplex(
        column + 0.5,
        row + 0.5,
        SAMPLE_COLUMNS,
        SAMPLE_ROWS,
        bounds,
      );
      counts.add(kind.iterations(point, cap, false));

      if (counts.size >= MIN_DISTINCT_ITERATIONS) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Clamp a coordinate into the box a fractal's walks stay inside.
 */
function clampToNeighbourhood(value: number, home: number): number {
  return Math.min(home + NEIGHBOURHOOD, Math.max(home - NEIGHBOURHOOD, value));
}

/**
 * The next view of a random walk: a step near the current view that is worth
 * looking at.
 *
 * The centre moves by a Gaussian of the current view's own size, so steps stay
 * local in whatever is on screen, and the zoom moves by a Gaussian in
 * log-zoom, so the walk drifts through magnifications rather than being pinned
 * by them. Each candidate is clamped into the fractal's neighbourhood and into
 * the zoom range, and then tested for variety; the first that passes is the
 * step. A view with no interesting neighbour — deep inside a flat region, where
 * every candidate is flat too — steps back toward the full view instead: same
 * centre, a quarter less zoom.
 *
 * The fractal is context, not a subject: nothing here changes which one is
 * drawn, only where it is looked at.
 * @param current - View the walk stands on
 * @param kind - Fractal the view is drawn with, and what is sampled to judge a candidate
 * @param typeId - Picker id of that fractal, which decides the neighbourhood to stay in
 * @param rng - Source of randomness; injected so a walk is reproducible
 * @returns The next view, always inside the neighbourhood and the zoom range
 */
export function nextWanderView(
  current: WanderView,
  kind: FractalKind,
  typeId: string,
  rng: Rng,
): WanderView {
  const home = defaultViewFor(typeId);
  const width = BASE_WIDTH / current.zoom;
  const height = BASE_HEIGHT / current.zoom;

  for (let draw = 0; draw < MAX_DRAWS; draw++) {
    const candidate: WanderView = {
      centerX: clampToNeighbourhood(
        current.centerX + clippedGaussian(rng) * CENTER_SIGMA * width,
        home.centerX,
      ),
      centerY: clampToNeighbourhood(
        current.centerY + clippedGaussian(rng) * CENTER_SIGMA * height,
        home.centerY,
      ),
      zoom: clampZoom(
        current.zoom * Math.exp(LOG_ZOOM_SIGMA * clippedGaussian(rng)),
      ),
    };

    if (isInteresting(candidate, kind)) {
      return candidate;
    }
  }

  return {
    centerX: current.centerX,
    centerY: current.centerY,
    zoom: clampZoom(current.zoom * FALLBACK_ZOOM_FACTOR),
  };
}
