/**
 * The Math card's orbit plot: the path the point under the pointer takes.
 *
 * The probe names the point and says what its orbit did; the plot draws it, so
 * a visitor can watch a point inside the set spiral in and a point outside it
 * fly off, which is how the picture is made. Everything here is pure — the
 * scaling from the plane to the SVG, the words the plot is described with, the
 * colour of one step — so a Node suite drives all of it and the component is
 * left with the markup.
 */

import type {
  ColorOptions,
  ColorScheme,
  ComplexNumber,
  EscapeInfo,
} from "../types/fractal";
import { mapIterationsToColor } from "./colorMapping";
import { colourCss } from "./mathProbe";

/** The side of the plot's square, in SVG user units. */
export const ORBIT_PLOT_SIZE = 220;

/** How long one step of the Play animation is held. */
export const ORBIT_PLAY_STEP_MS = 120;

/**
 * How much of the plane the plot always shows either way from the origin.
 *
 * It is the escape radius: a point that leaves it has left the picture's own
 * region, so a plot narrower than this would hide the circle that says where
 * "gone" begins.
 */
export const ORBIT_ESCAPE_RADIUS = 2;

/**
 * How much of the plane the plot shows for a kind with no escape circle.
 *
 * Newton's method has no radius to leave; its orbits converge on the cube roots
 * of 1, which sit at distance 1 from the origin, so unit scale frames them.
 */
const NEWTON_PLOT_EXTENT = 1;

/**
 * The furthest a point may push the plot's frame, as a multiple of the minimum.
 *
 * A point that has flown off is flying: within a few steps past the escape
 * radius its size runs into the millions and beyond, and scaling the plot to it
 * would leave every other dot piled on the origin. So the frame stops at twice
 * the escape radius and anything past that is pinned to the edge — the
 * direction is worth seeing and the distance is not.
 */
export const ORBIT_MAX_EXTENT_FACTOR = 2;

/** The share of the plot's side left as a margin, so an edge dot is whole. */
const ORBIT_MARGIN_SHARE = 0.05;

/** One point of the plane, placed in the plot's own coordinates. */
export interface PlotPoint {
  x: number;
  y: number;
}

/** A whole orbit, placed: the dots, and the frame they were placed in. */
export interface OrbitPlotGeometry {
  /** One point per orbit point, the start first. */
  points: PlotPoint[];
  /** SVG units per unit of the plane. */
  scale: number;
  /** Where the plane's origin sits in the plot. */
  origin: PlotPoint;
  /** How much of the plane the plot spans either way from the origin. */
  extent: number;
  /** The plot's side, as it was asked for. */
  size: number;
}

/** A coordinate as a number the plot can draw: one that is not a number at all reads as 0. */
function drawable(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** A coordinate held inside the plot's margin box. */
function clampToPlot(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Place an orbit in a square plot.
 *
 * The frame is the orbit's own size — the furthest point from the origin — but
 * never smaller than `minExtent` and never larger than twice it, so the escape
 * circle is always in view and a point that has flown off cannot shrink the
 * rest of the path to a dot. A point past the frame is pinned to the edge
 * rather than dropped, so the way it left is still drawn.
 *
 * The imaginary part goes up the page as the plane has it, so the picture is
 * the picture and not its mirror. Every coordinate out of here is a finite
 * number inside the plot's margin box, whatever arrived: the orbit of a point
 * that has blown up is full of values no scale can hold, and one of them must
 * not be able to spoil the frame for the rest.
 * @param orbit - The visited points, start first
 * @param size - The plot's side in SVG units
 * @param minExtent - The least the frame may span either way from the origin
 * @returns The dots, and the frame they were placed in
 */
export function orbitToPlot(
  orbit: readonly ComplexNumber[],
  size: number,
  minExtent: number = NEWTON_PLOT_EXTENT,
): OrbitPlotGeometry {
  const half = size / 2;
  const margin = size * ORBIT_MARGIN_SHARE;
  const usable = Math.max(0, half - margin);

  // A minimum that is not positive has no scale to give: fall back to the
  // unit frame rather than divide by it.
  const least = minExtent > 0 ? minExtent : NEWTON_PLOT_EXTENT;

  const furthest = orbit.reduce(
    (most, point) =>
      Math.max(most, Math.hypot(drawable(point.real), drawable(point.imaginary))),
    0,
  );
  const extent = Math.min(
    Math.max(furthest, least),
    least * ORBIT_MAX_EXTENT_FACTOR,
  );
  const scale = usable / extent;
  const origin: PlotPoint = { x: half, y: half };
  const low = margin;
  const high = size - margin;

  return {
    points: orbit.map((point) => ({
      x: clampToPlot(
        origin.x + drawable(point.real) * scale,
        low,
        Math.max(low, high),
      ),
      y: clampToPlot(
        origin.y - drawable(point.imaginary) * scale,
        low,
        Math.max(low, high),
      ),
    })),
    scale,
    origin,
    extent,
    size,
  };
}

/**
 * How much of the plane the plot shows for a fractal, before the orbit is read.
 * @param fractalId - The `FRACTAL_TYPES` id on the canvas
 * @returns The least extent the frame may have, in units of the plane
 */
export function orbitMinExtent(fractalId: string): number {
  return fractalId === "newton" ? NEWTON_PLOT_EXTENT : ORBIT_ESCAPE_RADIUS;
}

/**
 * Whether a fractal is drawn by escape at the radius the plot draws.
 *
 * The escape-time kinds that leave at a radius of 2 -- every kind here but
 * Newton, the Magnet, Nova, the Sine set, the Cosine set and the Sine of z
 * squared set -- get the plot's circle of 2 to show what "gone" means.
 * Newton's method is not an escape-time set — its orbits converge on the cube
 * roots of 1 — so it has no circle at all. The Magnet's orbits do leave, but
 * at 100 rather than 2 (they
 * wander out to about 4 and are squared away from there), so the circle of 2
 * would sit inside the wandering rather than at the boundary of the picture
 * and it gets none either; its frame is still the escape-time frame, which is
 * the scale its wandering happens at.
 * Nova's orbits settle on a point of the plane and only leave past a million,
 * so a circle of 2 would mean nothing there either, and it too keeps the
 * escape-time frame. The Sine set's orbits leave by height, not by radius: an
 * orbit is gone once it is more than 20 off the real axis, so a circle of 2
 * would sit inside orbits that stay, and it keeps the escape-time frame too.
 * So does the Cosine set, for the same reason. The Sine of z squared set
 * leaves by the height of z's square rather than by radius, so it gets no
 * circle either and keeps the same frame.
 * @param fractalId - The `FRACTAL_TYPES` id on the canvas
 * @returns True when the plot should show the escape circle
 */
export function hasEscapeCircle(fractalId: string): boolean {
  return (
    fractalId !== "newton" &&
    fractalId !== "magnet" &&
    fractalId !== "nova" &&
    fractalId !== "sine" &&
    fractalId !== "cosine" &&
    fractalId !== "sin-z-squared"
  );
}

/**
 * The colour of one dot of the plot.
 *
 * The dots run through the picture's own palette, one dot to the next, using
 * the mapping the renderer paints with: the same colours a visitor sees on the
 * canvas, spread across the orbit rather than across the iteration cap, so a
 * sixty-step walk shows the whole scheme instead of its first fifteenth.
 * @param step - The dot's index in the orbit, 0 for the start
 * @param points - How many dots there are, which the palette is spread over
 * @param scheme - The colour scheme the picture is drawn in
 * @param options - Reverse and shift of that scheme, or nothing for the scheme
 *   as it is
 * @returns An `rgb()` value
 */
export function orbitStepColour(
  step: number,
  points: number,
  scheme: ColorScheme,
  options?: ColorOptions,
): string {
  // The count is of dots and not of steps, so the last dot sits just short of
  // the palette's end: a step count as the denominator would put it exactly at
  // the cap, which the mapping paints black, and the dot that flew off is the
  // last one worth seeing.
  return colourCss(
    mapIterationsToColor(step, Math.max(points, 1), scheme, options),
  );
}

/** How many steps an orbit of this many points took. */
export function orbitSteps(orbit: readonly ComplexNumber[]): number {
  return Math.max(orbit.length - 1, 0);
}

/**
 * What the plot is, for a reader who cannot see it.
 *
 * The same words the probe's Orbit row uses, in one sentence, so a screen
 * reader gets the path's length and its ending rather than a list of dots. A
 * plot that stopped before the orbit did says so: the window is sixty steps and
 * an orbit can run for hundreds, so "stays inside" would be a claim about steps
 * that were never walked.
 * @param fractalId - The `FRACTAL_TYPES` id on the canvas
 * @param info - What the point's orbit did over the whole cap
 * @param steps - How many steps the plot actually drew
 * @returns One line, e.g. "Orbit of the point, 7 steps, escaped"
 */
export function describeOrbit(
  fractalId: string,
  info: EscapeInfo,
  steps: number,
): string {
  if (fractalId === "newton") {
    // Newton's orbits settle rather than escape; the card counts the roots
    // from 1 where the kind counts them from 0.
    return info.root === undefined
      ? `Orbit of the point, ${steps} steps, never settles`
      : `Orbit of the point, ${info.steps} steps, settles on root ${info.root + 1}`;
  }

  if (fractalId === "nova") {
    // Nova's orbits end by settling or, rarely, by leaving. The window is
    // sixty steps, and a slow one can still be moving at the end of it.
    if (!info.escaped) {
      return `Orbit of the point, ${steps} steps, never settles`;
    }
    if (info.steps > steps) {
      return `Orbit of the point, first ${steps} steps, still moving`;
    }

    return info.settled
      ? `Orbit of the point, ${info.steps} steps, settles`
      : `Orbit of the point, ${info.steps} steps, escaped`;
  }

  if (info.escaped && info.steps <= steps) {
    return `Orbit of the point, ${info.steps} steps, escaped`;
  }

  return info.steps > steps
    ? `Orbit of the point, first ${steps} steps, stays inside`
    : `Orbit of the point, ${info.steps} steps, stays inside`;
}

/** The media query the Play control is held back by. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Watch for the reader's motion preference changing.
 * @param onChange - Called when it does
 * @returns A function that stops watching
 */
export function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);

  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the reader has asked for less motion.
 *
 * The Play control is off unless it is asked for, and it is disabled entirely
 * here: one step at a time is still a moving picture, and the orbit is drawn
 * whole without it.
 * @returns True when `prefers-reduced-motion: reduce` matches
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
