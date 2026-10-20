import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHROME_ACTIVITY_EVENTS,
  CHROME_FADE_MS,
  CHROME_IDLE_MS,
  chromeHeld,
  chromeShown,
  createIdleFade,
  watchChromeActivity,
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

describe("watchChromeActivity", () => {
  it.each(CHROME_ACTIVITY_EVENTS)(
    "fades after 3000 ms of quiet and %s brings the chrome back at once",
    (name) => {
      const target = new EventTarget();
      const onChange = vi.fn();
      watchChromeActivity({ target, onChange });

      vi.advanceTimersByTime(CHROME_IDLE_MS);
      expect(onChange).toHaveBeenLastCalledWith(false);

      target.dispatchEvent(new Event(name));
      expect(onChange).toHaveBeenLastCalledWith(true);

      vi.advanceTimersByTime(CHROME_IDLE_MS - 1);
      expect(onChange).toHaveBeenLastCalledWith(true);
      vi.advanceTimersByTime(1);
      expect(onChange).toHaveBeenLastCalledWith(false);
    },
  );

  it("restarts the wait on input before the chrome has faded", () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    watchChromeActivity({ target, onChange });

    vi.advanceTimersByTime(CHROME_IDLE_MS - 1);
    target.dispatchEvent(new Event("pointermove"));
    vi.advanceTimersByTime(CHROME_IDLE_MS - 1);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not fade the chrome at once when the pointer leaves, nor restart the wait", () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    watchChromeActivity({ target, onChange });

    vi.advanceTimersByTime(1000);
    target.dispatchEvent(new Event("pointerleave"));
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(CHROME_IDLE_MS - 1000);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("stops listening and counting once cleaned up", () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    const stop = watchChromeActivity({ target, onChange });

    stop();
    target.dispatchEvent(new Event("pointermove"));
    vi.advanceTimersByTime(10 * CHROME_IDLE_MS);

    expect(onChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  describe("under each hold, as the page remakes the watch when a hold changes", () => {
    // What `useIdleVisibility` does: a hold starting or ending shows the
    // controls and gives the new watch a full wait.
    function page() {
      const target = new EventTarget();
      let holds = NO_HOLDS;
      let visible = true;
      let stop = () => {};

      const watch = () => {
        stop();
        stop = watchChromeActivity({
          target,
          onChange: (next) => (visible = next),
          held: chromeHeld(holds),
        });
      };
      watch();

      return {
        target,
        shown: () => chromeShown(chromeHeld(holds), visible),
        hold: (next: Partial<ChromeHolds>) => {
          const before = chromeHeld(holds);
          holds = { ...holds, ...next };
          if (chromeHeld(holds) !== before) {
            visible = true;
            watch();
          }
        },
      };
    }

    it.each(Object.keys(NO_HOLDS) as Array<keyof ChromeHolds>)(
      "%s keeps the controls up however long, and they fade 3000 ms after it ends",
      (reason) => {
        const chrome = page();

        chrome.hold({ [reason]: true });
        vi.advanceTimersByTime(60 * CHROME_IDLE_MS);
        expect(chrome.shown()).toBe(true);

        chrome.hold({ [reason]: false });
        vi.advanceTimersByTime(CHROME_IDLE_MS - 1);
        expect(chrome.shown()).toBe(true);

        vi.advanceTimersByTime(1);
        expect(chrome.shown()).toBe(false);

        chrome.target.dispatchEvent(new Event("keydown"));
        expect(chrome.shown()).toBe(true);
      },
    );

    it("keeps them up while any one of several holds remains", () => {
      const chrome = page();

      chrome.hold({ settingsOpen: true, lookMenuOpen: true });
      chrome.hold({ settingsOpen: false });
      vi.advanceTimersByTime(60 * CHROME_IDLE_MS);
      expect(chrome.shown()).toBe(true);

      chrome.hold({ lookMenuOpen: false });
      vi.advanceTimersByTime(CHROME_IDLE_MS);
      expect(chrome.shown()).toBe(false);
    });
  });
});
