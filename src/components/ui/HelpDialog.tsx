"use client";

import { useEffect, useRef } from "react";

import { HELP_DIALOG_TITLE, HELP_SECTIONS } from "../../lib/helpEntries";
import { Button } from "./Button";

/** The id the dialog names as its label. */
const TITLE_ID = "help-dialog-title";

interface HelpDialogProps {
  /** Whether the dialog is up. The element stays mounted either way. */
  open: boolean;
  /** Called when the user closes it, by any of the three ways. */
  onClose: () => void;
}

/**
 * The help overlay: every way to drive the explorer, in one dialog
 *
 * It is a native `<dialog>` shown with `showModal()`, so the browser supplies
 * what a hand-rolled overlay has to reimplement: Escape closes it, the page
 * behind it is inert and cannot be tabbed into, the rest of the page is hidden
 * from a screen reader, and focus returns to whatever was focused when it
 * opened. `aria-labelledby` points at the heading, so the dialog is announced
 * by its title.
 *
 * The dialog element is always mounted and the `open` prop only drives
 * `showModal()` and `close()`, so a close animation or a re-open has an element
 * to work with.
 */
export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={TITLE_ID}
      // Escape and `close()` both fire this, so every way out of the dialog —
      // Escape, the Close button, the backdrop — reports the same thing.
      onClose={onClose}
      // A click that lands on the dialog element itself rather than on the
      // panel inside it is a click on the backdrop.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="w-[min(90vw,32rem)] rounded-lg bg-white p-0 shadow-lg backdrop:bg-black/50"
    >
      <div className="max-h-[80vh] overflow-y-auto p-6">
        <h2 id={TITLE_ID} className="text-xl font-semibold mb-4">
          {HELP_DIALOG_TITLE}
        </h2>

        <div className="space-y-5">
          {HELP_SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
                {section.title}
              </h3>
              <dl className="space-y-2">
                {section.entries.map((entry) => (
                  <div
                    key={entry.keys}
                    className="flex flex-col sm:flex-row sm:gap-3"
                  >
                    <dt className="sm:w-56 shrink-0">
                      <kbd className="inline-block rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs font-mono text-gray-800">
                        {entry.keys}
                      </kbd>
                    </dt>
                    <dd className="text-sm text-gray-700">{entry.action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <div className="mt-6 text-right">
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>
      </div>
    </dialog>
  );
}
