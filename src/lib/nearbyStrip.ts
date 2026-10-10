/**
 * The Nearby strip's decisions, with no page or DOM in them: when the
 * suggestions are worked out again, which of them show, and how long a flight
 * to one of them takes to fade.
 */

/** How many places the strip shows at once. */
export const NEARBY_COUNT = 6;

/**
 * How many places are worked out per refresh: three pages of the strip, so the
 * More tile has others to rotate in before it comes back round to the first.
 */
export const NEARBY_POOL_SIZE = NEARBY_COUNT * 3;

/** The crossfade from the old picture to the new one after a tile is clicked. */
export const CROSSFADE_MS = 400;

/** What the page knows when it asks whether the suggestions are stale. */
export interface NearbyRefreshState {
  /**
   * Whether a full-resolution render has finished on the view the page is
   * showing. A drag's previews and a render still running are not settled.
   */
  settled: boolean;
  /**
   * How many deliberate moves there have been: a preset, typed coordinates, a
   * fractal or constant picked from its select, a tile, a link arriving. A
   * wheel notch, a drag, a key, a slider or a walk step is not one.
   */
  deliberateMoves: number;
  /** The move count the suggestions on show were worked out at, or null before any. */
  refreshedAt: number | null;
}

/**
 * Whether the suggestions should be worked out again now.
 *
 * Two things must both hold: the view has been drawn, and it is not the view
 * the suggestions were worked out for. The first draw of a visit counts as the
 * latter, since nothing has been suggested yet. A move that has not settled
 * waits, and a settled render with no new move behind it does not refresh, so a
 * drag — however many frames it renders — leaves the strip as it was.
 */
export function nearbyRefreshDue(state: NearbyRefreshState): boolean {
  if (!state.settled) return false;

  return (
    state.refreshedAt === null || state.refreshedAt !== state.deliberateMoves
  );
}

/**
 * The places the strip shows: `size` of the pool, starting at `offset` and
 * wrapping round the end, so the More tile can walk the pool in pages that
 * never come up short. A pool no larger than a page is shown whole.
 */
export function nearbyWindow<T>(
  pool: readonly T[],
  offset: number,
  size: number = NEARBY_COUNT,
): T[] {
  if (pool.length <= size) return [...pool];

  const start =
    ((Math.floor(offset) % pool.length) + pool.length) % pool.length;

  return Array.from(
    { length: size },
    (_, index) => pool[(start + index) % pool.length],
  );
}

/**
 * The offset the More tile moves to: one page on, wrapping at the end of the
 * pool. A pool that fits in one page has nowhere to go.
 */
export function nextNearbyOffset(
  poolLength: number,
  offset: number,
  size: number = NEARBY_COUNT,
): number {
  if (poolLength <= size) return 0;

  return (offset + size) % poolLength;
}

/**
 * Whether the strip has anything beyond what it shows, which is when it offers
 * a More tile at all.
 */
export function hasMoreNearby(
  poolLength: number,
  size: number = NEARBY_COUNT,
): boolean {
  return poolLength > size;
}
