/**
 * The Math card's live probe: the number under the pointer, what its orbit did,
 * the path it took and the colour the picture paints it.
 *
 * `MathCard` shows the numbers of a view and they are the same for every pixel
 * of it; a probe is about one point, the one under the pointer. The point is
 * read off the canvas exactly as the renderer reads it, through
 * `pixelToComplex` and the bounds on screen, its count comes from the kind the
 * renderer is drawing with the same cap, and the swatch comes from the colour
 * mapping at the count a full render paints that pixel — so the three agree
 * with the picture by construction rather than by three calculations kept in
 * step. `mathProbe.test.ts` renders a small view and holds every pixel of it
 * to the probe.
 *
 * Everything here is pure or takes its browser function as an argument, so a
 * Node suite drives all of it; the page owns the listeners and the state.
 */

import type {
  ColorOptions,
  ColorRGB,
  ColorScheme,
  ComplexNumber,
  EscapeInfo,
  FractalBounds,
  FractalKind,
} from "../types/fractal";
import { mapIterationsToColor } from "./colorMapping";
import { pixelToComplex } from "./mandelbrot";

/**
 * How many steps of an orbit the probe keeps for the plot.
 *
 * The point under the pointer is one point of the picture and its path is a
 * path, not a number: a point in the set spirals for ever and a point outside
 * flies off within a few steps, so the card draws a window of it and this is
 * how wide. Sixty is enough for the spiral to read as a spiral — a point well
 * inside the set is still circling at sixty — and few enough that one frame's
 * work is a few thousand operations.
 */
export const ORBIT_MAX_STEPS = 60;

/** One point, as the Math card's probe reports it. */
export interface PointProbe {
  /** The point of the plane the pointer is over. */
  point: ComplexNumber;
  /** What its orbit did over the iteration cap in use. */
  info: EscapeInfo;
  /** The colour the picture paints that point, as a full render paints it. */
  colour: ColorRGB;
  /** The path that point's orbit took, start first (`ORBIT_MAX_STEPS` at most). */
  orbit: ComplexNumber[];
}

/**
 * What a point's orbit did, from a kind that may not answer for itself.
 *
 * Every kind this app ships has `escapeInfo`; this is the fallback for one that
 * does not, so an outside kind still probes: its count is the whole story, and
 * a count short of the cap is an escape.
 * @param kind - The formula the renderer is drawing with
 * @param point - Point in the complex plane to test
 * @param maxIterations - Iteration cap in use
 * @returns The steps the point survived and whether it escaped
 */
export function escapeInfoFor(
  kind: FractalKind,
  point: ComplexNumber,
  maxIterations: number,
): EscapeInfo {
  if (kind.escapeInfo) return kind.escapeInfo(point, maxIterations);

  const steps = kind.iterations(point, maxIterations, false);

  return { steps, escaped: steps < maxIterations };
}

/**
 * The path a point's orbit took, from a kind that may not answer for itself.
 *
 * Every kind this app ships has `orbit`; this is the fallback for one that does
 * not, so an outside kind still probes: the point itself is all the path that
 * can be known without running the formula, and the plot draws one dot where it
 * would draw a spiral.
 * @param kind - The formula the renderer is drawing with
 * @param point - Point in the complex plane to test
 * @param maxSteps - Most steps to walk
 * @returns The visited points, the start first
 */
export function orbitFor(
  kind: FractalKind,
  point: ComplexNumber,
  maxSteps: number,
): ComplexNumber[] {
  return kind.orbit ? kind.orbit(point, maxSteps) : [{ ...point }];
}

/**
 * The probe for one point of the plane.
 *
 * The count is the whole-step one, so the card can print a number of steps; the
 * colour is the one a full render paints, which is made from the smooth count
 * and the scheme's own two settings, whatever they are; the path is the orbit
 * itself, capped at `ORBIT_MAX_STEPS` whatever the iteration cap is, so a deep
 * view does not cost the plot a longer walk.
 */
export function probePoint(
  kind: FractalKind,
  point: ComplexNumber,
  maxIterations: number,
  scheme: ColorScheme,
  options?: ColorOptions,
): PointProbe {
  const colour = mapIterationsToColor(
    kind.iterations(point, maxIterations, true),
    maxIterations,
    scheme,
    options,
  );

  return {
    point,
    info: escapeInfoFor(kind, point, maxIterations),
    colour: {
      r: colourByte(colour.r),
      g: colourByte(colour.g),
      b: colourByte(colour.b),
    },
    orbit: orbitFor(kind, point, ORBIT_MAX_STEPS),
  };
}

/**
 * A colour channel as the canvas holds it.
 *
 * The mapping can hand back a negative channel for a smooth count just under
 * zero, which an `ImageData` and a `Uint8ClampedArray` both clamp to 0, and
 * `NaN` for one the arithmetic has left undefined, which they take as 0 too.
 * The swatch is painted from the same numbers, so it is held to the same rule:
 * what the probe says the colour is, is what the picture shows.
 */
function colourByte(value: number): number {
  return Number.isFinite(value) ? Math.min(255, Math.max(0, value)) : 0;
}

/**
 * What the probe says about the point's orbit, in the fractal's own terms.
 *
 * An escape-time set sends points away or keeps them, so a point the cap never
 * turns out is in it. Newton's method has no set to be inside of — every orbit
 * either arrives at a root or wanders — so its unsettled case is said as what
 * it is rather than as "inside".
 * @param fractalId - The `FRACTAL_TYPES` id on the canvas
 * @param info - What the point's orbit did
 * @param maxIterations - The iteration cap the orbit ran under
 * @returns One line for the card, e.g. "Escaped at step 7"
 */
export function describeProbe(
  fractalId: string,
  info: EscapeInfo,
  maxIterations: number,
): string {
  if (fractalId === "newton") {
    // The card counts the roots from 1 as a person does, where the kind
    // numbers them from 0.
    return info.root === undefined
      ? `Never settled in ${maxIterations} steps`
      : `Settles on root ${info.root + 1} after ${info.steps} steps`;
  }

  return info.escaped ? `Escaped at step ${info.steps}` : "Inside the set";
}

/**
 * A colour as the CSS the swatch is painted with.
 * @param colour - Channels 0-255
 * @returns An `rgb()` value
 */
export function colourCss(colour: ColorRGB): string {
  return `rgb(${colour.r}, ${colour.g}, ${colour.b})`;
}

/** The box a pointer event is measured against, as `getBoundingClientRect` gives it. */
export interface ElementRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a pointer is, in the canvas's own pixels.
 *
 * A pointer event reports CSS pixels on the page while everything drawn is in
 * canvas pixels, and the two only agree when the layout shows the canvas at its
 * natural size — a canvas CSS has shrunk has to be scaled back up. A canvas
 * with no box on screen has no pixel to be at, and the answer is null rather
 * than a division by zero.
 * @param clientX - Pointer X in CSS pixels
 * @param clientY - Pointer Y in CSS pixels
 * @param rect - The canvas's box on the page
 * @param width - The canvas's own width in pixels
 * @param height - The canvas's own height in pixels
 * @returns The position in canvas pixels, or null when the canvas has no box
 */
export function pointerToCanvasPixel(
  clientX: number,
  clientY: number,
  rect: ElementRect,
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (!rect.width || !rect.height) return null;

  return {
    x: ((clientX - rect.left) / rect.width) * width,
    y: ((clientY - rect.top) / rect.height) * height,
  };
}

/** Something to run at most once a frame, however often it is asked. */
export interface FrameThrottle {
  /** Ask for a run this frame; asking again before it runs is still one run. */
  request(): void;
  /** Drop a run that has not happened yet. */
  cancel(): void;
}

/**
 * Hold a run back to the next animation frame, and keep only one of them.
 *
 * A pointer move arrives many times between two frames — a high-rate mouse, a
 * trackpad's flood, a finger being dragged — and only the latest position is
 * worth anything, so the work is done once per frame at most and never in the
 * pointer handler itself, where it would sit between the renderer's rows. The
 * frame's own functions are injectable so a Node suite can drive this without a
 * browser.
 * @param run - What to do once a frame, at most
 * @param schedule - Asks for a frame; `requestAnimationFrame` unless a test says otherwise
 * @param cancelFrame - Gives a frame back; `cancelAnimationFrame`
 * @returns The throttle
 */
export function createFrameThrottle(
  run: () => void,
  schedule: (callback: () => void) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame,
): FrameThrottle {
  let pending: number | null = null;

  return {
    request() {
      if (pending !== null) return;

      pending = schedule(() => {
        pending = null;
        run();
      });
    },
    cancel() {
      if (pending === null) return;

      cancelFrame(pending);
      pending = null;
    },
  };
}

/** The point under the pointer in one call, from a pointer event and the canvas. */
export function probeAtPointer(
  kind: FractalKind,
  clientX: number,
  clientY: number,
  rect: ElementRect,
  width: number,
  height: number,
  bounds: FractalBounds,
  maxIterations: number,
  scheme: ColorScheme,
  options?: ColorOptions,
): PointProbe | null {
  const pixel = pointerToCanvasPixel(clientX, clientY, rect, width, height);
  if (!pixel) return null;

  return probePoint(
    kind,
    pixelToComplex(pixel.x, pixel.y, width, height, bounds),
    maxIterations,
    scheme,
    options,
  );
}

/**
 * Whether a pointer leaving one of the probe's surfaces ends the probe.
 *
 * The probe follows a pointer over the picture, and the Math card is drawn over
 * the picture, so the pointer has to be able to cross from one to the other
 * without the point it was reading being thrown away: the orbit plot and its
 * Play control live on the card, and a probe cleared at the edge would take
 * them away before they could be reached. A pointer that has gone into any of
 * the given holders keeps the probe — the holders are the card's panel and the
 * canvas itself, so a crossing in either direction is held, and a move back
 * onto the picture resumes live probing there. Anywhere else ends it, and so
 * does a pointer that has left the window, which reports no target at all.
 *
 * The holders are passed in rather than looked up so the decision is pure: a
 * Node suite hands it stand-ins with a `contains`, and the page hands it the
 * elements it holds refs to.
 * @param relatedTarget - Where the pointer went, as the leave event reports it
 * @param holders - What keeps the probe: the card's panel, and the canvas
 * @returns Whether the probe should be cleared
 */
export function shouldClearProbe(
  relatedTarget: EventTarget | null,
  holders: readonly (Element | null | undefined)[],
): boolean {
  if (!relatedTarget) return true;

  // A holder contains itself, so a pointer that has arrived at the canvas or
  // the panel, and not only at something inside one, is held.
  return !holders.some(
    (holder) => holder?.contains(relatedTarget as Node) ?? false,
  );
}
