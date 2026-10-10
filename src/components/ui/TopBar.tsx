"use client";

import React, { useEffect, useState } from "react";

import {
  createIdleFade,
  TOP_BAR_ACTIVITY_EVENTS,
  TOP_BAR_FADE_MS,
} from "../../lib/idleFade";

interface TopBarProps {
  /** Opens the help overlay. */
  onHelp: () => void;
  /** Opens the Settings drawer. */
  onSettings: () => void;
  /** Whether the drawer is open, which keeps the bar up. */
  settingsOpen: boolean;
  /** The Settings button, so the drawer can hand focus back to it on close. */
  settingsButtonRef?: React.Ref<HTMLButtonElement>;
}

const BUTTON_CLASSES =
  "rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

/**
 * The floating bar over the canvas: the title on the left, Help and Settings
 * on the right.
 *
 * It fades to nothing after `TOP_BAR_IDLE_MS` without a pointer move, key press
 * or touch, and any of those brings it back. Two things hold it up regardless:
 * the drawer being open, and focus being on a control inside the bar, so a
 * keyboard user who tabs to Settings is never looking at an invisible button.
 * The clock is `createIdleFade`; this component is its owner, and makes a new
 * one whenever the hold changes so the bar gets a full wait after the drawer
 * closes.
 *
 * A faded bar takes no pointer events: the touch that brings it back should
 * not also press whatever button is under the finger.
 */
export function TopBar({
  onHelp,
  onSettings,
  settingsOpen,
  settingsButtonRef,
}: TopBarProps) {
  const [visible, setVisible] = useState(true);
  const [focusWithin, setFocusWithin] = useState(false);

  const held = settingsOpen || focusWithin;

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

  return (
    <header
      data-visible={shown}
      // Only focus a keyboard user would see counts. A mouse click also focuses
      // a button, and the drawer hands focus back to Settings when it closes,
      // so holding on any focus would pin the bar for the rest of the visit.
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setFocusWithin(true);
      }}
      onBlur={(event) => {
        // Focus moving from one control in the bar to another is not leaving.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusWithin(false);
        }
      }}
      style={{ transitionDuration: `${TOP_BAR_FADE_MS}ms` }}
      className={`fixed inset-x-0 top-0 z-20 flex h-[var(--top-bar-height)] items-center justify-between bg-gray-900/80 px-4 text-white backdrop-blur transition-opacity ${
        shown ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <h1 className="text-lg font-semibold">Fractal Explorer</h1>
      <div className="flex gap-2">
        <button type="button" onClick={onHelp} className={BUTTON_CLASSES}>
          Help
        </button>
        <button
          type="button"
          ref={settingsButtonRef}
          onClick={onSettings}
          aria-haspopup="dialog"
          className={BUTTON_CLASSES}
        >
          Settings
        </button>
      </div>
    </header>
  );
}
