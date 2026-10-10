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
  "rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10";

/**
 * The floating bar over the canvas: the title on the left, then Back, Forward,
 * Help and Settings on the right.
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
 * A faded bar takes no pointer events: the touch that brings it back should
 * not also press whatever button is under the finger.
 */
export function TopBar({
  onBack,
  onForward,
  canGoBack,
  canGoForward,
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
      className={`fixed inset-x-0 top-0 z-20 flex h-[var(--top-bar-height)] items-center justify-between bg-gray-900/80 px-4 text-white backdrop-blur transition-opacity ${
        shown ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <h1 className="text-lg font-semibold">Fractal Explorer</h1>
      <div className="flex gap-2">
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
