"use client";

import React, { useEffect, useRef, useState } from "react";

import {
  WANDER_NUDGE_TEXT,
  wanderPillLabel,
  wanderPlacement,
  type WanderPlacement,
} from "../../lib/wanderControl";

interface WanderControlProps {
  /** Auto-wander is on. */
  on: boolean;
  /** Seconds to the next step, or null when no countdown is running. */
  countdown: number | null;
  /** A full render is in flight. */
  rendering: boolean;
  /** Turns the walk on or off: the Settings checkbox's own handler. */
  onToggle: (enabled: boolean) => void;
  /** True shows the first-run tooltip and pulse. */
  nudge?: boolean;
  /** True renders nothing: a tour, the drawer or the help has the screen. */
  hidden?: boolean;
  /**
   * A control that shares the pill's row, to its left (the Look control). It
   * is hidden when the pill is and placed by the same measure.
   */
  leading?: React.ReactNode;
  /** The widest `leading` gets in pixels, so the two never overlap. */
  leadingWidth?: number;
}

const PILL_CLASSES =
  "pointer-events-auto flex min-h-9 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:text-sm";

const PRESSED = "bg-white text-gray-900";
const RESTING = "bg-gray-900/80 text-white hover:bg-gray-800/90";

// Level with the tiles in the corner, or stacked over the strip: the strip is
// 150 px tall (padding, heading, tile row), so the pill clears its top edge's
// heading line by sitting 114 px up from the picture's bottom.
const PLACEMENT_CLASSES: Record<WanderPlacement, string> = {
  beside: "bottom-4 right-3",
  above: "bottom-[7.25rem] right-3",
  stacked: "bottom-[7.25rem] right-3",
};

// The pill and its `leading` control in a row, or one over the other when the
// picture is too narrow for a row.
const ROW_CLASSES: Record<WanderPlacement, string> = {
  beside: "flex-row items-center gap-2",
  above: "flex-row items-center gap-2",
  stacked: "flex-col items-end gap-1.5",
};

function Glyph({ kind }: { kind: "play" | "pause" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 fill-current"
    >
      {kind === "play" ? (
        <path d="M8 5v14l11-7z" />
      ) : (
        <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
      )}
    </svg>
  );
}

/**
 * The Auto-wander switch on the picture: a pill in the bottom right that says
 * whether the walk is on and turns it on or off, so a first-time visitor can
 * find it without opening Settings. Off it reads "Auto-wander" with a play
 * glyph; on it reads "Wandering" with a pause glyph and the seconds to the next
 * step while the countdown runs (`wanderPillLabel`). It is an `aria-pressed`
 * button whose accessible name is "Auto-wander" in both states.
 *
 * It holds no walk state — the page does, and the Settings checkbox is another
 * view of it. It fades with the page's other controls after a quiet spell
 * (`data-chrome`); that is only its opacity, so the countdown in its label
 * keeps counting while it is gone. Beside the Nearby strip's longest row it sits in
 * the corner; on a narrower picture it stacks over the strip's right end, so it
 * is never over a tile (`wanderPlacement`, from the picture's measured width).
 * The Look control rides in the same row as `leading`, with its width reserved
 * in that measure, so the two are placed together and cannot overlap.
 * Only the pill takes pointer events, so the canvas around it still pans.
 *
 * `nudge` is the page's once-per-browser first-run offer: a one-line tooltip
 * and a two-beat pulse. The pulse is a CSS animation (`globals.css`) that the
 * `prefers-reduced-motion` media query switches off, leaving the tooltip.
 */
export function WanderControl({
  on,
  countdown,
  rendering,
  onToggle,
  nudge = false,
  hidden = false,
  leading,
  leadingWidth = 0,
}: WanderControlProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<WanderPlacement>("above");

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      setPlacement(wanderPlacement(root.clientWidth, leadingWidth));
    });
    observer.observe(root);

    return () => observer.disconnect();
  }, [leadingWidth]);

  const label = wanderPillLabel({ on, countdown, rendering });
  const showNudge = nudge && !hidden;

  return (
    <div
      ref={rootRef}
      data-chrome=""
      className="pointer-events-none absolute inset-0 z-10"
    >
      {!hidden && (
        <div
          className={`absolute flex flex-col items-end gap-1.5 ${PLACEMENT_CLASSES[placement]}`}
        >
          {showNudge && (
            <span
              id="wander-nudge"
              role="tooltip"
              className="pointer-events-none rounded-md bg-gray-900/90 px-2.5 py-1 text-xs text-white shadow"
            >
              {WANDER_NUDGE_TEXT}
            </span>
          )}
          <div className={`flex ${ROW_CLASSES[placement]}`}>
            {leading}
            <button
              type="button"
              aria-pressed={label.pressed}
              aria-label={label.name}
              aria-describedby={showNudge ? "wander-nudge" : undefined}
              onClick={() => onToggle(!on)}
              className={`${PILL_CLASSES} ${on ? PRESSED : RESTING} ${showNudge ? "wander-nudge-pulse" : ""}`}
            >
              <Glyph kind={label.glyph} />
              <span aria-hidden="true">{label.text}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
