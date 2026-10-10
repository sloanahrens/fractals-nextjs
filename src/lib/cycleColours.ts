/**
 * Cycling the palette: the calm animation that only recolours.
 *
 * A picture's colours are its iteration counts put through a colour scheme,
 * and a count does not change when the palette moves — which is the whole of
 * what `recolour` is for (`fractalRenderer.ts`, fr-di8). Cycling is that one
 * step asked for over and over: the palette's Shift walks round a turn, a
 * little further every frame, and the picture is repainted from the counts the
 * last full render left. No orbit is computed, so the animation costs the same
 * however deep the view is, and it can never start a render of its own.
 *
 * This module is the arithmetic and the decisions, kept out of the page so a
 * Node suite can drive them: where the palette is a given time after it
 * started ({@link cycleShift}), whether enough time has passed for another
 * repaint ({@link shouldPaint}), and whether anything about the page says the
 * animation must hold ({@link cyclePaused}). The clock, the frame request and
 * the repaint itself are the page's.
 *
 * The shift is read the way the mapping reads it — a distance round a loop, so
 * a whole turn is none — and {@link normalizeShift} is where that is decided,
 * the same one place the controls and the link codec ask.
 */
import { normalizeShift } from "./paletteControls";

/** The speeds the Speed select offers, by the id the page holds. */
export type CycleSpeedId = "slow" | "medium" | "fast";

/** One of the speeds the Speed select offers. */
export interface CycleSpeed {
  id: CycleSpeedId;
  /** What the select says, the loop length included. */
  label: string;
  /** How long a whole turn of the palette takes, in milliseconds. */
  loopMs: number;
}

/**
 * The speeds offered, slowest first.
 *
 * A loop of a minute is the default because the point of the feature is a
 * wallpaper that moves too slowly to watch and not at all to wait for; the
 * faster two are for a visitor who wants to see what the animation does.
 */
export const CYCLE_SPEEDS: CycleSpeed[] = [
  { id: "slow", label: "Slow (60 s per loop)", loopMs: 60_000 },
  { id: "medium", label: "Medium (25 s per loop)", loopMs: 25_000 },
  { id: "fast", label: "Fast (10 s per loop)", loopMs: 10_000 },
];

/** The speed a visit starts on. */
export const DEFAULT_CYCLE_SPEED: CycleSpeedId = "slow";

/**
 * A speed by its id, falling back to the slowest for an id this build does not
 * know — the rule `exportShapeFor` and `resolveFractalKind` follow, so a value
 * from outside can never leave the select with nothing selected.
 *
 * @param id - A speed id from anywhere: the select, storage, a test
 * @returns The speed it names, or the default
 */
export function cycleSpeedFor(id: string): CycleSpeed {
  return CYCLE_SPEEDS.find((speed) => speed.id === id) ?? CYCLE_SPEEDS[0];
}

/**
 * The least time between two repaints: twenty a second.
 *
 * A frame request arrives about sixty times a second, and a repaint of a large
 * canvas is tens of milliseconds — so without this the browser would be asked
 * for work it cannot finish in the time it arrives, on a picture that is meant
 * to be calm. Skipping the frames in between loses nothing: the palette is
 * advanced by elapsed time and not by frames, so it arrives at the same place
 * at the same moment and only the picture moves choppier.
 */
export const CYCLE_MIN_PAINT_GAP_MS = 50;

/**
 * Where the palette has reached, having started at `startShift` and run for
 * `elapsedMs` at a loop of `loopMs`.
 *
 * Advanced by elapsed time rather than by frames, so a slow device cycles at
 * the same speed as a fast one and only the picture is choppier. A whole turn
 * is the same as none — the palette is a loop — so the answer is always the
 * fraction of a turn to hold, in 0 up to (not including) 1.
 *
 * Nothing to advance by, or a loop that is not a length, leaves the palette
 * where it started: zero elapsed is where it was, and a negative elapsed is a
 * clock that ran backwards, which is not a distance round anything.
 *
 * @param startShift - Fraction of a turn the animation is working from
 * @param elapsedMs - Time since it was at that value, in milliseconds
 * @param loopMs - Time one whole turn of the palette takes, in milliseconds
 * @returns The fraction of a turn to hold, in 0 up to (not including) 1
 */
export function cycleShift(
  startShift: number,
  elapsedMs: number,
  loopMs: number,
): number {
  const start = normalizeShift(startShift);

  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return start;
  if (!Number.isFinite(loopMs) || loopMs <= 0) return start;

  const advanced = start + elapsedMs / loopMs;

  // Read modulo a turn by hand rather than with `%`, which keeps the sign of
  // its left operand: a negative fraction would otherwise come back negative
  // and reach the palette as a shift the other way round a loop the mapping
  // already reads unsigned.
  return advanced - Math.floor(advanced);
}

/**
 * Whether enough time has passed since the last repaint to make another.
 *
 * `last` is the time of the last repaint, or 0 before there has been one, so a
 * first frame always paints. A time that is not a number is never a moment to
 * paint from, and a gap that is not a number holds nothing back.
 *
 * @param now - The moment being considered, from the frame's own clock
 * @param last - When the palette was last repainted
 * @param minGapMs - The least time between two repaints
 * @returns True when the frame should repaint
 */
export function shouldPaint(
  now: number,
  last: number,
  minGapMs: number,
): boolean {
  if (!Number.isFinite(now) || !Number.isFinite(last)) return false;
  if (!Number.isFinite(minGapMs)) return true;

  return now - last >= minGapMs;
}

/** What the page knows about itself, as the animation's hold rules read it. */
export interface CycleConditions {
  /** The tab is not on screen: nobody is watching, and timers are throttled. */
  tabHidden: boolean;
  /** A render is in flight, so the counts a repaint needs have been dropped. */
  rendering: boolean;
  /** A pointer is mid-gesture on the picture — a drag, a pinch or a wheel. */
  gesturing: boolean;
  /** The Shift slider is being dragged: the palette is the visitor's. */
  draggingShift: boolean;
  /** The Help overlay is up, over the picture. */
  helpOpen: boolean;
  /** A Tour is playing, with a crossfade of its own over the picture. */
  tourPlaying: boolean;
  /** The reader has asked for less motion. */
  reducedMotion: boolean;
}

/**
 * Whether the animation must hold where it is.
 *
 * Every one of these is a moment at which moving the palette would be wrong
 * rather than merely unseen: a background tab has nobody watching it and a
 * browser throttles its frames anyway; a render in flight has dropped the
 * counts there is nothing to repaint from; a gesture or a dragged slider is
 * the visitor moving the view or the palette themselves, and two things
 * painting the same canvas fight; the Help overlay is over the picture; a Tour
 * is flying a crossfade of its own; and a reader who has asked for less motion
 * has asked for this most of all.
 *
 * The hold is a pause and not a stop: the page keeps the palette where it is
 * and resumes from there, so a tour, a deep render or a trip to another tab
 * costs the visitor no part of the loop.
 *
 * @param conditions - The page's own state, as the caller reads it
 * @returns True when the animation must not advance
 */
export function cyclePaused(conditions: CycleConditions): boolean {
  return (
    conditions.tabHidden ||
    conditions.rendering ||
    conditions.gesturing ||
    conditions.draggingShift ||
    conditions.helpOpen ||
    conditions.tourPlaying ||
    conditions.reducedMotion
  );
}
