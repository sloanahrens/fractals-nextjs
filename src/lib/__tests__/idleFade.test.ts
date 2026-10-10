import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TOP_BAR_ACTIVITY_EVENTS,
  TOP_BAR_FADE_MS,
  TOP_BAR_IDLE_MS,
  createIdleFade,
} from "../idleFade";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the constants", () => {
  it("wait two seconds, and fade in well under one", () => {
    expect(TOP_BAR_IDLE_MS).toBe(2000);
    expect(TOP_BAR_FADE_MS).toBeGreaterThan(0);
    expect(TOP_BAR_FADE_MS).toBeLessThan(1000);
  });

  it("count a pointer move, a key press and a touch as input", () => {
    expect(TOP_BAR_ACTIVITY_EVENTS).toContain("pointermove");
    expect(TOP_BAR_ACTIVITY_EVENTS).toContain("keydown");
    expect(TOP_BAR_ACTIVITY_EVENTS).toContain("touchstart");
  });
});

describe("createIdleFade", () => {
  it("hides once, after the idle wait and not before", () => {
    const onChange = vi.fn();
    createIdleFade({ onChange });

    vi.advanceTimersByTime(TOP_BAR_IDLE_MS - 1);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(false);

    vi.advanceTimersByTime(10 * TOP_BAR_IDLE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("starts the wait over on input, without reporting a change", () => {
    const onChange = vi.fn();
    const fade = createIdleFade({ onChange });

    vi.advanceTimersByTime(TOP_BAR_IDLE_MS - 100);
    fade.activity();
    vi.advanceTimersByTime(TOP_BAR_IDLE_MS - 100);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("returns on input after hiding, and fades again after another wait", () => {
    const onChange = vi.fn();
    const fade = createIdleFade({ onChange });

    vi.advanceTimersByTime(TOP_BAR_IDLE_MS);
    fade.activity();
    expect(onChange).toHaveBeenLastCalledWith(true);

    vi.advanceTimersByTime(TOP_BAR_IDLE_MS);
    expect(onChange.mock.calls).toEqual([[false], [true], [false]]);
  });

  it("never hides while held, however long it waits", () => {
    const onChange = vi.fn();
    const fade = createIdleFade({ onChange, held: true });

    vi.advanceTimersByTime(60 * TOP_BAR_IDLE_MS);
    fade.activity();
    vi.advanceTimersByTime(60 * TOP_BAR_IDLE_MS);

    expect(onChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives a clock made when the hold ends a full wait of its own", () => {
    const onChange = vi.fn();
    const held = createIdleFade({ onChange, held: true });
    vi.advanceTimersByTime(30 * TOP_BAR_IDLE_MS);

    held.dispose();
    createIdleFade({ onChange });
    vi.advanceTimersByTime(TOP_BAR_IDLE_MS - 1);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("leaves no timer behind once disposed", () => {
    const onChange = vi.fn();
    const fade = createIdleFade({ onChange });

    fade.dispose();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(2 * TOP_BAR_IDLE_MS);
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
