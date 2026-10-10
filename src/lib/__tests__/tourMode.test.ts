import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOUR_DWELL_MS } from "../tour";
import {
  TOUR_ACTIVITY_EVENTS,
  TOUR_IDLE_START_MS,
  TOUR_RESUME_MS,
  TourMode,
  isTextEntry,
  pointerMoved,
  type TourConditions,
  type TourModeState,
} from "../tourMode";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * A machine on a page that is drawn and quiet, with every change recorded.
 * The first report of conditions is what starts the idle wait, as the page's.
 */
function quietPage(conditions: Partial<TourConditions> = {}) {
  const changes: [TourModeState, TourModeState][] = [];
  const hops: boolean[] = [];
  const tour = new TourMode({
    onChange: (next, previous) => changes.push([next, previous]),
  });
  tour.setHopHandler((first) => hops.push(first));
  tour.setConditions({ settled: true, ...conditions });

  return { tour, changes, hops };
}

describe("the constants", () => {
  it("wait twenty seconds for input before a tour starts by itself", () => {
    expect(TOUR_IDLE_START_MS).toBe(20000);
  });

  it("wait fifteen seconds before a stopped tour starts again, less than a cold start", () => {
    expect(TOUR_RESUME_MS).toBe(15000);
    expect(TOUR_RESUME_MS).toBeLessThan(TOUR_IDLE_START_MS);
  });

  it("count a move, a press, a key, a touch and the wheel as input", () => {
    for (const name of [
      "pointermove",
      "pointerdown",
      "keydown",
      "touchstart",
      "wheel",
    ]) {
      expect(TOUR_ACTIVITY_EVENTS).toContain(name);
    }
  });
});

describe("a machine nobody has told anything", () => {
  it("is idle and starts no timer", () => {
    const tour = new TourMode();

    expect(tour.state).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the idle start", () => {
  it("arms on the first report and plays after twenty seconds of silence", () => {
    const { tour, changes, hops } = quietPage();

    expect(tour.state).toBe("armed");

    vi.advanceTimersByTime(TOUR_IDLE_START_MS - 1);
    expect(tour.state).toBe("armed");
    expect(hops).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(tour.state).toBe("playing");
    expect(changes).toEqual([
      ["armed", "idle"],
      ["playing", "armed"],
    ]);
    // The first hop is made at the start, and says so.
    expect(hops).toEqual([true]);
  });

  it("starts the wait over on activity", () => {
    const { tour } = quietPage();

    vi.advanceTimersByTime(TOUR_IDLE_START_MS - 1000);
    tour.activity();
    vi.advanceTimersByTime(TOUR_IDLE_START_MS - 1);
    expect(tour.state).toBe("armed");

    vi.advanceTimersByTime(1);
    expect(tour.state).toBe("playing");
  });

  it("keeps resetting for as long as there is input", () => {
    const { tour, hops } = quietPage();

    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(TOUR_IDLE_START_MS / 2);
      tour.activity();
    }

    expect(tour.state).toBe("armed");
    expect(hops).toEqual([]);
  });

  it("does not run while a drawer or dialog is open, and waits afresh when it closes", () => {
    const { tour } = quietPage({ overlayOpen: true });

    expect(tour.state).toBe("idle");
    vi.advanceTimersByTime(TOUR_IDLE_START_MS * 3);
    expect(tour.state).toBe("idle");

    tour.setConditions({ overlayOpen: false });
    expect(tour.state).toBe("armed");
    vi.advanceTimersByTime(TOUR_IDLE_START_MS - 1);
    expect(tour.state).toBe("armed");
    vi.advanceTimersByTime(1);
    expect(tour.state).toBe("playing");
  });

  it("is cancelled by opening a drawer part way", () => {
    const { tour } = quietPage();

    vi.advanceTimersByTime(TOUR_IDLE_START_MS - 1000);
    tour.setConditions({ overlayOpen: true });
    expect(tour.state).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(TOUR_IDLE_START_MS * 2);
    expect(tour.state).toBe("idle");
  });

  it.each([
    ["a text field has focus", { inputFocused: true }],
    ["the tab is hidden", { tabHidden: true }],
    ["the window has no focus", { windowFocused: false }],
  ])("does not run while %s", (_name, blocked) => {
    const { tour, hops } = quietPage(blocked);

    expect(tour.state).toBe("idle");
    vi.advanceTimersByTime(TOUR_IDLE_START_MS * 3);
    expect(tour.state).toBe("idle");
    expect(hops).toEqual([]);
  });

  it("counts only on the page with focus: losing it stops the wait, regaining it restarts it", () => {
    const { tour } = quietPage();

    vi.advanceTimersByTime(TOUR_IDLE_START_MS - 1000);
    tour.setConditions({ windowFocused: false });
    vi.advanceTimersByTime(TOUR_IDLE_START_MS * 2);
    expect(tour.state).toBe("idle");

    tour.setConditions({ windowFocused: true });
    vi.advanceTimersByTime(TOUR_IDLE_START_MS - 1);
    expect(tour.state).toBe("armed");
    vi.advanceTimersByTime(1);
    expect(tour.state).toBe("playing");
  });

  it("does not restart the wait for a report that changes nothing", () => {
    const { tour } = quietPage();

    vi.advanceTimersByTime(TOUR_IDLE_START_MS - 1);
    tour.setConditions({ windowFocused: true, settled: true });
    vi.advanceTimersByTime(1);

    expect(tour.state).toBe("playing");
  });

  it("waits for a render in flight to settle", () => {
    const { tour, hops } = quietPage({ settled: false });

    vi.advanceTimersByTime(TOUR_IDLE_START_MS * 5);
    expect(tour.state).toBe("armed");
    expect(hops).toEqual([]);

    tour.setConditions({ settled: true });
    expect(tour.state).toBe("playing");
    expect(hops).toEqual([true]);
  });

  it("forgets a wait that ran out during a render if input comes before it settles", () => {
    const { tour } = quietPage({ settled: false });

    vi.advanceTimersByTime(TOUR_IDLE_START_MS);
    tour.activity();
    tour.setConditions({ settled: true });
    expect(tour.state).toBe("armed");

    vi.advanceTimersByTime(TOUR_IDLE_START_MS);
    expect(tour.state).toBe("playing");
  });

  it("does not start over a hidden tab whose wait ran out", () => {
    const { tour } = quietPage({ settled: false });

    vi.advanceTimersByTime(TOUR_IDLE_START_MS);
    tour.setConditions({ tabHidden: true });
    tour.setConditions({ settled: true });
    expect(tour.state).toBe("idle");

    tour.setConditions({ tabHidden: false });
    expect(tour.state).toBe("armed");
  });
});

describe("a start that is asked for", () => {
  it("is made at once by buttonStart", () => {
    const { tour, hops } = quietPage();

    expect(tour.buttonStart()).toBe(true);
    expect(tour.state).toBe("playing");
    expect(hops).toEqual([true]);
    // The idle wait is not left running behind it.
    expect(vi.getTimerCount()).toBe(1);
  });

  it("is made at once by hashTour", () => {
    const { tour, hops } = quietPage();

    expect(tour.hashTour()).toBe(true);
    expect(tour.state).toBe("playing");
    expect(hops).toEqual([true]);
  });

  it("is made at once from idle too", () => {
    const { tour } = quietPage({ windowFocused: false });
    expect(tour.state).toBe("idle");

    // An ask does not need the window to have focus: it is the ask.
    expect(tour.buttonStart()).toBe(true);
    expect(tour.state).toBe("playing");
  });

  it.each([
    ["buttonStart", (tour: TourMode) => tour.buttonStart()],
    ["hashTour", (tour: TourMode) => tour.hashTour()],
  ])("is refused by %s while a drawer or dialog is open", (_name, ask) => {
    const { tour, hops } = quietPage({ overlayOpen: true });

    expect(ask(tour)).toBe(false);
    expect(tour.state).toBe("idle");
    expect(hops).toEqual([]);
  });

  it("is refused while a text field has focus", () => {
    const { tour } = quietPage({ inputFocused: true });

    expect(tour.buttonStart()).toBe(false);
    expect(tour.hashTour()).toBe(false);
    expect(tour.state).toBe("idle");
  });

  it("is refused while a tour is already playing", () => {
    const { tour, hops } = quietPage();

    tour.buttonStart();
    expect(tour.hashTour()).toBe(false);
    expect(hops).toEqual([true]);
  });

  it("waits for the render to settle", () => {
    const { tour, hops } = quietPage({ settled: false });

    expect(tour.hashTour()).toBe(true);
    expect(tour.state).toBe("armed");
    expect(hops).toEqual([]);

    // Not even a long wait starts it over a render in flight.
    vi.advanceTimersByTime(TOUR_IDLE_START_MS * 5);
    expect(tour.state).toBe("armed");

    tour.setConditions({ settled: true });
    expect(tour.state).toBe("playing");
    expect(hops).toEqual([true]);
  });

  it("waits for a hidden tab to be seen", () => {
    const { tour, hops } = quietPage({ tabHidden: true });

    expect(tour.hashTour()).toBe(true);
    expect(tour.state).toBe("armed");
    expect(hops).toEqual([]);

    tour.setConditions({ tabHidden: false });
    expect(tour.state).toBe("playing");
    expect(hops).toEqual([true]);
  });

  it("survives input while it waits: it was asked for", () => {
    const { tour } = quietPage({ settled: false });

    tour.hashTour();
    tour.activity();
    tour.setConditions({ settled: true });

    expect(tour.state).toBe("playing");
  });

  it("is withdrawn by opening a drawer while it waits", () => {
    const { tour } = quietPage({ settled: false });

    tour.hashTour();
    tour.setConditions({ overlayOpen: true });
    expect(tour.state).toBe("idle");

    tour.setConditions({ overlayOpen: false, settled: true });
    expect(tour.state).toBe("armed");
  });

  it("is withdrawn by stop()", () => {
    const { tour } = quietPage({ settled: false });

    tour.hashTour();
    tour.stop();
    tour.setConditions({ settled: true });

    expect(tour.state).toBe("armed");
  });
});

describe("a tour that is playing", () => {
  it("hops again every dwell, after the settle", () => {
    const { tour, hops } = quietPage();
    tour.buttonStart();

    vi.advanceTimersByTime(TOUR_DWELL_MS - 1);
    expect(hops).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(hops).toEqual([true, false]);
    vi.advanceTimersByTime(TOUR_DWELL_MS);
    expect(hops).toEqual([true, false, false]);
  });

  it("lingers about eight seconds on a place", () => {
    expect(TOUR_DWELL_MS).toBe(8000);
  });

  it("starts the dwell from the settle, not from the hop", () => {
    const { tour, hops } = quietPage();
    tour.buttonStart();

    // The hop's render starts: nothing is counted while it runs, however long.
    tour.setConditions({ settled: false });
    vi.advanceTimersByTime(TOUR_DWELL_MS * 10);
    expect(hops).toEqual([true]);

    tour.setConditions({ settled: true });
    vi.advanceTimersByTime(TOUR_DWELL_MS - 1);
    expect(hops).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(hops).toEqual([true, false]);
  });

  it("keeps hopping when a hop causes no render", () => {
    const { tour, hops } = quietPage();
    tour.buttonStart();

    // The page never reports a render, as when a hop lands on the view it is on.
    vi.advanceTimersByTime(TOUR_DWELL_MS * 4);
    expect(hops).toHaveLength(5);
    expect(tour.state).toBe("playing");
  });

  it("does not hop in a hidden tab, and starts a full dwell when it is seen", () => {
    const { tour, hops } = quietPage();
    tour.buttonStart();

    vi.advanceTimersByTime(TOUR_DWELL_MS - 1);
    tour.setConditions({ tabHidden: true });
    vi.advanceTimersByTime(TOUR_DWELL_MS * 5);
    expect(hops).toEqual([true]);
    expect(tour.state).toBe("playing");

    tour.setConditions({ tabHidden: false });
    vi.advanceTimersByTime(TOUR_DWELL_MS - 1);
    expect(hops).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(hops).toEqual([true, false]);
  });

  it("keeps playing when the window loses focus", () => {
    const { tour, hops } = quietPage();
    tour.buttonStart();

    tour.setConditions({ windowFocused: false });
    vi.advanceTimersByTime(TOUR_DWELL_MS);

    expect(tour.state).toBe("playing");
    expect(hops).toHaveLength(2);
  });

  it("is stopped by activity, at once, with no hop after it", () => {
    const { tour, changes, hops } = quietPage();
    tour.buttonStart();
    changes.length = 0;

    vi.advanceTimersByTime(TOUR_DWELL_MS - 1);
    tour.activity();

    expect(tour.state).toBe("stopped");
    expect(changes).toEqual([["stopped", "playing"]]);
    // Long enough for two dwells, short of the wait for the next tour.
    vi.advanceTimersByTime(TOUR_RESUME_MS - 1);
    expect(hops).toEqual([true]);
  });

  it("is stopped by stop()", () => {
    const { tour } = quietPage();
    tour.hashTour();

    tour.stop();
    expect(tour.state).toBe("stopped");
  });

  it("gives way to a drawer, a dialog or a field taking the user's attention", () => {
    for (const patch of [{ overlayOpen: true }, { inputFocused: true }]) {
      const { tour } = quietPage();
      tour.buttonStart();

      tour.setConditions(patch);

      // Not `stopped`: the page is not somewhere a tour starts by itself now.
      expect(tour.state).toBe("idle");
    }
  });

  it("has nothing left running once stopped but the next idle wait", () => {
    const { tour } = quietPage();
    tour.buttonStart();
    tour.activity();

    expect(vi.getTimerCount()).toBe(1);
    tour.activity();
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("after a tour is stopped", () => {
  it("plays another after fifteen more seconds of silence", () => {
    const { tour, hops } = quietPage();
    tour.buttonStart();
    tour.activity();
    expect(tour.state).toBe("stopped");

    vi.advanceTimersByTime(TOUR_RESUME_MS - 1);
    expect(tour.state).toBe("stopped");
    vi.advanceTimersByTime(1);

    expect(tour.state).toBe("playing");
    expect(hops).toEqual([true, true]);
  });

  it("restarts the wait on activity, as armed does, at fifteen seconds", () => {
    const { tour } = quietPage();
    tour.buttonStart();
    tour.activity();

    vi.advanceTimersByTime(TOUR_RESUME_MS - 1);
    tour.activity();
    vi.advanceTimersByTime(TOUR_RESUME_MS - 1);
    expect(tour.state).toBe("stopped");
    vi.advanceTimersByTime(1);
    expect(tour.state).toBe("playing");
  });

  it("waits the full twenty seconds on a page no tour has played on", () => {
    const { tour } = quietPage();
    expect(tour.state).toBe("armed");

    vi.advanceTimersByTime(TOUR_RESUME_MS);
    expect(tour.state).toBe("armed");
    vi.advanceTimersByTime(TOUR_IDLE_START_MS - TOUR_RESUME_MS - 1);
    expect(tour.state).toBe("armed");
    vi.advanceTimersByTime(1);
    expect(tour.state).toBe("playing");
  });

  it("waits fifteen seconds once the page can start one again after a stop", () => {
    const { tour } = quietPage();
    tour.buttonStart();
    tour.setConditions({ windowFocused: false });
    tour.activity();
    tour.setConditions({ windowFocused: true });
    expect(tour.state).toBe("stopped");

    vi.advanceTimersByTime(TOUR_RESUME_MS);
    expect(tour.state).toBe("playing");
  });

  it("still refuses to start over a drawer, whatever the wait", () => {
    const { tour } = quietPage();
    tour.buttonStart();
    tour.activity();
    tour.setConditions({ overlayOpen: true });

    vi.advanceTimersByTime(TOUR_RESUME_MS * 3);
    expect(tour.state).toBe("idle");
  });

  it("does not wait to start a tour on a page where one may not start by itself", () => {
    const { tour } = quietPage();
    tour.buttonStart();
    tour.setConditions({ windowFocused: false });
    tour.activity();

    expect(tour.state).toBe("idle");
    vi.advanceTimersByTime(TOUR_IDLE_START_MS * 3);
    expect(tour.state).toBe("idle");

    tour.setConditions({ windowFocused: true });
    expect(tour.state).toBe("stopped");
  });

  it("starts at once again on an ask", () => {
    const { tour, hops } = quietPage();
    tour.buttonStart();
    tour.activity();

    expect(tour.buttonStart()).toBe(true);
    expect(tour.state).toBe("playing");
    expect(hops).toEqual([true, true]);
  });
});

describe("dispose", () => {
  it("stops every timer", () => {
    const { tour, hops } = quietPage();
    tour.buttonStart();

    tour.dispose();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(TOUR_IDLE_START_MS * 3);
    expect(hops).toEqual([true]);
  });

  it("lets the next report start the wait again", () => {
    const { tour } = quietPage();
    tour.dispose();
    expect(tour.state).toBe("idle");

    tour.setConditions({ windowFocused: true });
    expect(tour.state).toBe("armed");
    vi.advanceTimersByTime(TOUR_IDLE_START_MS);
    expect(tour.state).toBe("playing");
  });

  it("keeps a start that was asked for", () => {
    const { tour } = quietPage({ settled: false });
    tour.hashTour();
    tour.dispose();

    tour.setConditions({ settled: true });
    expect(tour.state).toBe("playing");
  });
});

describe("isTextEntry", () => {
  it("is true for the elements a user types into", () => {
    for (const tag of ["INPUT", "SELECT", "TEXTAREA"]) {
      expect(isTextEntry(tag, false)).toBe(true);
    }
    expect(isTextEntry("DIV", true)).toBe(true);
  });

  it("is false for everything else", () => {
    for (const tag of ["", "BODY", "CANVAS", "BUTTON", "A", "DIALOG"]) {
      expect(isTextEntry(tag, false)).toBe(false);
    }
  });
});

describe("pointerMoved", () => {
  it("counts the first move and any change of place", () => {
    expect(pointerMoved(null, 10, 20)).toBe(true);
    expect(pointerMoved({ x: 10, y: 20 }, 11, 20)).toBe(true);
    expect(pointerMoved({ x: 10, y: 20 }, 10, 21)).toBe(true);
  });

  it("does not count a move event at the place the pointer already was", () => {
    expect(pointerMoved({ x: 10, y: 20 }, 10, 20)).toBe(false);
  });
});
