import React from "react";

interface BlankHintProps {
  /** Whether the picture is blank and settled; nothing is drawn when it is not. */
  show: boolean;
  /** Steps back through the journey, as the top bar's Back does. */
  onBack: () => void;
  /** Whether the journey has an entry before this one; without it only the text shows. */
  canGoBack: boolean;
  /** Whether the switcher's constant chips are showing, which need a second row cleared. */
  belowChips?: boolean;
  /**
   * What the Math card is doing on the left of the picture. Collapsed it is one
   * line at the same height as the hint, so the hint drops below it; expanded it
   * is too tall to drop under, so from `sm` up the hint centres in the width to
   * its right instead.
   */
  mathCard?: "hidden" | "collapsed" | "expanded";
}

// Clear of the switcher's rows, and for a collapsed Math card of its one line
// as well (the card is 2.5rem tall). Under 640 px the card steps aside while the
// hint shows (`MathCard`'s `stepAside`), so there the hint keeps its own place.
function topClass(belowChips: boolean, mathCard: string): string {
  if (mathCard === "collapsed") {
    return belowChips
      ? "top-[8.75rem] max-sm:top-24"
      : "top-[6.75rem] max-sm:top-14";
  }
  return belowChips ? "top-24" : "top-14";
}

/**
 * A small pill at the top centre of the canvas, under the bar and under the
 * fractal switcher's rows (a second one while Julia's chips show), that says the
 * picture has nothing in it and offers the way back. It never takes control:
 * the wrapper takes no pointer events, so the canvas under it still pans and
 * zooms, and only the pill's own box does.
 *
 * The status region stays mounted so a screen reader hears the text when it
 * appears; the pill inside is what comes and goes.
 */
export function BlankHint({
  show,
  onBack,
  canGoBack,
  belowChips = false,
  mathCard = "hidden",
}: BlankHintProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center px-3 ${topClass(
        belowChips,
        mathCard,
      )} ${mathCard === "expanded" ? "sm:pl-[23rem]" : ""}`}
    >
      {show && (
        <p className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-gray-900/80 py-1.5 pl-4 pr-2 text-xs text-white backdrop-blur sm:text-sm">
          <span>Nothing to see here. Try a nearby place, or go back.</span>
          {canGoBack && (
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:text-sm"
            >
              Back
            </button>
          )}
        </p>
      )}
    </div>
  );
}
