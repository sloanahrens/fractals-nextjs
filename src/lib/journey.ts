/**
 * The journey: the views the user has deliberately gone to, in order.
 *
 * The address bar follows the view with `replaceState`, so on its own it is one
 * history entry however far the user explores. A jump — a preset, Apply
 * Coordinates, another fractal or Julia constant, a pasted link — is a step the
 * user would want to take back, and the page makes it a browser history entry.
 * The browser owns those entries and walks them with its Back and Forward
 * buttons; this module is the page's record of what it believes they are, so
 * the rule can be driven in Node with no `window` to ask.
 *
 * An entry is a view-link fragment exactly as `window.location.hash` gives it,
 * so the record and the address bar compare with `===`. Nothing here touches a
 * browser API.
 */

/** The most entries the journey keeps; the oldest is dropped past it. */
export const MAX_JOURNEY_ENTRIES = 200;

/** What {@link Journey.arrive} did with a fragment the browser landed on. */
export type JourneyArrival = "same" | "back" | "forward" | "push";

export class Journey {
  private entries: string[] = [];
  private index = -1;

  /** The fragment the journey is on, or null before there is one. */
  get current(): string | null {
    return this.entries[this.index] ?? null;
  }

  get canGoBack(): boolean {
    return this.index > 0;
  }

  get canGoForward(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  /** How many entries the journey holds. */
  get length(): number {
    return this.entries.length;
  }

  /**
   * Add a step after the current one.
   *
   * Entries ahead of the current one are dropped, as a browser drops them when
   * a new entry is made from the middle of its history. Pushing the fragment
   * that is already current adds nothing, so a jump to where the user already
   * is leaves no empty step to go back through.
   *
   * @returns True when an entry was added
   */
  push(fragment: string): boolean {
    if (fragment === this.current) return false;

    this.entries.splice(this.index + 1);
    this.entries.push(fragment);
    this.index = this.entries.length - 1;

    if (this.entries.length > MAX_JOURNEY_ENTRIES) {
      this.entries.shift();
      this.index--;
    }

    return true;
  }

  /**
   * Rewrite the current entry in place, as `replaceState` does.
   *
   * The follower that keeps the address bar on the view calls this, so the
   * entry stays the view it describes through a drag. On an empty journey the
   * fragment is the first entry.
   */
  replace(fragment: string): void {
    if (this.index < 0) {
      this.push(fragment);
      return;
    }

    this.entries[this.index] = fragment;
  }

  /** Step back one entry and return it, or null when there is none. */
  back(): string | null {
    if (!this.canGoBack) return null;

    this.index--;
    return this.current;
  }

  /** Step forward one entry and return it, or null when there is none. */
  forward(): string | null {
    if (!this.canGoForward) return null;

    this.index++;
    return this.current;
  }

  /**
   * Follow the browser to a fragment the page did not write.
   *
   * Back, Forward and an edit of the address bar all arrive as a fragment
   * change and nothing says which: the fragment is matched against the
   * neighbours. The entry before wins a tie with the one after, so a journey
   * that holds the same view on both sides of the current one follows Back
   * either way and stays consistent with the view on screen, which is all the
   * page reads of it. A fragment that is none of the three was typed or pasted,
   * and is a new step.
   *
   * @returns Which of the four it was
   */
  arrive(fragment: string): JourneyArrival {
    if (fragment === this.current) return "same";

    if (this.entries[this.index - 1] === fragment) {
      this.index--;
      return "back";
    }

    if (this.entries[this.index + 1] === fragment) {
      this.index++;
      return "forward";
    }

    this.push(fragment);
    return "push";
  }
}

/** Whether the top bar's Back and Forward buttons have anywhere to go. */
export interface HistoryButtons {
  canGoBack: boolean;
  canGoForward: boolean;
}

/**
 * What the Back and Forward buttons may do, read off the journey.
 *
 * The buttons call the browser's own `history.back()` and `history.forward()`,
 * but the browser will not say whether there is an entry on either side, and
 * its entries from before this page loaded are not the explorer's to walk. The
 * journey is the page's record of its own entries, so a button is enabled
 * exactly when the journey has a step that way.
 */
export function historyButtons(
  journey: Pick<Journey, "canGoBack" | "canGoForward">,
): HistoryButtons {
  return { canGoBack: journey.canGoBack, canGoForward: journey.canGoForward };
}
