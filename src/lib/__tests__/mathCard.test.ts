/**
 * The Math card's pure parts
 *
 * What the card prints for a view, how often it may redraw while the view
 * moves, and the expanded-or-collapsed choice kept for the session. The choice
 * must survive a storage that is missing or throws, since a private window or
 * blocked site data is an ordinary browser, not an error.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { PLACES } from "../places";
import { LINK_WRITE_INTERVAL_MS } from "../viewLinkState";
import {
  MATH_CARD_STORAGE_KEY,
  MATH_CARD_UPDATE_MS,
  formatViewNumbers,
  getExpandedSnapshot,
  getServerExpandedSnapshot,
  mathCardDelayMs,
  readExpanded,
  resetExpandedMemory,
  setExpanded,
  subscribeToExpanded,
  writeExpanded,
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
  resetExpandedMemory();
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

describe("the expanded choice in storage", () => {
  it("reads a stored 1 as expanded and everything else as collapsed", () => {
    expect(
      readExpanded(fakeStorage({ [MATH_CARD_STORAGE_KEY]: "1" }).storage),
    ).toBe(true);
    expect(
      readExpanded(fakeStorage({ [MATH_CARD_STORAGE_KEY]: "0" }).storage),
    ).toBe(false);
    expect(
      readExpanded(fakeStorage({ [MATH_CARD_STORAGE_KEY]: "yes" }).storage),
    ).toBe(false);
    expect(readExpanded(fakeStorage().storage)).toBe(false);
  });

  it("writes 1 and 0 under one key", () => {
    const { storage, data } = fakeStorage();

    writeExpanded(storage, true);
    expect(data).toEqual({ [MATH_CARD_STORAGE_KEY]: "1" });
    writeExpanded(storage, false);
    expect(data).toEqual({ [MATH_CARD_STORAGE_KEY]: "0" });
  });

  it("treats a missing storage as collapsed and ignores a write to it", () => {
    expect(readExpanded(undefined)).toBe(false);
    expect(() => writeExpanded(undefined, true)).not.toThrow();
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

    expect(readExpanded(hostile)).toBe(false);
    expect(() => writeExpanded(hostile, true)).not.toThrow();
  });
});

describe("the store the card subscribes to", () => {
  it("is collapsed on the server", () => {
    expect(getServerExpandedSnapshot()).toBe(false);
  });

  it("reads the session's storage until this page changes the choice", () => {
    const { storage } = fakeStorage({ [MATH_CARD_STORAGE_KEY]: "1" });
    vi.stubGlobal("window", { sessionStorage: storage });

    expect(getExpandedSnapshot()).toBe(true);
  });

  it("keeps a change in storage and tells the subscribers", () => {
    const { storage, data } = fakeStorage();
    vi.stubGlobal("window", { sessionStorage: storage });
    const heard = vi.fn();
    const unsubscribe = subscribeToExpanded(heard);

    setExpanded(true);

    expect(getExpandedSnapshot()).toBe(true);
    expect(data[MATH_CARD_STORAGE_KEY]).toBe("1");
    expect(heard).toHaveBeenCalledTimes(1);

    unsubscribe();
    setExpanded(false);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(getExpandedSnapshot()).toBe(false);
  });

  it("still toggles for the life of the page when storage refuses the write", () => {
    vi.stubGlobal("window", {
      get sessionStorage(): Storage {
        throw new Error("blocked");
      },
    });

    expect(getExpandedSnapshot()).toBe(false);
    setExpanded(true);
    expect(getExpandedSnapshot()).toBe(true);
  });

  it("returns a stable value between changes, as useSyncExternalStore needs", () => {
    vi.stubGlobal("window", { sessionStorage: fakeStorage().storage });

    expect(getExpandedSnapshot()).toBe(getExpandedSnapshot());
  });
});
