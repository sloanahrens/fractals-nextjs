import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHROME_ACTIVITY_EVENTS,
  CHROME_FADE_MS,
  CHROME_IDLE_MS,
  chromeHeld,
  createIdleFade,
  type ChromeHolds,
} from "../idleFade";

const NO_HOLDS: ChromeHolds = {
  settingsOpen: false,
  helpOpen: false,
  focusWithin: false,
  lookMenuOpen: false,
  mathExpanded: false,
  nudgeShown: false,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the constants", () => {
  it("wait three seconds, and fade in well under one", () => {
    expect(CHROME_IDLE_MS).toBe(3000);
    expect(CHROME_FADE_MS).toBe(300);
    expect(CHROME_FADE_MS).toBeGreaterThan(0);
    expect(CHROME_FADE_MS).toBeLessThan(1000);
  });

  it("count a pointer move, a key press and a touch as input", () => {
    expect(CHROME_ACTIVITY_EVENTS).toContain("pointermove");
    expect(CHROME_ACTIVITY_EVENTS).toContain("keydown");
    expect(CHROME_ACTIVITY_EVENTS).toContain("touchstart");
  });
});

describe("createIdleFade", () => {
  it("hides once, after the idle wait and not before", () => {
    const onChange = vi.fn();
    createIdleFade({ onChange });

    vi.advanceTimersByTime(CHROME_IDLE_MS - 1);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(false);

    vi.advanceTimersByTime(10 * CHROME_IDLE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("starts the wait over on input, without reporting a change", () => {
    const onChange = vi.fn();
    const fade = createIdleFade({ onChange });

    vi.advanceTimersByTime(CHROME_IDLE_MS - 100);
    fade.activity();
    vi.advanceTimersByTime(CHROME_IDLE_MS - 100);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("returns on input after hiding, and fades again after another wait", () => {
    const onChange = vi.fn();
    const fade = createIdleFade({ onChange });

    vi.advanceTimersByTime(CHROME_IDLE_MS);
    fade.activity();
    expect(onChange).toHaveBeenLastCalledWith(true);

    vi.advanceTimersByTime(CHROME_IDLE_MS);
    expect(onChange.mock.calls).toEqual([[false], [true], [false]]);
  });

  it("never hides while held, however long it waits", () => {
    const onChange = vi.fn();
    const fade = createIdleFade({ onChange, held: true });

    vi.advanceTimersByTime(60 * CHROME_IDLE_MS);
    fade.activity();
    vi.advanceTimersByTime(60 * CHROME_IDLE_MS);

    expect(onChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives a clock made when the hold ends a full wait of its own", () => {
    const onChange = vi.fn();
    const held = createIdleFade({ onChange, held: true });
    vi.advanceTimersByTime(30 * CHROME_IDLE_MS);

    held.dispose();
    createIdleFade({ onChange });
    vi.advanceTimersByTime(CHROME_IDLE_MS - 1);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("leaves no timer behind once disposed", () => {
    const onChange = vi.fn();
    const fade = createIdleFade({ onChange });

    fade.dispose();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(2 * CHROME_IDLE_MS);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("takes its wait and its timers from the caller", () => {
    const handles: Array<() => void> = [];
    const cleared: unknown[] = [];
    const onChange = vi.fn();
    const fade = createIdleFade({
      onChange,
      idleMs: 50,
      timers: {
        setTimeout: (callback, milliseconds) => {
          expect(milliseconds).toBe(50);
          handles.push(callback);
          return handles.length;
        },
        clearTimeout: (handle) => cleared.push(handle),
      },
    });

    fade.activity();
    expect(cleared).toEqual([1]);

    handles[1]();
    expect(onChange).toHaveBeenCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("chromeHeld", () => {
  it("holds nothing when no reason applies", () => {
    expect(chromeHeld(NO_HOLDS)).toBe(false);
  });

  it.each(Object.keys(NO_HOLDS) as Array<keyof ChromeHolds>)(
    "holds for %s alone",
    (reason) => {
      expect(chromeHeld({ ...NO_HOLDS, [reason]: true })).toBe(true);
    },
  );
});

describe("the chrome's clock under each hold", () => {
  // The owner remakes the clock with `held` from `chromeHeld` whenever a hold
  // starts or ends, as the page's hook does.
  it.each(Object.keys(NO_HOLDS) as Array<keyof ChromeHolds>)(
    "does not fade while %s holds, and waits in full once it ends",
    (reason) => {
      const onChange = vi.fn();
      const held = createIdleFade({
        onChange,
        held: chromeHeld({ ...NO_HOLDS, [reason]: true }),
      });

      vi.advanceTimersByTime(60 * CHROME_IDLE_MS);
      expect(onChange).not.toHaveBeenCalled();

      held.dispose();
      createIdleFade({ onChange, held: chromeHeld(NO_HOLDS) });

      vi.advanceTimersByTime(CHROME_IDLE_MS - 1);
      expect(onChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith(false);
    },
  );

  it("fades after exactly 3000 ms of quiet and returns on each kind of input", () => {
    const onChange = vi.fn();
    const fade = createIdleFade({ onChange });

    vi.advanceTimersByTime(2999);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenLastCalledWith(false);

    // One round per kind of input; the clock treats them all alike.
    CHROME_ACTIVITY_EVENTS.forEach(() => {
      fade.activity();
      expect(onChange).toHaveBeenLastCalledWith(true);
      vi.advanceTimersByTime(3000);
      expect(onChange).toHaveBeenLastCalledWith(false);
    });
  });
});
