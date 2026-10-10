"use client";

import React from "react";

import { TOP_BAR_FADE_MS } from "../../lib/idleFade";
import { useIdleVisibility } from "./useIdleVisibility";

interface TopBarProps {
  /** Steps back through the journey, as the browser's Back does. */
  onBack: () => void;
  /** Steps forward through the journey, as the browser's Forward does. */
  onForward: () => void;
  /** Whether the journey has an entry before this one; Back is disabled without. */
  canGoBack: boolean;
  /** Whether the journey has an entry after this one; Forward is disabled without. */
  canGoForward: boolean;
  /** Goes to a random place near the view, as a Nearby tile does. */
  onSurprise: () => void;
  /** Whether there is a place to go to; Surprise me is disabled without. */
  canSurprise: boolean;
  /** Starts a tour at once, without waiting out the idle time. */
  onTour: () => void;
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
  "rounded-lg bg-white/10 px-2 py-1.5 text-xs font-medium sm:px-3 sm:text-sm text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10";

// Drawn from `sm` up; below it the title is for a screen reader only, which
// leaves the width to the five buttons.
const TITLE_CLASSES = "sr-only text-lg font-semibold sm:not-sr-only";

/**
 * The floating bar over the canvas: the title on the left, Surprise me and Tour
 * in the middle, then Back, Forward, Help and Settings on the right. Under `sm`
 * the title stays in the page for a screen reader but is not drawn, so the six
 * buttons fit a phone's width.
 *
 * Back and Forward retrace the journey — the views the user jumped to — through
 * the browser's own history; the page says whether there is anywhere to go, and
 * a button with nowhere to go is disabled rather than hidden so the bar does not
 * change shape.
 *
 * It fades to nothing after `TOP_BAR_IDLE_MS` without a pointer move, key press
 * or touch, and any of those brings it back. The drawer being open, and focus
 * being on a control inside the bar, hold it up (`useIdleVisibility`).
 *
 * Surprise me takes the user to one of the places the Nearby strip would
 * offer, chosen at random; it is disabled when there are none. Tour, beside it,
 * starts the screensaver tour at once; the page takes the bar away while it
 * plays, so this component has nothing of its own to hide.
 *
 * A faded bar takes no pointer events: the touch that brings it back should
 * not also press whatever button is under the finger.
 */
export function TopBar({
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  onSurprise,
  canSurprise,
  onTour,
  onHelp,
  onSettings,
  settingsOpen,
  settingsButtonRef,
}: TopBarProps) {
  const { shown, focusProps } = useIdleVisibility(settingsOpen);

  return (
    <header
      data-visible={shown}
      {...focusProps}
      style={{ transitionDuration: `${TOP_BAR_FADE_MS}ms` }}
      className={`fixed inset-x-0 top-0 z-20 flex h-[var(--top-bar-height)] items-center justify-between gap-2 bg-gray-900/80 px-2 text-white backdrop-blur transition-opacity sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-4 ${
        shown ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <h1 className={TITLE_CLASSES}>Fractal Explorer</h1>
      <div className="flex gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onSurprise}
          disabled={!canSurprise}
          className={BUTTON_CLASSES}
        >
          Surprise me
        </button>
        <button type="button" onClick={onTour} className={BUTTON_CLASSES}>
          Tour
        </button>
      </div>
      <div className="flex gap-1 sm:justify-self-end sm:gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          className={BUTTON_CLASSES}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onForward}
          disabled={!canGoForward}
          className={BUTTON_CLASSES}
        >
          Forward
        </button>
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
