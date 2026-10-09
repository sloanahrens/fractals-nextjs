import type { FractalKind } from "../types/fractal";
import { burningShipKind } from "./burningShip";
import { JULIA_CONSTANTS, createJuliaKind, parseJuliaConstant } from "./julia";
import { mandelbrotKind } from "./mandelbrot";

/**
 * A fractal the explorer offers, as the picker shows it: the id the rest of
 * the app switches on, and the label next to it.
 */
export interface FractalType {
  /** Identifier the picker selects and the renderer resolves */
  id: string;
  /** Display text for the picker */
  label: string;
}

/**
 * The fractals the picker offers, in the order it lists them. The first is the
 * one the explorer opens on.
 */
export const FRACTAL_TYPES: readonly FractalType[] = [
  { id: "mandelbrot", label: "Mandelbrot" },
  { id: "julia", label: "Julia" },
  { id: "burning-ship", label: "Burning Ship" },
];

/**
 * The formula a picker choice draws.
 *
 * The picker names a fractal and the renderer wants a {@link FractalKind}. For
 * the Mandelbrot set and the Burning Ship those are the same thing. Julia is a
 * family rather than a picture, so the choice carries a constant as well — one
 * of the named four, or a custom spelling of any other point — and a name this
 * build cannot read falls back to the first named constant instead of to a
 * blank canvas.
 * @param typeId - Id of the fractal the picker selected
 * @param juliaConstantName - Name of the Julia constant; ignored unless typeId is "julia"
 * @returns The kind to draw
 */
export function resolveFractalKind(
  typeId: string,
  juliaConstantName: string,
): FractalKind {
  if (typeId === "burning-ship") return burningShipKind;
  if (typeId !== "julia") return mandelbrotKind;

  const constant = parseJuliaConstant(juliaConstantName);

  return createJuliaKind(constant ?? JULIA_CONSTANTS[0].constant);
}

/** Where a fractal's default view sits, in the plane and in zoom. */
export interface FractalDefaultView {
  centerX: number;
  centerY: number;
  zoom: number;
}

/**
 * The view a fractal opens on.
 *
 * The fractals are pictures of different points, so none can inherit another's
 * view: the Mandelbrot set is framed around -0.75, a Julia set is symmetric
 * about the origin whatever its constant, and the ship sits below and left of
 * the origin, around -0.45 by -0.5, at the size that holds the whole of it.
 * @param typeId - Id of the fractal to frame
 * @returns The centre and zoom that fractal opens on
 */
export function defaultViewFor(typeId: string): FractalDefaultView {
  if (typeId === "julia") return { centerX: 0, centerY: 0, zoom: 1 };

  if (typeId === "burning-ship") {
    return { centerX: -0.45, centerY: -0.5, zoom: 1 };
  }

  return { centerX: -0.75, centerY: 0, zoom: 1 };
}
