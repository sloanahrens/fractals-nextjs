"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { ColorOptions, TrapShape } from "../../types/fractal";
import {
  describeFractalMath,
  describeTrapColouring,
  formatComplex,
} from "../../lib/fractalMath";
import { lookChoiceLabel } from "../../lib/lookControl";
import { trapToControl } from "../../lib/paletteControls";
import {
  type MathCardView,
  formatViewNumbers,
  getMathCardSnapshot,
  getServerMathCardSnapshot,
  mathCardDelayMs,
  setMathCardExpanded,
  subscribeToMathCard,
} from "../../lib/mathCard";
import {
  type PointProbe,
  colourCss,
  describeProbe,
} from "../../lib/mathProbe";
import { PLACES, placeAtView } from "../../lib/places";
import { MathView } from "./MathView";
import { OrbitPlot } from "./OrbitPlot";

interface MathCardProps {
  /** The `FRACTAL_TYPES` id on the canvas. */
  fractalType: string;
  /** The fractal's variant: the Julia constant's name or the Multibrot's power. */
  variant: string;
  /** The view on screen, as the renderer is drawing it. */
  view: MathCardView;
  /**
   * The scheme's reversal and shift, which the probe's colour and the orbit
   * plot's dots are painted through, so the card shows the picture's own
   * colours rather than the scheme's plain ones.
   */
  colorOptions?: ColorOptions;
  /**
   * The orbit trap the picture is coloured in, or null for the iteration
   * count. With a trap on the card names it and explains the colouring in its
   * terms instead of in the count's.
   */
  trap?: TrapShape | null;
  /** Whether the switcher shows its second row, which pushes the card down. */
  belowChips: boolean;
  /**
   * The live probe: the point the pointer is over, what its orbit did and the
   * colour the picture paints it, or null while the pointer is not over the
   * picture (and, from the page, whenever the probe is not running at all).
   */
  probe?: PointProbe | null;
  /**
   * Whether the blank-view hint is showing. Under 640 px the picture is too
   * short for the switcher, the card and the hint together, so the card steps
   * aside (hidden, still mounted) until the view moves; from 640 px up the hint
   * sits below it or beside it instead (`BlankHint`).
   */
  stepAside?: boolean;
  /**
   * The card's own panel element, for the page. It is the only thing drawn
   * over the picture that a probe survives a pointer's move onto, so the page
   * needs the element to watch it (`shouldClearProbe`).
   */
  panelRef?: React.RefObject<HTMLElement | null>;
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
 * Expanded it also carries the live probe: with the pointer over the picture,
 * the number under it, how its orbit ended and a swatch of the colour it is
 * painted, and under those the path it took. The page computes it
 * (`src/lib/mathProbe.ts`) and hands it down, only while the card is expanded
 * and on screen; the row says where to point when there is none. The probe
 * holds while the pointer is on the card rather than the picture, so it can be
 * moved onto the plot's Play control without the plot vanishing on the way —
 * which is why the panel element is published to the page through `panelRef`.
 *
 * With an orbit trap on, it says so: a Look row names the trap and the colour
 * explanation is the trap's own, in plain words built from the shape's real
 * numbers (`describeTrapColouring`), so the card describes the picture being
 * drawn rather than the count it is not. With Normal (no trap) nothing here
 * changes.
 *
 * The numbers follow the live view, throttled to the link writer's cadence.
 * It starts shown and collapsed, and both choices are kept in the browser
 * (`src/lib/mathCard.ts`). Escape closes the card only while focus is in it or
 * on the Math button, since the card is up by default and an Escape elsewhere
 * is not for it; there is no focus trap, so Tab moves through it and on. The
 * page does not render it while a tour plays or the drawer or Help is open, so
 * the card is never over a dialog and the Escape listener exists only while it
 * is on screen. Under 640 px the collapsed line is clipped with an ellipsis
 * rather than wrapped, to stay one line tall. The wrapper takes no
 * pointer events, so the canvas around the card still pans, and it stops short
 * of the Nearby strip's height.
 */
export function MathCard({
  fractalType,
  variant,
  view,
  colorOptions,
  trap = null,
  belowChips,
  probe = null,
  stepAside = false,
  panelRef,
  onClose,
  returnFocusRef,
}: MathCardProps) {
  const { expanded } = useSyncExternalStore(
    subscribeToMathCard,
    getMathCardSnapshot,
    getServerMathCardSnapshot,
  );
  const headingId = useId();
  const detailsId = useId();
  const cardRef = useRef<HTMLElement | null>(null);
  // One element, two readers: the card's own Escape rule, and the page, which
  // watches it for the pointer leaving the picture onto it.
  const setCardRef = useCallback(
    (node: HTMLElement | null) => {
      cardRef.current = node;
      if (panelRef) panelRef.current = node;
    },
    [panelRef],
  );

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

      // The card is up from the first visit, so an Escape pressed elsewhere is
      // not aimed at it: it closes the card from the card or the Math button.
      const active = document.activeElement;
      const inCard = cardRef.current?.contains(active) ?? false;
      if (!inCard && active !== returnFocusRef?.current) return;

      // Focus inside the card would fall to the page when it goes; the Math
      // button it came from is the place to put it back.
      if (inCard) returnFocusRef?.current?.focus();
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
      className={`pointer-events-none absolute bottom-[9.75rem] left-3 z-10 flex min-h-11 max-w-[calc(100%-1.5rem)] items-start ${
        belowChips ? "top-[5.25rem] sm:top-[5.75rem]" : "top-14"
      } ${stepAside ? "max-sm:hidden" : ""}`}
    >
      <section
        ref={setCardRef}
        role="region"
        aria-labelledby={headingId}
        className="pointer-events-auto max-h-full min-w-0 max-w-[22rem] overflow-y-auto rounded-lg bg-gray-900/85 px-3 py-2 text-sm text-white shadow backdrop-blur"
      >
        <h2 id={headingId} className={expanded ? ROW_LABEL : "sr-only"}>
          Math: {math.title}
        </h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            onClick={() => setMathCardExpanded(!expanded)}
            className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span aria-hidden="true">{expanded ? "▾" : "▸"} </span>
            {expanded ? "Less" : "More"}
          </button>
          {/* Collapsed on a phone the line is clipped with an ellipsis rather
              than wrapped, so the card stays one line tall. */}
          <p
            className={`min-w-0 text-base ${expanded ? "" : "max-sm:truncate"}`}
          >
            <MathView expr={math.rule} />
            {math.setting && (
              <>
                <span aria-hidden="true">, </span>
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

              {/* The look the picture is drawn in, named only when it is not
                  the usual one: with a trap on, the row below and the colour
                  the probe shows are the trap's, not the count's. */}
              {trap && (
                <>
                  <dt className={ROW_LABEL}>Look</dt>
                  <dd>{lookChoiceLabel(trapToControl(trap))}</dd>
                </>
              )}

              {/* The probe: the number under the pointer, what its orbit did
                  and the colour the picture paints it. Without one the row
                  says where to point, so the reading is discoverable. */}
              <dt className={ROW_LABEL}>Point</dt>
              <dd>
                {probe ? (
                  <>
                    <span className="tabular-nums">
                      {formatComplex(probe.point.real, probe.point.imaginary)}
                    </span>
                    {/* The pixel's colour; the number beside it says what it
                        means, so the swatch itself has nothing to read out. */}
                    <span
                      aria-hidden="true"
                      data-probe-colour={colourCss(probe.colour)}
                      className="ml-2 inline-block h-3 w-3 rounded-sm align-middle ring-1 ring-white/40"
                      style={{ backgroundColor: colourCss(probe.colour) }}
                    />
                  </>
                ) : (
                  <span className="text-white/60">Hover the picture</span>
                )}
              </dd>

              {probe && (
                <>
                  <dt className={ROW_LABEL}>Orbit</dt>
                  <dd>{describeProbe(fractalType, probe.info, iterations)}</dd>
                  {/* The path itself, under the two lines that name it, so a
                      point inside the set can be watched spiralling and one
                      outside it flying off. */}
                  <div className="col-span-2">
                    <OrbitPlot
                      fractalType={fractalType}
                      orbit={probe.orbit}
                      info={probe.info}
                      scheme={colorScheme}
                      colorOptions={colorOptions}
                    />
                  </div>
                </>
              )}

              {place && (
                <>
                  <dt className={ROW_LABEL}>Place</dt>
                  <dd>{place.name}</dd>
                </>
              )}

              <dt className={ROW_LABEL}>Each point</dt>
              <dd>
                {trap ? describeTrapColouring(fractalType, trap) : math.escape}
              </dd>
            </dl>
            <p className="mt-2 text-white/80">{math.blurb}</p>
          </div>
        )}
      </section>
    </div>
  );
}
