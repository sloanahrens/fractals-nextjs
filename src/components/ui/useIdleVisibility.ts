"use client";

import { useEffect, useState, type FocusEvent } from "react";

import { createIdleFade, TOP_BAR_ACTIVITY_EVENTS } from "../../lib/idleFade";

/**
 * The idle fade of the floating top bar.
 *
 * The bar is visible while there is input and gone after `TOP_BAR_IDLE_MS`
 * without any (`createIdleFade` is the clock). Two things hold it up regardless:
 * `hold`, which the owner sets for its own reasons (the drawer being open), and
 * focus being on a control inside the bar, so a keyboard user who tabs to a
 * button is never looking at an invisible one. The clock is remade whenever the
 * hold changes, which is what gives the bar a full wait after the hold ends.
 *
 * Spread `focusProps` on the element that holds the controls.
 */
export function useIdleVisibility(hold = false) {
  const [visible, setVisible] = useState(true);
  const [focusWithin, setFocusWithin] = useState(false);

  const held = hold || focusWithin;

  // A hold starting or ending is itself a reason to show the bar: it is made
  // visible during the render that sees the change, against the hold it last
  // saw, rather than from the effect that restarts the clock.
  const [seenHeld, setSeenHeld] = useState(held);
  if (held !== seenHeld) {
    setSeenHeld(held);
    setVisible(true);
  }

  useEffect(() => {
    const fade = createIdleFade({ onChange: setVisible, held });
    const handleActivity = () => fade.activity();

    for (const name of TOP_BAR_ACTIVITY_EVENTS) {
      window.addEventListener(name, handleActivity, { passive: true });
    }

    return () => {
      for (const name of TOP_BAR_ACTIVITY_EVENTS) {
        window.removeEventListener(name, handleActivity);
      }
      fade.dispose();
    };
  }, [held]);

  const shown = held || visible;

  const focusProps = {
    // Only focus a keyboard user would see counts. A mouse click also focuses
    // a button, and a drawer hands focus back when it closes, so holding on any
    // focus would pin the bar for the rest of the visit.
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.target.matches(":focus-visible")) setFocusWithin(true);
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      // Focus moving from one control in the bar to another is not leaving.
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setFocusWithin(false);
      }
    },
  };

  return { shown, focusProps };
}
