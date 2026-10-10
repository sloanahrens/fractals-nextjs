import { describe, expect, it } from "vitest";

import {
  NEARBY_COUNT,
  NEARBY_POOL_SIZE,
  hasMoreNearby,
  nearbyRefreshDue,
  nearbyWindow,
  nextNearbyOffset,
} from "../nearbyStrip";

describe("nearbyRefreshDue", () => {
  it("waits for the first render of a visit to settle, then suggests", () => {
    expect(
      nearbyRefreshDue({
        settled: false,
        deliberateMoves: 0,
        refreshedAt: null,
      }),
    ).toBe(false);
    expect(
      nearbyRefreshDue({
        settled: true,
        deliberateMoves: 0,
        refreshedAt: null,
      }),
    ).toBe(true);
  });

  it("refreshes when a render settles after a deliberate move", () => {
    expect(
      nearbyRefreshDue({ settled: true, deliberateMoves: 1, refreshedAt: 0 }),
    ).toBe(true);
  });

  it("does not refresh while the move's render is still running", () => {
    expect(
      nearbyRefreshDue({ settled: false, deliberateMoves: 1, refreshedAt: 0 }),
    ).toBe(false);
  });

  it("does not refresh on a settled render with no new deliberate move", () => {
    // A drag, a wheel notch, a key or a walk step moves the view and settles a
    // render, but is not a deliberate move: the count has not moved.
    expect(
      nearbyRefreshDue({ settled: true, deliberateMoves: 2, refreshedAt: 2 }),
    ).toBe(false);
  });

  it("does not refresh on drag frames between a move and its settling", () => {
    // The move happened (count 1, last refreshed at 0); frames come and go
    // unsettled and nothing is worked out until one settles.
    const frames = [false, false, false].map((settled) =>
      nearbyRefreshDue({ settled, deliberateMoves: 1, refreshedAt: 0 }),
    );

    expect(frames).toEqual([false, false, false]);
  });

  it("refreshes once per move, not again until the next", () => {
    let refreshedAt: number | null = null;
    let refreshes = 0;

    const settle = (deliberateMoves: number) => {
      if (nearbyRefreshDue({ settled: true, deliberateMoves, refreshedAt })) {
        refreshedAt = deliberateMoves;
        refreshes++;
      }
    };

    settle(0);
    settle(0);
    settle(1);
    settle(1);
    settle(1);
    settle(2);

    expect(refreshes).toBe(3);
  });
});

describe("nearbyWindow", () => {
  const pool = Array.from({ length: NEARBY_POOL_SIZE }, (_, i) => i);

  it("shows the first page from offset 0", () => {
    expect(nearbyWindow(pool, 0)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("shows the next page from the next offset", () => {
    expect(nearbyWindow(pool, NEARBY_COUNT)).toEqual([6, 7, 8, 9, 10, 11]);
  });

  it("wraps round the end of the pool without coming up short", () => {
    expect(nearbyWindow([0, 1, 2, 3, 4, 5, 6], 6)).toEqual([6, 0, 1, 2, 3, 4]);
  });

  it("shows a pool no larger than a page whole", () => {
    expect(nearbyWindow([1, 2, 3], 4)).toEqual([1, 2, 3]);
    expect(nearbyWindow([], 0)).toEqual([]);
    expect(nearbyWindow([1, 2, 3, 4, 5, 6], 3)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("reads a negative or oversized offset as a position in the pool", () => {
    expect(nearbyWindow(pool, -NEARBY_COUNT)).toEqual([12, 13, 14, 15, 16, 17]);
    expect(nearbyWindow(pool, NEARBY_POOL_SIZE)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("nextNearbyOffset", () => {
  it("moves one page on and comes back to the first after the last", () => {
    let offset = 0;
    const seen: number[] = [];

    for (let i = 0; i < 4; i++) {
      seen.push(offset);
      offset = nextNearbyOffset(NEARBY_POOL_SIZE, offset);
    }

    expect(seen).toEqual([0, 6, 12, 0]);
  });

  it("has nowhere to go for a pool that fits in a page", () => {
    expect(nextNearbyOffset(4, 0)).toBe(0);
    expect(nextNearbyOffset(NEARBY_COUNT, 0)).toBe(0);
  });

  it("covers every place of an uneven pool before repeating", () => {
    const length = 9;
    const pool = Array.from({ length }, (_, i) => i);
    const shown = new Set<number>();
    let offset = 0;

    for (let i = 0; i < length; i++) {
      for (const place of nearbyWindow(pool, offset)) shown.add(place);
      offset = nextNearbyOffset(length, offset);
    }

    expect(shown.size).toBe(length);
  });
});

describe("hasMoreNearby", () => {
  it("offers More only when there is something beyond the page", () => {
    expect(hasMoreNearby(0)).toBe(false);
    expect(hasMoreNearby(NEARBY_COUNT)).toBe(false);
    expect(hasMoreNearby(NEARBY_COUNT + 1)).toBe(true);
  });
});
