/** Seconds between steps when the walk is switched on and nobody has said otherwise. */
export const DEFAULT_WANDER_INTERVAL_SECONDS = 5;

/** The shortest and longest interval the seconds box accepts, in whole seconds. */
export const MIN_WANDER_INTERVAL_SECONDS = 1;
export const MAX_WANDER_INTERVAL_SECONDS = 120;

/**
 * Every this-many-th step is a hop to a place from the catalogue instead of a
 * drift: with 4, a walk goes drift, drift, drift, hop. Any hop starts the count
 * again, a drift replaced because it landed on a blank picture included, so a
 * hop never follows another by the calendar.
 */
export const WANDER_HOP_EVERY = 4;

// The countdown ticks once a second. The wait is measured in whole seconds, so
// the status line reads a number the user recognises rather than a fraction.
const TICK_MS = 1000;

/**
 * The timers the countdown schedules on.
 *
 * Injected rather than called off the global: the controller is pure
 * bookkeeping, so a test can hand it a clock it drives by hand.
 */
export interface WanderTimers {
  setInterval: (callback: () => void, milliseconds: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

/** What a step is asked to do. */
export interface WanderStep {
  /**
   * True when the step is a hop to a catalogue place; false for a drift, the
   * small random step of `wander.ts`.
   */
  hop: boolean;
}

export interface WanderControllerOptions {
  /**
   * How many seconds are left, or null when no countdown is running — the mode
   * is off, a render is in flight, or the tab is hidden.
   */
  onCountdown?: (secondsRemaining: number | null) => void;
  intervalSeconds?: number;
  timers?: WanderTimers;
}

/**
 * The random walk's clock: when the explorer moves the view by itself, and when
 * it must not.
 *
 * The controller holds no view and draws nothing. It knows four things — the
 * mode is on, the tab is visible, a render is in flight, and how much of the
 * wait is left — and calls `onStep` when the wait runs out. The caller does the
 * stepping, using the view and the fractal it is looking at.
 *
 * The countdown exists only in the state where a step is due: mode on, tab
 * visible, no render running. Every event moves the controller into one of
 * those states and then re-settles, so there is one rule to read rather than a
 * transition table. In particular a render suspends the wait instead of racing
 * it: on a slow machine the walk waits for the picture to finish and then waits
 * its interval, so a step never cancels the render it is standing on.
 *
 * A step is not the end of the wait, it is the start of one: firing clears the
 * timer and the walk re-arms when that step's own render reports done, which is
 * what keeps the cadence tied to finished pictures rather than to wall time.
 */
export class WanderController {
  private onStep: (step: WanderStep) => void = () => {};
  private readonly onCountdown:
    ((secondsRemaining: number | null) => void) | undefined;
  private readonly timers: WanderTimers;
  private isBlank: () => boolean = () => false;

  private running = false;
  private hidden = false;
  private rendering = false;
  private intervalSeconds: number;
  private remainingSeconds = 0;
  private timer: unknown = null;
  /** Drifts taken since the walk began or since the last hop. */
  private driftsSinceHop = 0;
  /** A drift was taken and its settled picture has not been looked at yet. */
  private driftUnchecked = false;
  /** A step handler is running, so the activity it reports is its own. */
  private stepping = false;

  constructor({
    onCountdown,
    intervalSeconds = DEFAULT_WANDER_INTERVAL_SECONDS,
    timers = {
      setInterval: (callback, milliseconds) =>
        globalThis.setInterval(callback, milliseconds),
      clearInterval: (handle) =>
        globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
    },
  }: WanderControllerOptions = {}) {
    this.onCountdown = onCountdown;
    this.timers = timers;
    this.intervalSeconds = intervalSeconds;

    if (!isWholeInterval(intervalSeconds)) {
      this.intervalSeconds = DEFAULT_WANDER_INTERVAL_SECONDS;
    }
  }

  /**
   * What a step does: move the view, by a drift or, when the step says `hop`,
   * to a place. Set rather than handed to the constructor because it is a live
   * callback — a caller that builds this once has to be able to say what a step
   * is later, using the fractal and the view it holds at that moment. Until it
   * is set a step does nothing.
   */
  setStepHandler(onStep: (step: WanderStep) => void): void {
    this.onStep = onStep;
  }

  /**
   * Whether the picture on the canvas is nearly one colour. Asked once, when
   * the picture a drift produced has settled ({@link WanderController.notifySettled});
   * a drift that landed on a blank picture is replaced at once by a hop. A
   * setter for the same reason as the step handler: the canvas belongs to the
   * page, which is built after the controller. Until it is set, no picture is
   * blank.
   */
  setBlankDetector(isBlank: () => boolean): void {
    this.isBlank = isBlank;
  }

  /** Switch the walk on. A second call while it is already on does nothing. */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.driftsSinceHop = 0;
    this.driftUnchecked = false;
    this.settle();
  }

  /** Switch the walk off, stopping the countdown at once. */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.settle();
  }

  /**
   * A full-resolution render is starting. Nothing is drawn at another quality
   * for this call: a preview is not the picture the walk waits for.
   */
  notifyRenderStart(): void {
    this.rendering = true;
    this.settle();
  }

  /** That render finished, whether it completed the picture or was superseded. */
  notifyRenderDone(): void {
    this.rendering = false;
    this.settle();
  }

  /**
   * The view moved — a wheel, a drag, a key, a control, or a step of the walk
   * itself — so the wait starts again from the full interval. It does not
   * switch the mode off.
   */
  notifyActivity(): void {
    // A move by hand leaves no drift picture to judge; the walk's own step
    // reports through here too, and keeps its flag.
    if (!this.stepping) this.driftUnchecked = false;
    this.settle();
  }

  /**
   * The view on screen is fully drawn. If it is the picture a drift produced
   * and it is blank, the walk does not sit on nothing: it hops at once, ahead
   * of the next countdown. Any other settled picture is left alone.
   *
   * Call it once the handler from {@link WanderController.setStepHandler} is
   * current, from the page's effect on the settled render rather than from
   * inside the render's own completion.
   */
  notifySettled(): void {
    if (!this.driftUnchecked) return;

    this.driftUnchecked = false;
    if (!this.running || this.hidden || this.rendering) return;
    if (!this.isBlank()) return;

    this.step(true);
  }

  /** The tab was hidden or shown again; a hidden tab counts down nothing. */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;

    this.hidden = hidden;
    this.settle();
  }

  /**
   * Change the seconds between steps. The new interval applies to the next
   * wait, so a countdown already running keeps the deadline it was given.
   *
   * A value outside the allowed range or not a whole number is ignored, which
   * leaves the last good interval in use. The page filters what the user types
   * before it gets here; this is the backstop.
   */
  setIntervalSeconds(seconds: number): void {
    if (!isWholeInterval(seconds)) return;

    this.intervalSeconds = seconds;
  }

  /** Seconds between steps currently in force. */
  getIntervalSeconds(): number {
    return this.intervalSeconds;
  }

  /**
   * Bring the timer in line with the mode, the tab and the render: run the
   * countdown exactly when all three allow a step, and not otherwise.
   */
  private settle(): void {
    this.stopTimer();

    if (!this.running || this.hidden || this.rendering) {
      if (this.remainingSeconds !== 0) {
        this.remainingSeconds = 0;
        this.publish();
      }
      return;
    }

    this.remainingSeconds = this.intervalSeconds;
    this.publish();
    this.timer = this.timers.setInterval(this.tick, TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer === null) return;

    this.timers.clearInterval(this.timer);
    this.timer = null;
  }

  private tick = (): void => {
    this.remainingSeconds -= 1;

    if (this.remainingSeconds > 0) {
      this.publish();
      return;
    }

    // The wait is over. Stop before stepping, so the step's own render is what
    // arms the next countdown rather than the timer that just fired.
    this.stopTimer();
    this.remainingSeconds = 0;
    this.publish();
    this.step(this.driftsSinceHop + 1 >= WANDER_HOP_EVERY);
  };

  /** Take one step, keeping count of the drifts since the last hop. */
  private step(hop: boolean): void {
    this.driftsSinceHop = hop ? 0 : this.driftsSinceHop + 1;

    this.stepping = true;
    try {
      this.onStep({ hop });
    } finally {
      this.stepping = false;
    }
    // A hop goes to a place chosen for being worth seeing, so only a drift's
    // picture is looked at.
    this.driftUnchecked = !hop;
  }

  private publish(): void {
    this.onCountdown?.(
      this.remainingSeconds > 0 ? this.remainingSeconds : null,
    );
  }
}

/** Whether a value is a whole number of seconds the walk can wait. */
function isWholeInterval(seconds: number): boolean {
  return (
    Number.isInteger(seconds) &&
    seconds >= MIN_WANDER_INTERVAL_SECONDS &&
    seconds <= MAX_WANDER_INTERVAL_SECONDS
  );
}
