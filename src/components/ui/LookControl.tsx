"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  LOOK_CONTROL_NAME,
  lookButtonText,
  lookMenuTarget,
} from "../../lib/lookControl";
import { TRAP_CONTROL_OPTIONS } from "../../lib/paletteControls";

interface LookControlProps {
  /** The page's look as the Settings select holds it: `trapToControl(trap)`. */
  value: string;
  /** A render is in flight, for the change just made or any other. */
  rendering: boolean;
  /** Chooses a look: the Settings select's own handler. */
  onChange: (value: string) => void;
}

const BUTTON_CLASSES =
  "pointer-events-auto flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-medium backdrop-blur transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400";

const OPEN = "bg-white text-gray-900";
const RESTING = "bg-gray-900/80 text-white hover:bg-gray-800/90";

const ITEM_CLASSES =
  "pointer-events-auto flex min-h-11 w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-xs font-medium focus:outline-none focus-visible:bg-blue-100 hover:bg-gray-100";

interface LookMenuProps {
  id: string;
  value: string;
  /** The control's root: a press inside it is not an outside press. */
  rootRef: React.RefObject<HTMLDivElement | null>;
  onPick: (value: string) => void;
  /** Escape: close and hand focus back to the button. */
  onEscape: () => void;
  /** A press outside: close and leave focus where it went. */
  onDismiss: () => void;
}

/**
 * The open menu. It exists only while open, so mounting is "opening": focus
 * goes to the look that is on at that moment (kept in state, so a look that
 * changes under the open menu — Auto-wander, a link — does not pull focus
 * about), and the outside-press listener lives exactly as long as the menu.
 */
function LookMenu({
  id,
  value,
  rootRef,
  onPick,
  onEscape,
  onDismiss,
}: LookMenuProps) {
  const [openedOn] = useState(value);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const current = TRAP_CONTROL_OPTIONS.findIndex(
      (choice) => choice.value === openedOn,
    );
    itemRefs.current[Math.max(current, 0)]?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      onDismiss();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openedOn, rootRef, onDismiss]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }

    const focused = itemRefs.current.findIndex(
      (item) => item === document.activeElement,
    );
    const target = lookMenuTarget(
      focused,
      event.key,
      TRAP_CONTROL_OPTIONS.length,
    );
    if (target === null) return;

    event.preventDefault();
    itemRefs.current[target]?.focus();
  };

  return (
    <div
      id={id}
      role="menu"
      aria-label={LOOK_CONTROL_NAME}
      onKeyDown={handleKeyDown}
      className="pointer-events-auto absolute bottom-full right-0 z-20 mb-2 min-w-[10rem] overflow-hidden rounded-lg bg-white py-1 text-gray-900 shadow-lg"
    >
      {TRAP_CONTROL_OPTIONS.map((choice, index) => {
        const checked = choice.value === value;

        return (
          <button
            key={choice.value}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            tabIndex={-1}
            onClick={() => onPick(choice.value)}
            className={ITEM_CLASSES}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${checked ? "bg-blue-600" : "bg-transparent"}`}
            />
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The Look switch on the picture: a button reading "Look: Normal" (or the
 * Glass look that is on) that opens a short menu of the four looks. It is the
 * Settings drawer's Look select seen from the picture — the page hands both the
 * same value and the same change handler — so the two always agree, and a look
 * changed from anywhere else (Settings, a link, a saved view, a tour stop)
 * shows here at once.
 *
 * The button is `aria-haspopup="menu"` with `aria-expanded`, 44 px tall, and
 * its accessible name is its visible words, "Look: Normal" and so on, so a
 * screen reader hears the look that is on. The menu is a group of `menuitemradio` buttons: Up, Down, Home and
 * End walk them, Enter or Space picks, Escape closes, and so does a press
 * anywhere outside or Tab moving on; focus goes back to the button when the menu
 * closes by Escape or a pick. A render in flight does not disable anything —
 * the visitor can keep choosing, as with every other control — and marks the
 * button `aria-busy` and pulsing, the page's own cue that the picture is being
 * drawn.
 *
 * It holds only whether its menu is open. It sits in the Auto-wander pill's
 * row (`WanderControl`'s `leading` slot), so it is hidden whenever the pill is
 * and placed by the same measure.
 */
export function LookControl({ value, rendering, onChange }: LookControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const closeToButton = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  // Stable, because the open menu's effect lists it: a new function on every
  // render would re-run the effect and move focus back to the checked item.
  const dismiss = useCallback(() => setOpen(false), []);

  return (
    <div
      ref={rootRef}
      className="relative"
      // Tab walking out of the control closes the menu. Only a focus that
      // lands on another element counts: a press on a menu item can report no
      // target in Safari, and closing then would drop the pick.
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next)) {
          dismiss();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-busy={rendering}
        data-busy={rendering ? "true" : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={`${BUTTON_CLASSES} ${open ? OPEN : RESTING} ${rendering ? "motion-safe:animate-pulse" : ""}`}
      >
        {lookButtonText(value)}
      </button>

      {open && (
        <LookMenu
          id={menuId}
          value={value}
          rootRef={rootRef}
          onPick={(picked) => {
            onChange(picked);
            closeToButton();
          }}
          onEscape={closeToButton}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
