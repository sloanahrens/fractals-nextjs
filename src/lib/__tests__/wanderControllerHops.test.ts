import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_WANDER_INTERVAL_SECONDS,
  WANDER_HOP_EVERY,
  WanderController,
} from "../wanderController";

const SECOND = 1000;
const DEFAULT_MS = DEFAULT_WANDER_INTERVAL_SECONDS * SECOND;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** One scheduled step: the interval passes, then the step's own render. */
function stepOnce(wander: WanderController) {
  vi.advanceTimersByTime(DEFAULT_MS);
  wander.notifyRenderStart();
  wander.notifyRenderDone();
}

describe("WanderController hops", () => {
  it("hops on every fourth step and drifts on the others", () => {
    expect(WANDER_HOP_EVERY).toBe(4);

    const kinds: boolean[] = [];
    const wander = new WanderController();
    wander.setStepHandler(({ hop }) => kinds.push(hop));
    wander.start();

    for (let step = 0; step < 20; step += 1) stepOnce(wander);

    expect(kinds).toHaveLength(20);
    kinds.forEach((hop, index) => {
      expect(hop).toBe((index + 1) % WANDER_HOP_EVERY === 0);
    });
    expect(kinds.filter(Boolean)).toHaveLength(5);
  });

  it("starts the count again when the mode is switched off and on", () => {
    const kinds: boolean[] = [];
    const wander = new WanderController();
    wander.setStepHandler(({ hop }) => kinds.push(hop));

    wander.start();
    stepOnce(wander);
    stepOnce(wander);
    wander.stop();
    wander.start();
    for (let step = 0; step < 4; step += 1) stepOnce(wander);

    expect(kinds).toEqual([false, false, false, false, false, true]);
  });

  it("leaves the count alone while the tab is hidden: a hold takes no step", () => {
    const kinds: boolean[] = [];
    const wander = new WanderController();
    wander.setStepHandler(({ hop }) => kinds.push(hop));
    wander.start();

    stepOnce(wander);
    wander.setHidden(true);
    vi.advanceTimersByTime(10 * DEFAULT_MS);
    wander.setHidden(false);
    stepOnce(wander);
    stepOnce(wander);
    stepOnce(wander);

    expect(kinds).toEqual([false, false, false, true]);
  });

  describe("a drift that lands on a blank picture", () => {
    /** A walk whose detector says whatever `blank.now` is when asked. */
    function blankWalk() {
      const blank = { now: false };
      const kinds: boolean[] = [];
      const wander = new WanderController();
      wander.setBlankDetector(() => blank.now);
      wander.setStepHandler(({ hop }) => kinds.push(hop));
      wander.start();

      return { blank, kinds, wander };
    }

    it("is replaced at once by a hop, with no wait", () => {
      const { blank, kinds, wander } = blankWalk();

      vi.advanceTimersByTime(DEFAULT_MS);
      expect(kinds).toEqual([false]);

      wander.notifyRenderStart();
      wander.notifyRenderDone();
      blank.now = true;
      wander.notifySettled();

      expect(kinds).toEqual([false, true]);
    });

    it("counts as a hop, so the next scheduled hop is four steps on", () => {
      const { blank, kinds, wander } = blankWalk();

      stepOnce(wander);
      blank.now = true;
      wander.notifySettled();
      blank.now = false;
      for (let step = 0; step < 4; step += 1) stepOnce(wander);

      expect(kinds).toEqual([false, true, false, false, false, true]);
    });

    it("is not looked at again after the hop it caused", () => {
      const { blank, kinds, wander } = blankWalk();
      blank.now = true;

      stepOnce(wander);
      wander.notifySettled();
      wander.notifySettled();
      wander.notifySettled();

      expect(kinds).toEqual([false, true]);
    });

    it("is left alone when the picture is not blank", () => {
      const { kinds, wander } = blankWalk();

      stepOnce(wander);
      wander.notifySettled();

      expect(kinds).toEqual([false]);
    });

    it("is not asked of a picture a hop produced", () => {
      const asked = vi.fn(() => true);
      const wander = new WanderController();
      wander.setBlankDetector(asked);
      wander.setStepHandler(() => {});
      wander.start();

      for (let step = 0; step < 4; step += 1) stepOnce(wander);
      asked.mockClear();
      wander.notifySettled();

      expect(asked).not.toHaveBeenCalled();
    });

    it("is not replaced once the visitor has moved the view by hand", () => {
      const { blank, kinds, wander } = blankWalk();

      stepOnce(wander);
      wander.notifyActivity();
      blank.now = true;
      wander.notifySettled();

      expect(kinds).toEqual([false]);
    });

    it("keeps its flag when the step's own report of activity comes through", () => {
      const kinds: boolean[] = [];
      const wander = new WanderController();
      wander.setBlankDetector(() => true);
      // The page's drift ends in notifyActivity, from inside the handler.
      wander.setStepHandler(({ hop }) => {
        kinds.push(hop);
        wander.notifyActivity();
      });
      wander.start();

      stepOnce(wander);
      wander.notifySettled();

      expect(kinds).toEqual([false, true]);
    });

    it("is not replaced while the walk is off, the tab is hidden or a render runs", () => {
      const { blank, kinds, wander } = blankWalk();
      blank.now = true;

      stepOnce(wander);
      wander.setHidden(true);
      wander.notifySettled();
      expect(kinds).toEqual([false]);

      wander.setHidden(false);
      stepOnce(wander);
      wander.stop();
      wander.notifySettled();
      expect(kinds).toEqual([false, false]);

      wander.start();
      stepOnce(wander);
      wander.notifyRenderStart();
      wander.notifySettled();
      expect(kinds).toEqual([false, false, false]);
    });
  });

  it("stops when switched off, whether the next step is a hop or a drift", () => {
    const steps = vi.fn();
    const wander = new WanderController();
    wander.setStepHandler(steps);
    wander.start();
    for (let step = 0; step < 3; step += 1) stepOnce(wander);

    wander.stop();
    vi.advanceTimersByTime(60 * SECOND);

    // The fourth would have been a hop.
    expect(steps).toHaveBeenCalledTimes(3);
  });

  it("is held while a tour plays, as it is while the tab is hidden", () => {
    const steps = vi.fn();
    const wander = new WanderController();
    wander.setStepHandler(steps);
    wander.start();

    wander.setHidden(true);
    vi.advanceTimersByTime(60 * SECOND);
    expect(steps).not.toHaveBeenCalled();

    wander.setHidden(false);
    vi.advanceTimersByTime(DEFAULT_MS);
    expect(steps).toHaveBeenCalledTimes(1);
  });
});
