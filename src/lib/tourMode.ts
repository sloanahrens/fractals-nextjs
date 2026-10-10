import { TOUR_DWELL_MS } from "./tour";

/** How long the page is left alone before a tour starts by itself. */
export const TOUR_IDLE_START_MS = 20000;

/**
 * The window events that count as someone being there, and so stop a tour and
 * start the idle wait over: a pointer moving or pressing, a key, a touch, the
 * wheel.
 */
export const TOUR_ACTIVITY_EVENTS = [
  "pointermove",
  "pointerdown",
  "keydown",
  "touchstart",
  "wheel",
] as const;

/**
 * Where a tour is.
 *
 * - `idle`: nothing is counting down, because the page is not somewhere a tour
 *   may start by itself (a drawer or dialog is open, a field has focus, the tab
 *   is hidden or the window is not focused), or nothing has said it is yet.
 * - `armed`: the idle wait is running, or a start that was asked for is waiting
 *   for the tab or the render. The tour begins when it runs out.
 * - `playing`: the tour is on screen and hopping.
 * - `stopped`: a tour was ended and the idle wait is running again, so the page
 *   that has been left alone for {@link TOUR_IDLE_START_MS} again plays another.
 *   It is `armed` for a machine that has played.
 */
export type TourModeState = "idle" | "armed" | "playing" | "stopped";

/** What the page tells the machine about itself. */
export interface TourConditions {
  /** The Settings drawer or the Help dialog is open. */
  overlayOpen: boolean;
  /** A text field, select or editable region has focus. */
  inputFocused: boolean;
  /** The tab is not visible. */
  tabHidden: boolean;
  /** The window has focus. */
  windowFocused: boolean;
  /**
   * The view on screen is fully drawn: no render is running and the picture is
   * the one the page is on. False until the first full render finishes.
   */
  settled: boolean;
}

export interface TourModeOptions {
  /**
   * Called each time the state changes, with the state it left. A change out of
   * `playing` is the end of a tour, whatever ended it.
   */
  onChange?: (state: TourModeState, previous: TourModeState) => void;
  idleMs?: number;
  dwellMs?: number;
  /** The conditions the page starts in; the rest are the permissive ones. */
  conditions?: Partial<TourConditions>;
}

/**
 * The clock and the rules of a tour: when one starts, when it hops, and when it
 * must give way.
 *
 * It knows no view and draws nothing; the page says what a hop is
 * ({@link TourMode.setHopHandler}) and reports what it can see
 * ({@link TourMode.setConditions}). It reads the global timers when it needs
 * one, so a test drives it on fake ones. Nothing starts a timer until the page
 * has reported its conditions, so building one while rendering on a server is
 * harmless.
 *
 * A tour starts three ways. After {@link TOUR_IDLE_START_MS} without
 * `activity()`, while the page is somewhere a tour may start by itself; and at
 * once on `hashTour()` or `buttonStart()`, which are asks and so are refused
 * only while a drawer, a dialog or a text field has the user's attention. Every
 * start waits for a visible tab and a settled picture, so a tour never begins
 * over a render in flight and never in a background tab.
 *
 * While playing, the first hop is made at the start, and the dwell runs from
 * each time the picture settles, so a slow render lengthens a stay rather than
 * cutting it short. Any `activity()` ends the tour.
 */
export class TourMode {
  private onHop: (first: boolean) => void = () => {};
  private readonly onChange: NonNullable<TourModeOptions["onChange"]>;
  private readonly idleMs: number;
  private readonly dwellMs: number;

  private conditions: TourConditions;
  private phase: TourModeState = "idle";
  /** Whether a tour has played, which turns `armed` into `stopped`. */
  private hasPlayed = false;
  /** A start was asked for and is waiting for the tab or the render. */
  private pendingStart = false;
  /** The idle wait ran out and is waiting for the tab or the render. */
  private idleDue = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private hopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor({
    onChange = () => {},
    idleMs = TOUR_IDLE_START_MS,
    dwellMs = TOUR_DWELL_MS,
    conditions,
  }: TourModeOptions = {}) {
    this.onChange = onChange;
    this.idleMs = idleMs;
    this.dwellMs = dwellMs;
    this.conditions = {
      overlayOpen: false,
      inputFocused: false,
      tabHidden: false,
      windowFocused: true,
      settled: false,
      ...conditions,
    };
  }

  /**
   * What a hop does: go to the next place. Set rather than handed to the
   * constructor because it is a live callback that reads the page as it is when
   * the hop is due. It is told whether this is the first hop of a tour, the one
   * made at the start, so it can begin from the view on screen. Until it is set
   * a hop does nothing.
   */
  setHopHandler(onHop: (first: boolean) => void): void {
    this.onHop = onHop;
  }

  /** Where the tour is. */
  get state(): TourModeState {
    return this.phase;
  }

  /**
   * Someone is here: a key, a touch, a click, the pointer moving.
   *
   * Ends a tour that is playing and starts the idle wait over otherwise.
   */
  activity(): void {
    if (this.phase === "playing") {
      this.stop();
      return;
    }

    if (this.phase === "armed" || this.phase === "stopped") {
      this.restartCountdown();
    }
  }

  /** The address asked for a tour. See {@link TourMode.buttonStart}. */
  hashTour(): boolean {
    return this.requestStart();
  }

  /** The Tour button was pressed. */
  buttonStart(): boolean {
    return this.requestStart();
  }

  /**
   * Ask for a tour now.
   *
   * @returns False when it is refused (a drawer, a dialog or a text field has
   *   the user's attention, or a tour is already playing); true when the tour
   *   has started or will as soon as the tab is visible and the picture settled
   */
  private requestStart(): boolean {
    if (this.phase === "playing") return false;
    if (this.blocksStart()) return false;

    this.pendingStart = true;
    this.clearIdle();
    if (this.phase === "idle") this.setPhase("armed");
    this.advance();
    return true;
  }

  /**
   * End the tour that is playing; a call at any other time only withdraws a
   * start that was waiting.
   */
  stop(): void {
    this.pendingStart = false;
    if (this.phase !== "playing") return;

    this.clearHop();
    this.hasPlayed = true;
    // The wait for the next tour starts now, if the page is somewhere one may.
    if (this.allowsAutoStart()) {
      this.setPhase("stopped");
      this.restartCountdown();
    } else {
      this.setPhase("idle");
    }
  }

  /** Report a change in the page; only the fields given change. */
  setConditions(patch: Partial<TourConditions>): void {
    this.conditions = { ...this.conditions, ...patch };

    if (this.phase === "playing") {
      // A tour gives way to anything that wants the user's attention.
      if (this.blocksStart()) {
        this.stop();
        return;
      }
      this.syncHop();
      return;
    }

    if (this.pendingStart && this.blocksStart()) this.pendingStart = false;

    if (!this.allowsAutoStart()) {
      this.clearIdle();
      this.idleDue = false;
    }

    if (this.allowsAutoStart() && this.phase === "idle") {
      this.setPhase(this.hasPlayed ? "stopped" : "armed");
      this.restartCountdown();
    } else if (
      !this.allowsAutoStart() &&
      !this.pendingStart &&
      this.phase !== "idle"
    ) {
      this.setPhase("idle");
    }

    this.advance();
  }

  /**
   * Stop every timer and go back to `idle`. Call it when the owner goes away.
   * The next {@link TourMode.setConditions} starts the idle wait again, which
   * is what a page that mounts twice (React's strict mode) needs; a start that
   * was asked for stays asked for.
   */
  dispose(): void {
    this.clearIdle();
    this.clearHop();
    this.idleDue = false;
    this.setPhase("idle");
  }

  /** Whether the idle wait may run: the page is here to be left alone. */
  private allowsAutoStart(): boolean {
    const c = this.conditions;
    return !c.overlayOpen && !c.inputFocused && !c.tabHidden && c.windowFocused;
  }

  /** Whether the user is busy with a control, which no start may interrupt. */
  private blocksStart(): boolean {
    return this.conditions.overlayOpen || this.conditions.inputFocused;
  }

  /** Whether a tour may be on screen now: the tab is up and the picture drawn. */
  private canPlay(): boolean {
    return !this.conditions.tabHidden && this.conditions.settled;
  }

  /** Begin the tour if something wants one and the page can show it. */
  private advance(): void {
    if (this.phase === "playing") return;
    if (!(this.pendingStart || this.idleDue) || !this.canPlay()) return;

    this.pendingStart = false;
    this.idleDue = false;
    this.clearIdle();
    this.setPhase("playing");
    // The first hop is at the start, so a press of Tour or a #tour link shows
    // something moving rather than the view it came from for a dwell.
    this.onHop(true);
    this.syncHop();
  }

  /** The idle wait, from the full length. */
  private restartCountdown(): void {
    this.clearIdle();
    this.idleDue = false;
    if (!this.allowsAutoStart()) return;

    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.idleDue = true;
      this.advance();
    }, this.idleMs);
  }

  /**
   * Run the dwell exactly while a hop could be seen: the tab is up and the
   * picture is drawn. A timer already running keeps its deadline.
   */
  private syncHop(): void {
    if (this.phase !== "playing" || !this.canPlay()) {
      this.clearHop();
      return;
    }
    if (this.hopTimer !== null) return;

    this.hopTimer = setTimeout(() => {
      this.hopTimer = null;
      this.onHop(false);
      // Still settled until the page reports the hop's render, so the dwell
      // runs on: a hop that causes no render is not the end of the tour.
      this.syncHop();
    }, this.dwellMs);
  }

  private clearIdle(): void {
    if (this.idleTimer === null) return;

    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private clearHop(): void {
    if (this.hopTimer === null) return;

    clearTimeout(this.hopTimer);
    this.hopTimer = null;
  }

  private setPhase(next: TourModeState): void {
    const previous = this.phase;
    if (previous === next) return;

    this.phase = next;
    this.onChange(next, previous);
  }
}

/** The elements whose own keystrokes and focus belong to them. */
const TEXT_ENTRY_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/**
 * Whether focus on an element is a user typing into something, which no tour
 * starts over.
 *
 * @param tagName - Upper-case tag name of the focused element, or "" for none
 * @param isContentEditable - Whether it is an editable region of its own
 */
export function isTextEntry(
  tagName: string,
  isContentEditable: boolean,
): boolean {
  return isContentEditable || TEXT_ENTRY_TAGS.has(tagName);
}

/**
 * Whether a `pointermove` is the pointer going somewhere.
 *
 * A browser fires a move event when the page under a resting pointer changes
 * (hiding the bar does that), at the position the pointer already had. That is
 * the page moving, not someone, and it would end a tour the moment it began.
 *
 * @param previous - Where the last move was seen, or null for none yet
 * @param x - The event's `clientX`
 * @param y - The event's `clientY`
 */
export function pointerMoved(
  previous: { x: number; y: number } | null,
  x: number,
  y: number,
): boolean {
  return previous === null || previous.x !== x || previous.y !== y;
}
