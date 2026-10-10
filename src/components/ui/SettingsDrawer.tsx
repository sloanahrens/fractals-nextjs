"use client";

import React, { useEffect, useRef } from "react";

import { Button } from "./Button";

/** The id the dialog names as its label. */
const TITLE_ID = "settings-drawer-title";

interface SettingsDrawerProps {
  /** Whether the drawer is up. The element stays mounted either way. */
  open: boolean;
  /** Called when the user closes it, by any of the three ways. */
  onClose: () => void;
  /**
   * The element focus goes back to on close — the Settings button. The browser
   * restores focus to the opener itself, but only to an element that had focus
   * when it opened, and Safari does not focus a button on click.
   */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  /** The cards. They are rendered whether or not the drawer is open. */
  children: React.ReactNode;
}

/**
 * The Settings drawer: every control the page has, off the canvas
 *
 * It is a native `<dialog>` shown with `showModal()`, the same as the help
 * overlay, so Escape, the inert page behind it and focus moving in are the
 * browser's. The dialog is a panel against the right edge on a wide screen and
 * a bottom sheet under 768 px, and the panel scrolls rather than the page.
 *
 * The cards are children and stay mounted while the drawer is closed — the
 * dialog is only hidden — so their state, the draft in a coordinate box and the
 * render the page is running are untouched by opening or closing it. Opening a
 * modal dialog changes no state in the page and starts no render.
 *
 * A click whose target is the dialog element itself is the backdrop: the panel
 * inside has no padding of its own on the dialog, so every pixel of the drawer
 * is the inner element and only the area outside it reaches the dialog.
 */
export function SettingsDrawer({
  open,
  onClose,
  returnFocusRef,
  children,
}: SettingsDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
        // Left to itself the dialog focuses its first focusable thing, which
        // in Chrome is the scrolling panel, outlined and announced as nothing.
        dialog.querySelector("button")?.focus();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={TITLE_ID}
      // Escape and `close()` both fire this, so every way out of the drawer —
      // Escape, the Close button, the backdrop — reports the same thing.
      onClose={() => {
        onClose();
        returnFocusRef?.current?.focus();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      // `display` is left to the element: a `flex` or `block` class here would
      // override the closed dialog's `display: none`.
      className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-[min(100vw,28rem)] max-w-none bg-gray-100 p-0 shadow-xl backdrop:bg-black/50 max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-auto max-md:max-h-[85vh] max-md:w-full max-md:rounded-t-xl"
    >
      <div className="h-full overflow-y-auto max-md:max-h-[85vh]">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-gray-100 px-4 py-3">
          <h2 id={TITLE_ID} className="text-xl font-semibold">
            Settings
          </h2>
          <Button onClick={onClose} variant="secondary" size="sm">
            Close
          </Button>
        </div>

        <div className="space-y-6 px-4 pb-6">{children}</div>
      </div>
    </dialog>
  );
}
