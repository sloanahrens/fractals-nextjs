"use client";

import { useEffect, useState, type FocusEvent } from "react";

import {
  CHROME_SELECTOR,
  chromeHeld,
  chromeShown,
  watchChromeActivity,
  type ChromeHolds,
} from "../../lib/idleFade";

/** Whether `target` is, or is inside, a control over the picture. */
function inChrome(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CHROME_SELECTOR) !== null;
}

/**
 * The idle fade of every control over the picture, as one page-level state.
 *
 * The controls are visible while there is input and gone after
 * `CHROME_IDLE_MS` without any (`createIdleFade` is the clock). Two things hold
 * them up regardless: the page's own `holds` (a dialog is open, the Look menu
 * or the Math card is), and focus being on a control, so a keyboard user who
 * tabs to a button is never looking at an invisible one (`chromeHeld` folds
 * them together). The clock is remade whenever the hold changes, which is what
 * gives the controls a full wait after the hold ends.
 *
 * Spread `focusProps` on the element that holds the controls; only focus that
 * lands on something carrying the chrome attribute counts, so the canvas, which
 * a keyboard user also focuses, does not pin them.
 */
export function useIdleVisibility(holds: Omit<ChromeHolds, "focusWithin">) {
  const [visible, setVisible] = useState(true);
  const [focusWithin, setFocusWithin] = useState(false);

  const held = chromeHeld({ ...holds, focusWithin });

  // A hold starting or ending is itself a reason to show the controls: they
  // are made visible during the render that sees the change, against the hold
  // it last saw, rather than from the effect that restarts the clock.
  const [seenHeld, setSeenHeld] = useState(held);
  if (held !== seenHeld) {
    setSeenHeld(held);
    setVisible(true);
  }

  useEffect(
    () => watchChromeActivity({ target: window, onChange: setVisible, held }),
    [held],
  );

  const shown = chromeShown(held, visible);

  const focusProps = {
    // Only focus a keyboard user would see counts. A mouse click also focuses
    // a button, and a drawer hands focus back when it closes, so holding on any
    // focus would pin the controls for the rest of the visit.
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (inChrome(event.target) && event.target.matches(":focus-visible")) {
        setFocusWithin(true);
      }
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      // Focus moving from one control to another is not leaving.
      if (!inChrome(event.relatedTarget)) setFocusWithin(false);
    },
  };

  return { shown, focusProps };
}
