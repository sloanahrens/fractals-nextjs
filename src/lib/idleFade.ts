/**
 * How long the chrome — every control over the picture — waits after the last
 * input before it fades out.
 */
export const CHROME_IDLE_MS = 3000;

/** How long the fade itself takes; the page's transition uses the same figure. */
export const CHROME_FADE_MS = 300;

/**
 * The attribute every control over the picture carries on its outermost
 * element, and the selector for it. The stylesheet fades what has it, and the
 * focus hold looks for it to tell a control from the canvas.
 */
export const CHROME_ATTRIBUTE = "data-chrome";
export const CHROME_SELECTOR = `[${CHROME_ATTRIBUTE}]`;

/**
 * The window events that count as someone being there: the pointer moving or
 * pressing, a key, a touch. The page listens to each on the window, so input
 * anywhere brings the chrome back.
 */
export const CHROME_ACTIVITY_EVENTS = [
  "pointermove",
  "pointerdown",
  "keydown",
  "touchstart",
] as const;

/** What can keep the chrome up, as the page knows them. */
export interface ChromeHolds {
  /** The Settings drawer is open. */
  settingsOpen: boolean;
  /** The Help dialog is open. */
  helpOpen: boolean;
  /** A keyboard user's focus is on a control over the picture. */
  focusWithin: boolean;
  /** The Look menu is open. */
  lookMenuOpen: boolean;
  /** The Math card is showing and expanded. */
  mathExpanded: boolean;
  /** The Auto-wander nudge is showing, so a new visitor can read it. */
  nudgeShown: boolean;
}

/** Whether any reason to keep the chrome up holds, whatever the clock says. */
export function chromeHeld(holds: ChromeHolds): boolean {
  return (
    holds.settingsOpen ||
    holds.helpOpen ||
    holds.focusWithin ||
    holds.lookMenuOpen ||
    holds.mathExpanded ||
    holds.nudgeShown
  );
}

/**
 * The timer pair the countdown schedules on. Injected, like the walk's, so a
 * test can hand it a clock it drives by hand; the default is the global pair.
 */
export interface IdleTimers {
  setTimeout: (callback: () => void, milliseconds: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface IdleFadeOptions {
  /** Called with `false` when the idle wait runs out and `true` when input returns. */
  onChange: (visible: boolean) => void;
  /**
   * Whether the chrome must stay up whatever the clock says (`chromeHeld`). A
   * held clock never starts a countdown.
   */
  held?: boolean;
  idleMs?: number;
  timers?: IdleTimers;
}

export interface IdleFade {
  /** Input happened: the chrome is visible, and the wait starts over. */
  activity: () => void;
  /** Stop the countdown. Call it when the owner goes away. */
  dispose: () => void;
}

/**
 * The page's idle clock: visible while there is input, gone after
 * `CHROME_IDLE_MS` without any.
 *
 * It starts in the visible state with the wait already running, since a page
 * that has just loaded has had no input yet and the controls should be seen
 * before they go. Each `activity()` reports visible and restarts the wait; when
 * the wait runs out it reports hidden once. A held clock keeps no timer at all,
 * so nothing can fade the chrome while the drawer is open however long it stays
 * there; the owner makes a new clock when the hold ends, which is what gives
 * the chrome its full wait after the drawer closes.
 *
 * `onChange` is told only about changes, so an owner that sets state from it
 * is not re-rendered by every pointer move.
 */
export function createIdleFade({
  onChange,
  held = false,
  idleMs = CHROME_IDLE_MS,
  timers = {
    setTimeout: (callback, milliseconds) =>
      globalThis.setTimeout(callback, milliseconds),
    clearTimeout: (handle) =>
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
}: IdleFadeOptions): IdleFade {
  let visible = true;
  let timer: unknown = null;

  const stop = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };

  const start = () => {
    stop();
    if (held) return;

    timer = timers.setTimeout(() => {
      timer = null;
      visible = false;
      onChange(false);
    }, idleMs);
  };

  start();

  return {
    activity: () => {
      if (!visible) {
        visible = true;
        onChange(true);
      }
      start();
    },
    dispose: stop,
  };
}
