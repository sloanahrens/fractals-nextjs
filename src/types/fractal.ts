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
}

export interface FractalConfig {
  bounds: FractalBounds;
  maxIterations: number;
  width: number;
  height: number;
  colorScheme: ColorScheme;
}

export interface RenderPoint {
  x: number;
  y: number;
  iterations: number;
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
