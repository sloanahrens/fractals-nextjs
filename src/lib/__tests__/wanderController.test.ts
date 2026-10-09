import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_WANDER_INTERVAL_SECONDS,
  WanderController,
} from "../wanderController";

// The countdown ticks in whole seconds, and the default wait is five of them.
const SECOND = 1000;
const DEFAULT_MS = DEFAULT_WANDER_INTERVAL_SECONDS * SECOND;

/** A controller whose steps are counted, on the fake clock. */
function countingController() {
  const steps = vi.fn();
  const wander = new WanderController();

  wander.setStepHandler(steps);

  return { steps, wander };
}

describe("WanderController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("steps one interval after the render that precedes it finishes", () => {
    const { steps, wander } = countingController();

    wander.start();
    wander.notifyRenderStart();
    wander.notifyRenderDone();

    vi.advanceTimersByTime(DEFAULT_MS - 1);
    expect(steps).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(steps).toHaveBeenCalledTimes(1);
  });

  it("does not step while a render is in progress", () => {
    const { steps, wander } = countingController();

    wander.start();
    wander.notifyRenderStart();

    vi.advanceTimersByTime(60 * SECOND);
    expect(steps).not.toHaveBeenCalled();
  });

  it("waits out a render that is already running when the mode is switched on", () => {
    const { steps, wander } = countingController();

    wander.notifyRenderStart();
    wander.start();

    vi.advanceTimersByTime(60 * SECOND);
    expect(steps).not.toHaveBeenCalled();

    wander.notifyRenderDone();
    vi.advanceTimersByTime(DEFAULT_MS - 1);
    expect(steps).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(steps).toHaveBeenCalledTimes(1);
  });

  it("restarts the wait when the user moves the view by hand", () => {
    const { steps, wander } = countingController();

    wander.start();
    vi.advanceTimersByTime(4 * SECOND);
    wander.notifyActivity();

    vi.advanceTimersByTime(4 * SECOND);
    expect(steps).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1 * SECOND);
    expect(steps).toHaveBeenCalledTimes(1);
  });

  it("stops the countdown while the tab is hidden and starts a fresh one when it is shown", () => {
    const { steps, wander } = countingController();

    wander.start();
    vi.advanceTimersByTime(3 * SECOND);
    wander.setHidden(true);

    vi.advanceTimersByTime(60 * SECOND);
    expect(steps).not.toHaveBeenCalled();

    wander.setHidden(false);
    vi.advanceTimersByTime(DEFAULT_MS - 1);
    expect(steps).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(steps).toHaveBeenCalledTimes(1);
  });

  it("stops the countdown when the mode is switched off", () => {
    const { steps, wander } = countingController();

    wander.start();
    vi.advanceTimersByTime(3 * SECOND);
    wander.stop();

    vi.advanceTimersByTime(60 * SECOND);
    expect(steps).not.toHaveBeenCalled();
  });

  it("begins a fresh wait when the mode is switched on again", () => {
    const { steps, wander } = countingController();

    wander.start();
    vi.advanceTimersByTime(3 * SECOND);
    wander.stop();
    wander.start();

    vi.advanceTimersByTime(DEFAULT_MS - 1);
    expect(steps).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(steps).toHaveBeenCalledTimes(1);
  });

  it("applies a changed interval to the next wait, not to the one running", () => {
    const { steps, wander } = countingController();

    wander.start();
    wander.setIntervalSeconds(10);

    vi.advanceTimersByTime(5 * SECOND);
    expect(steps).toHaveBeenCalledTimes(1);

    // The step's own render is what arms the next wait.
    wander.notifyRenderStart();
    wander.notifyRenderDone();

    vi.advanceTimersByTime(10 * SECOND - 1);
    expect(steps).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(steps).toHaveBeenCalledTimes(2);
  });

  it("does not double-step when the mode is switched on twice", () => {
    const { steps, wander } = countingController();

    wander.start();
    wander.start();

    vi.advanceTimersByTime(DEFAULT_MS);
    expect(steps).toHaveBeenCalledTimes(1);
  });

  it("waits for the step's own render before counting down again", () => {
    const { steps, wander } = countingController();

    wander.start();
    vi.advanceTimersByTime(DEFAULT_MS);
    expect(steps).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60 * SECOND);
    expect(steps).toHaveBeenCalledTimes(1);

    wander.notifyRenderStart();
    wander.notifyRenderDone();
    vi.advanceTimersByTime(DEFAULT_MS);
    expect(steps).toHaveBeenCalledTimes(2);
  });

  it("reports the seconds left and reports none while a render runs", () => {
    const countdowns: (number | null)[] = [];
    const wander = new WanderController({
      onCountdown: (secondsRemaining) => countdowns.push(secondsRemaining),
    });

    wander.start();
    expect(countdowns).toEqual([DEFAULT_WANDER_INTERVAL_SECONDS]);

    vi.advanceTimersByTime(2 * SECOND);
    expect(countdowns).toEqual([
      DEFAULT_WANDER_INTERVAL_SECONDS,
      DEFAULT_WANDER_INTERVAL_SECONDS - 1,
      DEFAULT_WANDER_INTERVAL_SECONDS - 2,
    ]);

    wander.notifyRenderStart();
    expect(countdowns.at(-1)).toBeNull();

    wander.notifyRenderDone();
    expect(countdowns.at(-1)).toBe(DEFAULT_WANDER_INTERVAL_SECONDS);
  });

  it("keeps the last good interval when given one it cannot use", () => {
    const wander = new WanderController();
    wander.setIntervalSeconds(10);

    wander.setIntervalSeconds(0);
    wander.setIntervalSeconds(121);
    wander.setIntervalSeconds(2.5);
    wander.setIntervalSeconds(Number.NaN);

    expect(wander.getIntervalSeconds()).toBe(10);

    wander.setIntervalSeconds(1);
    expect(wander.getIntervalSeconds()).toBe(1);
  });

  it("starts on the default interval when handed one it cannot use", () => {
    const wander = new WanderController({ intervalSeconds: 0 });

    expect(wander.getIntervalSeconds()).toBe(DEFAULT_WANDER_INTERVAL_SECONDS);
  });
});
