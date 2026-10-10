/**
 * Cycling the palette: the arithmetic and the hold rules, driven directly.
 *
 * That a repaint from kept counts is the picture a full render draws is
 * `FractalRenderer`'s own test's business, and that the page runs the clock on
 * frames is its panel test's. What is decided here is what this module owns:
 * where a shift started so long ago has reached, whether a frame is due
 * another repaint yet, and which conditions hold the animation where it is.
 */
import { describe, expect, it } from "vitest";

import {
  CYCLE_MIN_PAINT_GAP_MS,
  CYCLE_SPEEDS,
  DEFAULT_CYCLE_SPEED,
  cyclePaused,
  cycleShift,
  cycleSpeedFor,
  shouldPaint,
} from "../cycleColours";

describe("the speeds", () => {
  it("are slow, medium and fast, a whole turn each as the label says", () => {
    expect(CYCLE_SPEEDS.map((speed) => speed.id)).toEqual([
      "slow",
      "medium",
      "fast",
    ]);
    expect(CYCLE_SPEEDS.map((speed) => speed.loopMs)).toEqual([
      60_000, 25_000, 10_000,
    ]);

    for (const speed of CYCLE_SPEEDS) {
      expect(speed.label).toContain(`${speed.loopMs / 1000} s`);
      expect(cycleSpeedFor(speed.id)).toBe(speed);
    }
  });

  it("start on the slowest, and answer it for an id they do not know", () => {
    expect(DEFAULT_CYCLE_SPEED).toBe("slow");
    expect(cycleSpeedFor(DEFAULT_CYCLE_SPEED)).toBe(CYCLE_SPEEDS[0]);
    // A value from outside leaves the select on something, as `exportShapeFor`
    // does for a shape and `resolveFractalKind` for a fractal.
    expect(cycleSpeedFor("ludicrous")).toBe(CYCLE_SPEEDS[0]);
    expect(cycleSpeedFor("")).toBe(CYCLE_SPEEDS[0]);
  });
});

describe("where the palette has reached", () => {
  it("is where it started when no time has passed", () => {
    expect(cycleShift(0.25, 0, 60_000)).toBe(0.25);
    expect(cycleShift(0.25, -1000, 60_000)).toBe(0.25);
    expect(cycleShift(0, 0, 60_000)).toBe(0);
  });

  it("is where it started for a clock or a loop that is not a length", () => {
    expect(cycleShift(0.25, Number.NaN, 60_000)).toBe(0.25);
    expect(cycleShift(0.25, Number.POSITIVE_INFINITY, 60_000)).toBe(0.25);
    expect(cycleShift(0.25, 1000, 0)).toBe(0.25);
    expect(cycleShift(0.25, 1000, Number.NaN)).toBe(0.25);
    // A start that is not a number is no shift — the mapping's reading of it,
    // rather than a NaN handed back to the palette — and the time still counts
    // from there.
    expect(cycleShift(Number.NaN, 1_000, 60_000)).toBeCloseTo(1 / 60, 12);
  });

  it("advances by the fraction of a turn the time is worth", () => {
    // A tenth of a loop is a tenth of a turn.
    expect(cycleShift(0, 6_000, 60_000)).toBeCloseTo(0.1, 12);
    // Half a loop from halfway round arrives back where it started.
    expect(cycleShift(0.5, 12_500, 25_000)).toBeCloseTo(0, 12);
    expect(cycleShift(0.2, 2_000, 10_000)).toBeCloseTo(0.4, 12);
  });

  it("wraps round a whole turn and stays inside it", () => {
    // A whole loop comes back to where it started, exactly.
    expect(cycleShift(0.3, 60_000, 60_000)).toBeCloseTo(0.3, 12);
    expect(cycleShift(0.9, 20_000, 60_000)).toBeCloseTo(0.9 + 1 / 3 - 1, 12);
    expect(cycleShift(0, 150_000, 60_000)).toBeCloseTo(0.5, 12);

    for (const elapsed of [1, 999, 10_000, 60_000, 123_456, 10_000_000]) {
      const shift = cycleShift(0.8, elapsed, 25_000);
      expect(shift).toBeGreaterThanOrEqual(0);
      expect(shift).toBeLessThan(1);
    }
  });

  it("reads a start the way the mapping does, a whole turn being none", () => {
    // A shift is a distance round a loop, so a start of one is a start of none
    // and a negative start is the same distance the other way — the rule
    // `normalizeShift` owns and this defers to.
    expect(cycleShift(1, 0, 60_000)).toBe(0);
    expect(cycleShift(0.75, 0, 60_000)).toBe(0.75);
    expect(cycleShift(-0.25, 0, 60_000)).toBe(0.75);
  });

  it("carries on from where it is when asked for a longer step", () => {
    // Thirty frames of 20 ms are one step of 600 ms: elapsed time and not
    // frame count is what moves the palette, which is what makes a slow device
    // cycle at the same speed.
    const oneStep = cycleShift(0, 600, 60_000);

    let byFrames = 0;
    for (let frame = 0; frame < 30; frame++) {
      byFrames = cycleShift(byFrames, 20, 60_000);
    }

    expect(byFrames).toBeCloseTo(oneStep, 12);
  });
});

describe("whether a frame is due another repaint", () => {
  it("paints the first frame and then no sooner than the gap", () => {
    // Nothing has been painted yet, so the clock's own reading is not a time
    // to measure from.
    expect(shouldPaint(1_000, 0, CYCLE_MIN_PAINT_GAP_MS)).toBe(true);
    expect(shouldPaint(1_000, 1_000, CYCLE_MIN_PAINT_GAP_MS)).toBe(false);
    expect(shouldPaint(1_049, 1_000, CYCLE_MIN_PAINT_GAP_MS)).toBe(false);
    expect(shouldPaint(1_050, 1_000, CYCLE_MIN_PAINT_GAP_MS)).toBe(true);
    expect(shouldPaint(1_100, 1_000, CYCLE_MIN_PAINT_GAP_MS)).toBe(true);
  });

  it("is twenty a second at the page's own gap", () => {
    expect(CYCLE_MIN_PAINT_GAP_MS).toBe(50);
    expect(1_000 / CYCLE_MIN_PAINT_GAP_MS).toBe(20);
  });

  it("holds a frame with a time that is not a moment", () => {
    expect(shouldPaint(Number.NaN, 0, 50)).toBe(false);
    expect(shouldPaint(1_000, Number.NaN, 50)).toBe(false);
    // A gap that is not a length holds nothing back — there is no rule to keep.
    expect(shouldPaint(1_000, 1_000, Number.NaN)).toBe(true);
  });
});

describe("what holds the animation", () => {
  /** Every condition at rest, so one can be raised at a time. */
  const atRest = {
    tabHidden: false,
    rendering: false,
    gesturing: false,
    draggingShift: false,
    helpOpen: false,
    tourPlaying: false,
    reducedMotion: false,
  };

  it("runs when nothing says otherwise", () => {
    expect(cyclePaused(atRest)).toBe(false);
  });

  it("holds for each of them on its own", () => {
    for (const condition of Object.keys(atRest)) {
      expect(
        cyclePaused({ ...atRest, [condition]: true }),
        `${condition} should hold the animation`,
      ).toBe(true);
    }
  });

  it("holds for a combination, and for them all at once", () => {
    expect(cyclePaused({ ...atRest, tabHidden: true, rendering: true })).toBe(
      true,
    );
    expect(
      cyclePaused(
        Object.fromEntries(
          Object.keys(atRest).map((condition) => [condition, true]),
        ) as typeof atRest,
      ),
    ).toBe(true);
  });
});
