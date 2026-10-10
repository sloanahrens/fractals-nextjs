// Core fractal types and interfaces

export interface ComplexNumber {
  real: number;
  imaginary: number;
}

export interface FractalBounds {
  minReal: number;
  maxReal: number;
  minImaginary: number;
  maxImaginary: number;
}

/**
 * What one point's orbit did, in words the colour does not carry: the Math
 * card's probe (`src/lib/mathProbe.ts`) shows this for the number under the
 * pointer, while `iterations` only ever returns the one number the renderer
 * paints.
 */
export interface EscapeInfo {
  /**
   * Steps the orbit ran, whole: the count `iterations(point, max, false)`
   * gives for an escape-time set.
   */
  steps: number;
  /**
   * Whether the orbit came to an end within the cap — it left the escape
   * radius, or, for a kind that is not an escape-time set, it reached the
   * place the formula sends points to (Newton's root). False means the orbit
   * ran the whole cap.
   */
  escaped: boolean;
  /**
   * Which outcome the point reached, for a kind that has several (Newton's
   * root, numbered from 0 as the kind numbers it). Absent when the point did
   * not reach one.
   */
  root?: number;
}

/**
 * One escape-time formula, as the renderer sees it: the whole of what a fractal
 * asks of the rendering loop, which is the iteration count for a point.
 *
 * Which point the formula iterates from, what it does with it, and any
 * parameters of its own are the kind's business. The renderer only walks
 * pixels, so a second fractal is this interface plus a registry entry, with no
 * change to the loop that draws it.
 */
export interface FractalKind {
  /** Identifier the registry looks a kind up by */
  id: string;
  /**
   * @param point - Point in the complex plane to test
   * @param maxIterations - Iteration cap for this point
   * @param smooth - Whether to return the fractional (smooth) count
   * @returns Iterations before the point escapes, or the cap if it never does
   */
  iterations(
    point: ComplexNumber,
    maxIterations: number,
    smooth: boolean,
  ): number;
  /**
   * What the orbit did over the whole cap, for a caller that wants more than
   * the one number the colour is made of.
   *
   * Optional because the renderer never asks for it: a kind from outside this
   * app still draws, and `escapeInfoFor` (`src/lib/mathProbe.ts`) reads a kind
   * without it off its count alone. Every kind this app ships has one.
   *
   * @param point - Point in the complex plane to test
   * @param maxIterations - Iteration cap for this point
   * @returns The steps it survived and how the orbit ended
   */
  escapeInfo?(point: ComplexNumber, maxIterations: number): EscapeInfo;
  /**
   * The points the orbit visits, in order, starting at the point the kind
   * starts it from: the Math card's orbit plot draws this so a visitor can
   * watch a point spiral in or fly off.
   *
   * An orbit that ends — it left the escape radius, or, for a kind that is not
   * an escape-time set, it arrived where the formula sends points (Newton's
   * root) — ends on the point that ended it, so the last dot is the one that
   * got away. An orbit still going after `maxSteps` stops there.
   *
   * Optional for the same reason as `escapeInfo`: the renderer never asks for
   * it, and `orbitFor` (`src/lib/mathProbe.ts`) answers `[point]` for a kind
   * that does not have it. Every kind this app ships has one.
   *
   * @param point - Point in the complex plane to test
   * @param maxSteps - Most steps to walk, however many the orbit would take
   * @returns The visited points, the start first
   */
  orbit?(point: ComplexNumber, maxSteps: number): ComplexNumber[];
}

export interface FractalConfig {
  bounds: FractalBounds;
  maxIterations: number;
  width: number;
  height: number;
  colorScheme: ColorScheme;
}

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export type ColorScheme =
  | "classic"
  | "fire"
  | "ocean"
  | "rainbow"
  | "grayscale";

export interface ZoomState {
  centerX: number;
  centerY: number;
  scale: number;
}

export interface PanState {
  isDragging: boolean;
  lastX: number;
  lastY: number;
}
