/**
 * The Auto-wander pill's pure parts: its words, where it sits, and the
 * decision to nudge a first-time visitor.
 */
import { describe, expect, it, vi } from "vitest";

import {
  decideNudge,
  markNudgeSeen,
  NEARBY_STRIP_MAX_WIDTH,
  readNudgeSeen,
  WANDER_CONTROL_NAME,
  WANDER_NUDGE_AFTER_MS,
  WANDER_NUDGE_STORAGE_KEY,
  wanderPillLabel,
  wanderPlacement,
  type NudgeConditions,
  type NudgeStorage,
} from "../wanderControl";

describe("wanderPillLabel", () => {
  it("offers to start when off, whatever else the controller reports", () => {
    const label = wanderPillLabel({
      on: false,
      countdown: 4,
      rendering: false,
    });

    expect(label).toEqual({
      text: "Auto-wander",
      pressed: false,
      name: "Auto-wander",
      glyph: "play",
    });
  });

  it("shows the seconds to the next step while on and counting", () => {
    const label = wanderPillLabel({ on: true, countdown: 4, rendering: false });

    expect(label.text).toBe("Wandering · 4 s");
    expect(label.pressed).toBe(true);
    expect(label.glyph).toBe("pause");
  });

  it("is plain Wandering while a render is in flight, even with a stale number", () => {
    expect(
      wanderPillLabel({ on: true, countdown: 3, rendering: true }).text,
    ).toBe("Wandering");
  });

  it("is plain Wandering when no countdown is running", () => {
    expect(
      wanderPillLabel({ on: true, countdown: null, rendering: false }).text,
    ).toBe("Wandering");
  });

  it("does not print a number that is not a countdown", () => {
    for (const countdown of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(
        wanderPillLabel({ on: true, countdown, rendering: false }).text,
      ).toBe("Wandering");
    }
  });

  it("keeps the accessible name the same in both states", () => {
    const states = [true, false].flatMap((on) =>
      [null, 2].map((countdown) =>
        wanderPillLabel({ on, countdown, rendering: false }),
      ),
    );

    for (const label of states) expect(label.name).toBe(WANDER_CONTROL_NAME);
    expect(WANDER_CONTROL_NAME).toBe("Auto-wander");
  });
});

describe("wanderPlacement", () => {
  it("stacks above the strip on a phone and on a tablet", () => {
    expect(wanderPlacement(320)).toBe("above");
    expect(wanderPlacement(375)).toBe("above");
    expect(wanderPlacement(768)).toBe("above");
  });

  it("sits in the corner once the strip's longest row and the pill both fit", () => {
    expect(wanderPlacement(1003)).toBe("beside");
    expect(wanderPlacement(NEARBY_STRIP_MAX_WIDTH)).toBe("above");
  });

  it("stacks for a width it could not measure", () => {
    expect(wanderPlacement(Number.NaN)).toBe("above");
    expect(wanderPlacement(0)).toBe("above");
  });
});

function memoryStorage(): NudgeStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();

  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

function throwingStorage(): NudgeStorage {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
}

describe("the nudge's storage flag", () => {
  it("is unseen until it is marked, then seen", () => {
    const storage = memoryStorage();

    expect(readNudgeSeen(storage)).toBe(false);
    markNudgeSeen(storage);
    expect(readNudgeSeen(storage)).toBe(true);
    expect(storage.data.has(WANDER_NUDGE_STORAGE_KEY)).toBe(true);
  });

  it("reads as unseen, and marks nothing, where storage throws or is absent", () => {
    expect(readNudgeSeen(throwingStorage())).toBe(false);
    expect(() => markNudgeSeen(throwingStorage())).not.toThrow();
    expect(readNudgeSeen(null)).toBe(false);
    expect(() => markNudgeSeen(null)).not.toThrow();
  });
});

describe("decideNudge", () => {
  const fresh: NudgeConditions = {
    openForMs: WANDER_NUDGE_AFTER_MS,
    wanderUsed: false,
    tourStarted: false,
    overlayOpen: false,
    seen: false,
  };

  it("waits until the page has been open 15 s", () => {
    expect(decideNudge({ ...fresh, openForMs: 0 })).toBe("later");
    expect(decideNudge({ ...fresh, openForMs: 14999 })).toBe("later");
    expect(decideNudge(fresh)).toBe("show");
    expect(decideNudge({ ...fresh, openForMs: 60000 })).toBe("show");
  });

  it("never nudges a visitor who has used wander or a tour, or was nudged before", () => {
    expect(decideNudge({ ...fresh, wanderUsed: true })).toBe("never");
    expect(decideNudge({ ...fresh, tourStarted: true })).toBe("never");
    expect(decideNudge({ ...fresh, seen: true })).toBe("never");
    expect(decideNudge({ ...fresh, openForMs: 0, seen: true })).toBe("never");
  });

  it("holds back, without giving up, while Settings or Help covers the pill", () => {
    expect(decideNudge({ ...fresh, overlayOpen: true })).toBe("later");
  });

  it("treats an unreadable clock as not yet", () => {
    expect(decideNudge({ ...fresh, openForMs: Number.NaN })).toBe("later");
  });

  it("nudges on every visit when storage is broken", () => {
    const storage = throwingStorage();
    const visit = () => decideNudge({ ...fresh, seen: readNudgeSeen(storage) });

    expect(visit()).toBe("show");
    markNudgeSeen(storage);
    expect(visit()).toBe("show");
  });

  it("nudges once per browser when storage works", () => {
    const storage = memoryStorage();
    const visit = vi.fn(() =>
      decideNudge({ ...fresh, seen: readNudgeSeen(storage) }),
    );

    expect(visit()).toBe("show");
    markNudgeSeen(storage);
    expect(visit()).toBe("never");
  });
});
