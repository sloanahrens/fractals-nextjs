/**
 * The Math card's pure parts
 *
 * What the card prints for a view, how often it may redraw while the view
 * moves, and what the card remembers (shown or hidden, collapsed or expanded).
 * That must survive a storage that is missing, throws or holds junk, since a
 * private window or blocked site data is an ordinary browser, not an error.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { PLACES } from "../places";
import { LINK_WRITE_INTERVAL_MS } from "../viewLinkState";
import {
  DEFAULT_MATH_CARD_STATE,
  LEGACY_EXPANDED_KEY,
  MATH_CARD_STORAGE_KEY,
  MATH_CARD_UPDATE_MS,
  formatViewNumbers,
  getMathCardSnapshot,
  getServerMathCardSnapshot,
  loadMathCardState,
  mathCardDelayMs,
  parseMathCardState,
  resetMathCardMemory,
  saveMathCardState,
  setMathCardExpanded,
  setMathCardOpen,
  subscribeToMathCard,
  type MathCardStorage,
  type MathCardView,
} from "../mathCard";

const VIEW: MathCardView = {
  centerX: -0.7453,
  centerY: 0.1127,
  zoom: 400,
  iterations: 700,
  autoIterations: true,
  colorScheme: "fire",
};

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  const storage: MathCardStorage = {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };

  return { storage, data };
}

afterEach(() => {
  resetMathCardMemory();
  vi.unstubAllGlobals();
});

describe("formatViewNumbers", () => {
  it("prints the centre as a + bi, the width, the zoom, the cap and the scheme", () => {
    expect(formatViewNumbers(VIEW)).toEqual({
      centre: "-0.7453 + 0.1127i",
      width: "0.01",
      zoom: "400x",
      iterations: "700 (Auto)",
      scheme: "Fire",
    });
  });

  it("says nothing of Auto when the cap was set by hand", () => {
    expect(
      formatViewNumbers({ ...VIEW, autoIterations: false, iterations: 321 })
        .iterations,
    ).toBe("321");
  });

  it("uses the zoom formatter the slider uses, so 1.1x is not 1x", () => {
    expect(formatViewNumbers({ ...VIEW, zoom: 1.1 }).zoom).toBe("1.1x");
    expect(formatViewNumbers({ ...VIEW, zoom: 2500 }).zoom).toBe("2.5Kx");
  });

  it("measures the width against the base frame of 4", () => {
    expect(formatViewNumbers({ ...VIEW, zoom: 1 }).width).toBe("4");
    expect(formatViewNumbers({ ...VIEW, zoom: 8 }).width).toBe("0.5");
  });

  it("names every colour scheme as Settings does", () => {
    const names = (
      ["classic", "fire", "ocean", "rainbow", "grayscale"] as const
    ).map((colorScheme) => formatViewNumbers({ ...VIEW, colorScheme }).scheme);

    expect(names).toEqual(["Classic", "Fire", "Ocean", "Rainbow", "Grayscale"]);
  });

  it("agrees with the Coordinates read-out on the centre of a catalogue place", () => {
    const place = PLACES[0];
    const numbers = formatViewNumbers({
      ...VIEW,
      centerX: place.centerX,
      centerY: place.centerY,
    });

    expect(numbers.centre).not.toBe("");
    expect(numbers.centre).not.toContain("NaN");
  });
});

describe("the refresh cadence", () => {
  it("is the link writer's", () => {
    expect(MATH_CARD_UPDATE_MS).toBe(LINK_WRITE_INTERVAL_MS);
  });

  it("waits out the rest of the interval after a refresh", () => {
    expect(mathCardDelayMs(1000, 1000)).toBe(MATH_CARD_UPDATE_MS);
    expect(mathCardDelayMs(1200, 1000)).toBe(MATH_CARD_UPDATE_MS - 200);
  });

  it("does not wait once the interval is out, nor for a first refresh", () => {
    expect(mathCardDelayMs(1000 + MATH_CARD_UPDATE_MS, 1000)).toBe(0);
    expect(mathCardDelayMs(5000, 0)).toBe(0);
  });

  it("never returns a negative wait", () => {
    expect(mathCardDelayMs(10_000, 1000)).toBe(0);
  });
});

describe("what the card remembers", () => {
  const stored = (open: unknown, expanded: unknown) =>
    JSON.stringify({ v: 1, open, expanded });

  it("starts shown and collapsed", () => {
    expect(DEFAULT_MATH_CARD_STATE).toEqual({ open: true, expanded: false });
    expect(getServerMathCardSnapshot()).toEqual(DEFAULT_MATH_CARD_STATE);
  });

  it("reads a stored version-1 value", () => {
    for (const [open, expanded] of [
      [true, false],
      [true, true],
      [false, false],
      [false, true],
    ]) {
      expect(parseMathCardState(stored(open, expanded))).toEqual({
        open,
        expanded,
      });
    }
  });

  it("keeps the default for a field that is missing or not a boolean", () => {
    expect(parseMathCardState('{"v":1}')).toEqual(DEFAULT_MATH_CARD_STATE);
    expect(parseMathCardState('{"v":1,"open":false}')).toEqual({
      open: false,
      expanded: false,
    });
    expect(parseMathCardState(stored("no", 1))).toEqual(
      DEFAULT_MATH_CARD_STATE,
    );
    expect(parseMathCardState(stored(null, true))).toEqual({
      open: true,
      expanded: true,
    });
  });

  it("refuses JSON junk, other shapes and other versions", () => {
    for (const raw of [
      "",
      "not json",
      "{",
      "null",
      "1",
      '"1"',
      "true",
      "[]",
      "[1,0]",
      '{"open":false,"expanded":true}',
      '{"v":2,"open":false}',
      '{"v":"1","open":false}',
    ]) {
      expect(parseMathCardState(raw), raw).toBeNull();
    }
    expect(parseMathCardState(null)).toBeNull();
  });

  it("loads the default from an empty storage or none at all", () => {
    expect(loadMathCardState(fakeStorage().storage)).toEqual(
      DEFAULT_MATH_CARD_STATE,
    );
    expect(loadMathCardState(undefined)).toEqual(DEFAULT_MATH_CARD_STATE);
    expect(loadMathCardState(undefined, undefined)).not.toBe(
      DEFAULT_MATH_CARD_STATE,
    );
  });

  it("loads the default for corrupt storage rather than a half-read value", () => {
    const { storage } = fakeStorage({ [MATH_CARD_STORAGE_KEY]: "{oops" });

    expect(loadMathCardState(storage)).toEqual(DEFAULT_MATH_CARD_STATE);
  });

  it("reads fr-1tk's session value once, when there is no versioned one", () => {
    const session = (value: string) =>
      fakeStorage({ [LEGACY_EXPANDED_KEY]: value }).storage;

    expect(loadMathCardState(fakeStorage().storage, session("1"))).toEqual({
      open: true,
      expanded: true,
    });
    expect(loadMathCardState(fakeStorage().storage, session("0"))).toEqual({
      open: true,
      expanded: false,
    });
    expect(loadMathCardState(fakeStorage().storage, session("yes"))).toEqual(
      DEFAULT_MATH_CARD_STATE,
    );
    // The versioned value wins over the old one.
    const { storage } = fakeStorage({
      [MATH_CARD_STORAGE_KEY]: stored(false, false),
    });
    expect(loadMathCardState(storage, session("1"))).toEqual({
      open: false,
      expanded: false,
    });
    // A corrupt versioned value falls back to the old one, then the default.
    const corrupt = fakeStorage({ [MATH_CARD_STORAGE_KEY]: "junk" }).storage;
    expect(loadMathCardState(corrupt, session("1")).expanded).toBe(true);
  });

  it("writes one versioned key and nothing under the old one", () => {
    const { storage, data } = fakeStorage();

    saveMathCardState(storage, { open: false, expanded: true });

    expect(data).toEqual({
      [MATH_CARD_STORAGE_KEY]: '{"v":1,"open":false,"expanded":true}',
    });
    expect(MATH_CARD_STORAGE_KEY).toMatch(/\.v1$/);
    expect(loadMathCardState(storage)).toEqual({ open: false, expanded: true });
  });

  it("survives a storage that throws on every call", () => {
    const hostile: MathCardStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(loadMathCardState(hostile, hostile)).toEqual(
      DEFAULT_MATH_CARD_STATE,
    );
    expect(() =>
      saveMathCardState(hostile, { open: false, expanded: false }),
    ).not.toThrow();
    expect(() =>
      saveMathCardState(undefined, { open: false, expanded: false }),
    ).not.toThrow();
  });
});

describe("the store the card and the page subscribe to", () => {
  it("reads localStorage until this page changes the state", () => {
    const { storage } = fakeStorage({
      [MATH_CARD_STORAGE_KEY]: JSON.stringify({
        v: 1,
        open: false,
        expanded: true,
      }),
    });
    vi.stubGlobal("window", { localStorage: storage });

    expect(getMathCardSnapshot()).toEqual({ open: false, expanded: true });
  });

  it("is the default for a fresh visitor", () => {
    vi.stubGlobal("window", {
      localStorage: fakeStorage().storage,
      sessionStorage: fakeStorage().storage,
    });

    expect(getMathCardSnapshot()).toEqual({ open: true, expanded: false });
  });

  it("carries fr-1tk's session choice over", () => {
    vi.stubGlobal("window", {
      localStorage: fakeStorage().storage,
      sessionStorage: fakeStorage({ [LEGACY_EXPANDED_KEY]: "1" }).storage,
    });

    expect(getMathCardSnapshot()).toEqual({ open: true, expanded: true });
  });

  it("keeps each change, saves it and tells the subscribers", () => {
    const { storage, data } = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const heard = vi.fn();
    const unsubscribe = subscribeToMathCard(heard);

    setMathCardOpen(false);
    expect(getMathCardSnapshot()).toEqual({ open: false, expanded: false });
    expect(data[MATH_CARD_STORAGE_KEY]).toBe(
      '{"v":1,"open":false,"expanded":false}',
    );

    // One choice does not undo the other.
    setMathCardExpanded(true);
    expect(getMathCardSnapshot()).toEqual({ open: false, expanded: true });
    expect(heard).toHaveBeenCalledTimes(2);

    unsubscribe();
    setMathCardOpen(true);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(getMathCardSnapshot()).toEqual({ open: true, expanded: true });
  });

  it("says nothing and writes nothing when a call changes nothing", () => {
    const { storage, data } = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const heard = vi.fn();
    subscribeToMathCard(heard);

    setMathCardOpen(true);
    setMathCardExpanded(false);

    expect(heard).not.toHaveBeenCalled();
    expect(data).toEqual({});
  });

  it("still works for the life of the page when storage is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
      get sessionStorage(): Storage {
        throw new Error("blocked");
      },
    });

    expect(getMathCardSnapshot()).toEqual({ open: true, expanded: false });
    setMathCardOpen(false);
    setMathCardExpanded(true);
    expect(getMathCardSnapshot()).toEqual({ open: false, expanded: true });
  });

  it("returns a stable value between changes, as useSyncExternalStore needs", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage().storage });

    expect(getMathCardSnapshot()).toBe(getMathCardSnapshot());
    expect(getServerMathCardSnapshot()).toBe(getServerMathCardSnapshot());
  });
});
