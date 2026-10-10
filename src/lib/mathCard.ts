/**
 * The Math card's pure parts: the view's numbers as text, how often they
 * refresh, and what the card remembers: shown or hidden, collapsed or expanded.
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

/** The localStorage key for the card's remembered choices; the suffix is the format's version. */
export const MATH_CARD_STORAGE_KEY = "fractals.mathCard.v1";

/** fr-1tk kept only "expanded", in sessionStorage, under this key. Read once, never written. */
export const LEGACY_EXPANDED_KEY = "fractals.mathCard.expanded";

/** The part of `Storage` the card uses, so a test can hand in a fake. */
export type MathCardStorage = Pick<Storage, "getItem" | "setItem">;

/** What the card remembers: whether it is shown at all, and how much of it. */
export interface MathCardState {
  /** The card is on the picture; the Math button is pressed. */
  open: boolean;
  /** The card shows the view's numbers and the blurb, not just its one line. */
  expanded: boolean;
}

/** A first visit: the card shown, collapsed to its one line. */
export const DEFAULT_MATH_CARD_STATE: Readonly<MathCardState> = Object.freeze({
  open: true,
  expanded: false,
});

/**
 * A stored value read as a state.
 *
 * The value is JSON, `{"v":1,"open":true,"expanded":false}`. Each field is
 * judged on its own and a field that is missing or not a boolean keeps its
 * default, so a hand-edited or half-written value costs only what it got wrong.
 * @param raw - What `getItem` returned
 * @returns The state, or null when the text is not a version-1 object at all
 */
export function parseMathCardState(raw: string | null): MathCardState | null {
  if (raw === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const fields = value as Record<string, unknown>;
  if (fields.v !== 1) return null;

  return {
    open:
      typeof fields.open === "boolean"
        ? fields.open
        : DEFAULT_MATH_CARD_STATE.open,
    expanded:
      typeof fields.expanded === "boolean"
        ? fields.expanded
        : DEFAULT_MATH_CARD_STATE.expanded,
  };
}

/**
 * What the card was left as.
 *
 * The versioned key wins. Without one, fr-1tk's session value ("1" or "0",
 * only for expanded) is read so a choice made before this landed is not lost;
 * everything else is the default. A storage that is missing or throws (private
 * windows, blocked site data) is the default too.
 * @param local - localStorage, or a stand-in; undefined when the browser has none
 * @param legacySession - sessionStorage, or a stand-in, for the old key
 * @returns A fresh state, never the shared default object
 */
export function loadMathCardState(
  local: MathCardStorage | undefined,
  legacySession?: MathCardStorage,
): MathCardState {
  try {
    const stored = parseMathCardState(
      local?.getItem(MATH_CARD_STORAGE_KEY) ?? null,
    );
    if (stored) return stored;
  } catch {
    // Fall through to the old key and then the default.
  }

  try {
    const legacy = legacySession?.getItem(LEGACY_EXPANDED_KEY);
    if (legacy === "1" || legacy === "0") {
      return { ...DEFAULT_MATH_CARD_STATE, expanded: legacy === "1" };
    }
  } catch {
    // Nothing readable: the default.
  }

  return { ...DEFAULT_MATH_CARD_STATE };
}

/**
 * Remember the card's state. A storage that is missing or throws is ignored:
 * the choice then lasts as long as the page does.
 * @param local - localStorage, or a stand-in
 * @param state - The choices to keep
 */
export function saveMathCardState(
  local: MathCardStorage | undefined,
  state: MathCardState,
): void {
  try {
    local?.setItem(
      MATH_CARD_STORAGE_KEY,
      JSON.stringify({ v: 1, open: state.open, expanded: state.expanded }),
    );
  } catch {
    // Nothing to do: the card still works, it just forgets on reload.
  }
}

// The store `useSyncExternalStore` reads. The state is loaded once and held in
// memory, so a toggle works in a browser whose storage refuses the write and
// the snapshot's identity is stable between changes.
let current: MathCardState | null = null;
const listeners = new Set<() => void>();

function browserStorage(
  name: "localStorage" | "sessionStorage",
): MathCardStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window[name];
  } catch {
    // Merely reaching a storage can throw when site data is blocked.
    return undefined;
  }
}

/** Subscribe to the state changing; returns the unsubscribe. */
export function subscribeToMathCard(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The state now: this page's own last change, else what storage holds. */
export function getMathCardSnapshot(): MathCardState {
  current ??= loadMathCardState(
    browserStorage("localStorage"),
    browserStorage("sessionStorage"),
  );
  return current;
}

/** The state on the server, where nothing has been kept: the default. */
export function getServerMathCardSnapshot(): MathCardState {
  return DEFAULT_MATH_CARD_STATE;
}

function changeMathCardState(change: Partial<MathCardState>): void {
  const before = getMathCardSnapshot();
  const next = { ...before, ...change };
  if (next.open === before.open && next.expanded === before.expanded) return;

  current = next;
  saveMathCardState(browserStorage("localStorage"), next);
  listeners.forEach((listener) => listener());
}

/** Show or hide the card, keeping whether it is expanded. */
export function setMathCardOpen(open: boolean): void {
  changeMathCardState({ open });
}

/** Expand or collapse the card, keeping whether it is shown. */
export function setMathCardExpanded(expanded: boolean): void {
  changeMathCardState({ expanded });
}

/** Forget what this page loaded or changed. For tests, which share the module. */
export function resetMathCardMemory(): void {
  current = null;
}
