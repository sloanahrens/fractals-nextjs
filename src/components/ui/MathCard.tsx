"use client";

import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { describeFractalMath } from "../../lib/fractalMath";
import {
  type MathCardView,
  formatViewNumbers,
  getExpandedSnapshot,
  getServerExpandedSnapshot,
  mathCardDelayMs,
  setExpanded,
  subscribeToExpanded,
} from "../../lib/mathCard";
import { PLACES, placeAtView } from "../../lib/places";
import { MathView } from "./MathView";

interface MathCardProps {
  /** The `FRACTAL_TYPES` id on the canvas. */
  fractalType: string;
  /** The fractal's variant: the Julia constant's name or the Multibrot's power. */
  variant: string;
  /** The view on screen, as the renderer is drawing it. */
  view: MathCardView;
  /** Whether the switcher shows its second row, which pushes the card down. */
  belowChips: boolean;
  /** Closes the card: Escape calls it. */
  onClose: () => void;
  /** The Math button, so Escape can hand focus back to it. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

// What the view-numbers state is of: a fractal change replaces the numbers at
// once, a move of the view waits out the link writer's interval.
interface Shown {
  key: string;
  view: MathCardView;
}

function sameView(a: MathCardView, b: MathCardView): boolean {
  return (
    a.centerX === b.centerX &&
    a.centerY === b.centerY &&
    a.zoom === b.zoom &&
    a.iterations === b.iterations &&
    a.autoIterations === b.autoIterations &&
    a.colorScheme === b.colorScheme
  );
}

const ROW_LABEL = "text-xs font-medium uppercase tracking-wide text-white/60";

/**
 * The mathematics of the picture, laid over the left of the canvas under the
 * switcher.
 *
 * Collapsed it is one line: the rule being iterated and the fractal's setting
 * with its real value (`z → z² + c, c = −0.8 + 0.156i`). Expanded it adds where
 * each point starts, what the setting means, the view's numbers, how a point is
 * judged, a few plain sentences and, when the view is on a catalogue place,
 * that place's name. The rule and the setting are read from the page's own
 * fractal and variant, and the numbers from the state the renderer draws, so
 * the card cannot disagree with the picture. It is read-only.
 *
 * The numbers follow the live view, throttled to the link writer's cadence.
 * The expanded or collapsed choice is kept for the session
 * (`src/lib/mathCard.ts`). Escape closes the card; there is no focus trap, so
 * Tab moves through it and on. The page does not render it while a tour plays
 * or the drawer or Help is open, so the card is never over a dialog and the
 * Escape listener exists only while it is on screen. The wrapper takes no
 * pointer events, so the canvas around the card still pans, and it stops short
 * of the Nearby strip's height.
 */
export function MathCard({
  fractalType,
  variant,
  view,
  belowChips,
  onClose,
  returnFocusRef,
}: MathCardProps) {
  const expanded = useSyncExternalStore(
    subscribeToExpanded,
    getExpandedSnapshot,
    getServerExpandedSnapshot,
  );
  const headingId = useId();
  const detailsId = useId();
  const cardRef = useRef<HTMLElement>(null);

  const { centerX, centerY, zoom, iterations, autoIterations, colorScheme } =
    view;
  const live = useMemo<MathCardView>(
    () => ({
      centerX,
      centerY,
      zoom,
      iterations,
      autoIterations,
      colorScheme,
    }),
    [centerX, centerY, zoom, iterations, autoIterations, colorScheme],
  );

  // The numbers wait out the interval between redraws; the key is the fractal
  // and its setting, so switching one shows its own numbers at once.
  const key = `${fractalType}|${variant}`;
  const [shown, setShown] = useState<Shown>({ key, view: live });
  const lastShownAtRef = useRef(0);
  useEffect(() => {
    if (shown.key === key && sameView(shown.view, live)) return;

    const delay =
      shown.key === key
        ? mathCardDelayMs(Date.now(), lastShownAtRef.current)
        : 0;
    const timer = window.setTimeout(() => {
      lastShownAtRef.current = Date.now();
      setShown({ key, view: live });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [key, live, shown]);
  const numbersView = shown.key === key ? shown.view : live;

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;

      // Focus inside the card would fall to the page when it goes; the Math
      // button it came from is the place to put it back.
      if (cardRef.current?.contains(document.activeElement)) {
        returnFocusRef?.current?.focus();
      }
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, returnFocusRef]);

  const math = describeFractalMath(fractalType, variant);
  const numbers = formatViewNumbers(numbersView);
  const place = useMemo(
    () =>
      placeAtView(
        {
          fractal: fractalType,
          variant,
          centerX: numbersView.centerX,
          centerY: numbersView.centerY,
          zoom: numbersView.zoom,
        },
        PLACES,
      ),
    [fractalType, variant, numbersView],
  );

  return (
    <div
      className={`pointer-events-none absolute bottom-[9.75rem] left-3 z-10 flex min-h-11 items-start ${
        belowChips ? "top-24" : "top-14"
      }`}
    >
      <section
        ref={cardRef}
        role="region"
        aria-labelledby={headingId}
        className="pointer-events-auto max-h-full max-w-[22rem] overflow-y-auto rounded-lg bg-gray-900/85 px-3 py-2 text-sm text-white shadow backdrop-blur"
      >
        <h2 id={headingId} className={expanded ? ROW_LABEL : "sr-only"}>
          Math: {math.title}
        </h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span aria-hidden="true">{expanded ? "▾" : "▸"} </span>
            {expanded ? "Less" : "More"}
          </button>
          <p className="flex flex-wrap items-baseline gap-x-2 text-base">
            <MathView expr={math.rule} />
            {math.setting && (
              <>
                <span aria-hidden="true">,</span>
                <MathView expr={math.setting.value} />
              </>
            )}
          </p>
        </div>

        {expanded && (
          <div id={detailsId} className="mt-2">
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
              <dt className={ROW_LABEL}>Starts from</dt>
              <dd>
                <MathView expr={math.start} />
              </dd>

              {math.setting && (
                <>
                  <dt className={ROW_LABEL}>Setting</dt>
                  <dd>
                    {math.setting.label}: <MathView expr={math.setting.value} />
                  </dd>
                </>
              )}

              <dt className={ROW_LABEL}>Centre</dt>
              <dd>{numbers.centre}</dd>
              <dt className={ROW_LABEL}>Width</dt>
              <dd>{numbers.width}</dd>
              <dt className={ROW_LABEL}>Zoom</dt>
              <dd>{numbers.zoom}</dd>
              <dt className={ROW_LABEL}>Iteration cap</dt>
              <dd>{numbers.iterations}</dd>
              <dt className={ROW_LABEL}>Colours</dt>
              <dd>{numbers.scheme}</dd>

              {place && (
                <>
                  <dt className={ROW_LABEL}>Place</dt>
                  <dd>{place.name}</dd>
                </>
              )}

              <dt className={ROW_LABEL}>Each point</dt>
              <dd>{math.escape}</dd>
            </dl>
            <p className="mt-2 text-white/80">{math.blurb}</p>
          </div>
        )}
      </section>
    </div>
  );
}
