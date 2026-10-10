/**
 * The Auto-wander pill on the picture: what it says, where it sits, and when
 * it offers itself to a first-time visitor.
 *
 * Everything here is pure or takes its storage and clock as arguments, so the
 * Node suite drives it without a browser. `WanderControl.tsx` draws the pill and
 * `page.tsx` owns the one wander state it and the Settings checkbox share.
 */

/** The pill's accessible name, in both states; the visible words change. */
export const WANDER_CONTROL_NAME = "Auto-wander";

export interface WanderPillState {
  /** The walk is switched on. */
  on: boolean;
  /**
   * Whole seconds to the next step, or null when no countdown is running — the
   * controller reports null while a render is in flight or the tab is hidden.
   */
  countdown: number | null;
  /** A full render is in flight. The countdown is not shown while it is. */
  rendering: boolean;
}

export interface WanderPillLabel {
  /** The words on the pill. */
  text: string;
  /** `aria-pressed`: whether the walk is on. */
  pressed: boolean;
  /** `aria-label`, the same whether the walk is on or off. */
  name: string;
  /** Which glyph: play offers to start the walk, pause offers to stop it. */
  glyph: "play" | "pause";
}

/**
 * Off: a play glyph and "Auto-wander". On: a pause glyph and "Wandering", with
 * " · N s" after it only while a countdown is running and no render is in
 * flight — a render suspends the wait, and a number that is not counting down
 * would only mislead.
 */
export function wanderPillLabel({
  on,
  countdown,
  rendering,
}: WanderPillState): WanderPillLabel {
  if (!on) {
    return {
      text: WANDER_CONTROL_NAME,
      pressed: false,
      name: WANDER_CONTROL_NAME,
      glyph: "play",
    };
  }

  const counting =
    !rendering &&
    countdown !== null &&
    Number.isFinite(countdown) &&
    countdown >= 0;

  return {
    text: counting ? `Wandering · ${Math.ceil(countdown)} s` : "Wandering",
    pressed: true,
    name: WANDER_CONTROL_NAME,
    glyph: "pause",
  };
}

/**
 * The Nearby strip's widest row in pixels: six tiles and More at 96 px, six
 * gaps of 8, and the strip's 12 px padding either side (`NearbyStrip.tsx`).
 */
export const NEARBY_STRIP_MAX_WIDTH = 7 * 96 + 6 * 8 + 2 * 12;

/**
 * The widest the pill gets ("Wandering · 120 s") and the gap it keeps from the
 * strip and the picture's edge.
 */
export const WANDER_PILL_MAX_WIDTH = 176;
export const WANDER_PILL_GAP = 8;

export type WanderPlacement = "beside" | "above";

/**
 * Where the pill goes for a picture this many pixels wide. A picture wide
 * enough to hold the strip's longest row and the pill side by side puts the
 * pill in the bottom right corner, level with the tiles; a narrower one stacks
 * it above the strip's right end, so it is never over a tile. An unmeasured
 * width stacks, which is the placement that is clear whatever the width is.
 */
export function wanderPlacement(canvasWidth: number): WanderPlacement {
  if (!Number.isFinite(canvasWidth)) return "above";

  const needed =
    NEARBY_STRIP_MAX_WIDTH + WANDER_PILL_GAP + WANDER_PILL_MAX_WIDTH;
  return canvasWidth >= needed ? "beside" : "above";
}

/** localStorage key of the once-per-browser nudge. */
export const WANDER_NUDGE_STORAGE_KEY = "fractals:wander-nudge-seen";

/** How long the page is open, with nothing started, before the nudge. */
export const WANDER_NUDGE_AFTER_MS = 15000;

/** How long the tooltip stays if no press dismisses it first. */
export const WANDER_NUDGE_SHOW_MS = 6000;

/** The tooltip's one line. */
export const WANDER_NUDGE_TEXT = "Let it wander for you";

/** The part of `Storage` the nudge uses, so a test can hand in a broken one. */
export interface NudgeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Whether this browser has been nudged. A storage that is missing or throws
 * (private windows, blocked site data) reads as "not yet", so the page nudges
 * on every visit rather than never.
 */
export function readNudgeSeen(storage: NudgeStorage | null): boolean {
  if (storage === null) return false;

  try {
    return storage.getItem(WANDER_NUDGE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Remember the nudge was shown. A storage that throws is ignored. */
export function markNudgeSeen(storage: NudgeStorage | null): void {
  if (storage === null) return;

  try {
    storage.setItem(WANDER_NUDGE_STORAGE_KEY, "1");
  } catch {
    // The page works without storage; it just nudges again next visit.
  }
}

export interface NudgeConditions {
  /** Milliseconds since the page opened. */
  openForMs: number;
  /** Auto-wander has been on at some point this visit. */
  wanderUsed: boolean;
  /** A tour has started this visit. */
  tourStarted: boolean;
  /** Settings or Help is open, so the pill is not on screen. */
  overlayOpen: boolean;
  /** This browser has been nudged before. */
  seen: boolean;
}

/**
 * `show` — nudge now. `later` — not yet; ask again when something changes or
 * the time comes. `never` — not this visit, whatever happens next.
 *
 * A visitor who has found the walk or the tour on their own, or was nudged
 * before, is never nudged. An open drawer or Help only defers the nudge, since
 * the pill is hidden behind them.
 */
export function decideNudge({
  openForMs,
  wanderUsed,
  tourStarted,
  overlayOpen,
  seen,
}: NudgeConditions): "show" | "later" | "never" {
  if (seen || wanderUsed || tourStarted) return "never";
  if (!(openForMs >= WANDER_NUDGE_AFTER_MS)) return "later";
  if (overlayOpen) return "later";
  return "show";
}
