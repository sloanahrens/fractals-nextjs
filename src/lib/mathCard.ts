/**
 * The Math card's pure parts: the view's numbers as text, how often they
 * refresh, and the card's collapsed-or-expanded choice.
 *
 * `MathCard.tsx` draws; everything it decides is here so a Node suite can drive
 * it. The rule and the setting come from `fractalMath.ts`, the place the view
 * is on from `placeAtView` in `places.ts`.
 */

import type { ColorScheme } from "../types/fractal";
import { getAvailableColorSchemes } from "./colorMapping";
import { formatComplex } from "./fractalMath";
import { BASE_WIDTH } from "./mandelbrot";
import { formatZoom } from "./presets";
import { LINK_WRITE_INTERVAL_MS, linkWriteDelayMs } from "./viewLinkState";
import { formatCoordinate } from "./zoomScale";

/** The view the card reports: what the renderer is drawing, and how. */
export interface MathCardView {
  centerX: number;
  centerY: number;
  zoom: number;
  /** The iteration cap in use: Auto's result when Auto is on. */
  iterations: number;
  /** Whether Auto chose {@link MathCardView.iterations}. */
  autoIterations: boolean;
  colorScheme: ColorScheme;
}

/** The view's numbers, each ready to print. */
export interface MathCardNumbers {
  /** The centre as a + bi. */
  centre: string;
  /** How wide the view is in the plane. */
  width: string;
  /** Magnification, "400x". */
  zoom: string;
  /** The iteration cap, with "(Auto)" when Auto chose it. */
  iterations: string;
  /** The colour scheme's name as Settings shows it. */
  scheme: string;
}

/**
 * The view's numbers as the card prints them.
 *
 * The centre goes through `formatComplex` and the zoom through `formatZoom`,
 * the helpers the Coordinates read-out and the Zoom Level slider already use,
 * so the card and the Settings drawer never disagree about the same view. The
 * width is the view's extent along the real axis: the base frame
 * (`BASE_WIDTH`, 4) over the zoom.
 * @param view - The view on screen
 * @returns One string per row of the card
 */
export function formatViewNumbers(view: MathCardView): MathCardNumbers {
  return {
    centre: formatComplex(view.centerX, view.centerY),
    width: formatCoordinate(BASE_WIDTH / view.zoom),
    zoom: `${formatZoom(view.zoom)}x`,
    iterations: `${view.iterations}${view.autoIterations ? " (Auto)" : ""}`,
    scheme:
      getAvailableColorSchemes().find((s) => s.value === view.colorScheme)
        ?.label ?? view.colorScheme,
  };
}

/**
 * How often the card's numbers refresh while the view moves: the link
 * writer's cadence, so a drag or a wheel burst redraws a few lines twice a
 * second instead of on every step.
 */
export const MATH_CARD_UPDATE_MS = LINK_WRITE_INTERVAL_MS;

/**
 * How long to wait before showing the next numbers.
 * @param nowMs - The current time
 * @param lastShownMs - When the card last took numbers; any time far in the past for the first
 * @returns Milliseconds to wait, zero once the interval is out
 */
export function mathCardDelayMs(nowMs: number, lastShownMs: number): number {
  return linkWriteDelayMs(nowMs, lastShownMs);
}

/** The sessionStorage key for whether the card is expanded. */
export const MATH_CARD_STORAGE_KEY = "fractals.mathCard.expanded";

/** The part of `Storage` the card uses, so a test can hand in a fake. */
export type MathCardStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Whether the card was left expanded this session.
 * @param storage - sessionStorage, or a stand-in; undefined when the browser has none
 * @returns True only for a stored "1"; false for anything else, including a storage that throws
 */
export function readExpanded(storage: MathCardStorage | undefined): boolean {
  try {
    return storage?.getItem(MATH_CARD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Remember whether the card is expanded. A storage that is missing or throws
 * (private windows, blocked site data) is ignored: the choice then lasts as
 * long as the page does.
 * @param storage - sessionStorage, or a stand-in
 * @param expanded - The choice to keep
 */
export function writeExpanded(
  storage: MathCardStorage | undefined,
  expanded: boolean,
): void {
  try {
    storage?.setItem(MATH_CARD_STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    // Nothing to do: the card still works, it just forgets on reload.
  }
}

// The store `useSyncExternalStore` reads. The choice is also held in memory,
// so a toggle works in a browser whose storage refuses the write, and the
// snapshot is a boolean, so its identity is stable between changes.
let remembered: boolean | null = null;
const listeners = new Set<() => void>();

function sessionStore(): MathCardStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    // Merely reaching sessionStorage can throw when site data is blocked.
    return undefined;
  }
}

/** Subscribe to the choice changing; returns the unsubscribe. */
export function subscribeToExpanded(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The choice now: this page's own last change, else the session's. */
export function getExpandedSnapshot(): boolean {
  return remembered ?? readExpanded(sessionStore());
}

/** The choice on the server, where nothing has been kept: collapsed. */
export function getServerExpandedSnapshot(): boolean {
  return false;
}

/** Keep the choice for the session and tell the card. */
export function setExpanded(expanded: boolean): void {
  remembered = expanded;
  writeExpanded(sessionStore(), expanded);
  listeners.forEach((listener) => listener());
}

/** Forget this page's own choice. For tests, which share the module. */
export function resetExpandedMemory(): void {
  remembered = null;
}
