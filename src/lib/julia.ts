import type { ComplexNumber, FractalKind } from "../types/fractal";
import { escapeTimeIterations } from "./mandelbrot";

/**
 * A Julia constant with the label a picker shows for it.
 */
export interface JuliaConstant {
  /** Display text for the constant, e.g. in a picker */
  name: string;
  /** The constant c the orbit adds at every step */
  constant: ComplexNumber;
}

/**
 * Julia constants whose pictures have names: the classics a picker can offer
 * without asking the user to type a number.
 *
 * These are the colours of the fractal world, not a ranking: every one of them
 * draws a connected Julia set with recognisable structure.
 */
export const JULIA_CONSTANTS: readonly JuliaConstant[] = [
  { name: "Classic", constant: { real: -0.8, imaginary: 0.156 } },
  { name: "Dendrite", constant: { real: 0, imaginary: 1 } },
  { name: "Douady rabbit", constant: { real: -0.123, imaginary: 0.745 } },
  { name: "Siegel disk", constant: { real: -0.391, imaginary: -0.587 } },
];

/**
 * The Julia set for one constant, as a {@link FractalKind}.
 *
 * The Mandelbrot orbit with the point and the constant the other way round:
 * z starts at the point the renderer hands over instead of at 0, and the
 * constant is the one this kind was built with rather than the point itself.
 * Everything after that first step — the escape test, the iteration counting,
 * the smoothing — is the shared orbit, so the two kinds colour alike.
 *
 * The id is "julia" for every constant; which Julia a kind draws is its
 * constant, and how a parameterised kind gets registered is the picker's
 * business.
 * @param constant - The c to iterate each point against
 * @returns The kind for that constant
 */
export function createJuliaKind(constant: ComplexNumber): FractalKind {
  return {
    id: "julia",
    iterations(point, maxIterations, smooth) {
      return escapeTimeIterations(point, constant, maxIterations, smooth);
    },
  };
}
