/** How long the top bar waits after the last input before it fades out. */
export const TOP_BAR_IDLE_MS = 2000;

/** How long the fade itself takes; the bar's transition uses the same figure. */
export const TOP_BAR_FADE_MS = 300;

/**
 * The window events that count as someone being there: the pointer moving or
 * pressing, a key, a touch. The bar listens to each on the window, so input
 * anywhere on the page brings it back.
 */
export const TOP_BAR_ACTIVITY_EVENTS = [
  "pointermove",
  "pointerdown",
  "keydown",
  "touchstart",
] as const;

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
   * Whether the bar must stay up whatever the clock says — the drawer is open,
   * or a control in the bar has focus. A held bar never starts a countdown.
   */
  held?: boolean;
  idleMs?: number;
  timers?: IdleTimers;
}

export interface IdleFade {
  /** Input happened: the bar is visible, and the wait starts over. */
  activity: () => void;
  /** Stop the countdown. Call it when the owner goes away. */
  dispose: () => void;
}

/**
 * The top bar's idle clock: visible while there is input, gone after
 * `TOP_BAR_IDLE_MS` without any.
 *
 * It starts in the visible state with the wait already running, since a page
 * that has just loaded has had no input yet and the bar should be seen before
 * it goes. Each `activity()` reports visible and restarts the wait; when the
 * wait runs out it reports hidden once. A held clock keeps no timer at all, so
 * nothing can fade the bar while the drawer is open however long it stays
 * there; the owner makes a new clock when the hold ends, which is what gives
 * the bar its two seconds after the drawer closes.
 *
 * `onChange` is told only about changes, so an owner that sets state from it
 * is not re-rendered by every pointer move.
 */
export function createIdleFade({
  onChange,
  held = false,
  idleMs = TOP_BAR_IDLE_MS,
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
