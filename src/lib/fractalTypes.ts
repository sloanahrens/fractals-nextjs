import type { FractalKind } from "../types/fractal";
import { JULIA_CONSTANTS, createJuliaKind } from "./julia";
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
];

/**
 * The formula a picker choice draws.
 *
 * The picker names a fractal and the renderer wants a {@link FractalKind}. For
 * the Mandelbrot set those are the same thing. Julia is a family rather than a
 * picture, so the choice carries a constant as well, and a name this build
 * does not know falls back to the first constant instead of to a blank canvas.
 * @param typeId - Id of the fractal the picker selected
 * @param juliaConstantName - Name of the Julia constant; ignored unless typeId is "julia"
 * @returns The kind to draw
 */
export function resolveFractalKind(
  typeId: string,
  juliaConstantName: string,
): FractalKind {
  if (typeId !== "julia") return mandelbrotKind;

  const named = JULIA_CONSTANTS.find(
    (constant) => constant.name === juliaConstantName,
  );

  return createJuliaKind(named?.constant ?? JULIA_CONSTANTS[0].constant);
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
 * The two fractals are pictures of different points, so neither can inherit
 * the other's view: the Mandelbrot set is framed around -0.75, while a Julia
 * set is symmetric about the origin whatever its constant.
 * @param typeId - Id of the fractal to frame
 * @returns The centre and zoom that fractal opens on
 */
export function defaultViewFor(typeId: string): FractalDefaultView {
  if (typeId === "julia") return { centerX: 0, centerY: 0, zoom: 1 };

  return { centerX: -0.75, centerY: 0, zoom: 1 };
}
