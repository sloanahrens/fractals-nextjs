import type { FractalKind } from "../types/fractal";
import { burningShipKind } from "./burningShip";
import { isCustomJuliaConstant } from "./customConstantInput";
import {
  JULIA_CONSTANTS,
  createJuliaKind,
  isJuliaConstantName,
  parseJuliaConstant,
} from "./julia";
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

/** One choice of a fractal's variant, as a chip or a select option shows it. */
export interface FractalVariantOption {
  /** What the page holds and a link carries for this choice */
  value: string;
  /** Display text for the chip or option */
  label: string;
}

/**
 * The one setting a fractal takes beyond its view: the Julia constant for
 * Julia. The switcher's second row and the Settings select are both drawn from
 * this, so a fractal that takes a setting needs a descriptor and no new
 * controls.
 */
export interface FractalVariants {
  /** What the setting is called, as the row's caption and the select's label */
  label: string;
  /** The named choices, in the order they are offered */
  options: readonly FractalVariantOption[];
  /** Whether the setting also takes a value of the user's own (a Custom choice) */
  allowsCustom: boolean;
}

const JULIA_VARIANTS: FractalVariants = {
  label: "Julia constant",
  options: JULIA_CONSTANTS.map((constant) => ({
    value: constant.name,
    label: constant.name,
  })),
  allowsCustom: true,
};

/**
 * The setting a fractal takes, or null for a fractal that takes none.
 * @param fractalId - Id of the fractal
 * @returns Its variant descriptor; null for Mandelbrot, Burning Ship and any id this build does not know
 */
export function fractalVariants(fractalId: string): FractalVariants | null {
  return fractalId === "julia" ? JULIA_VARIANTS : null;
}

/**
 * The variant a fractal opens on: its first named choice, or "" for a fractal
 * with no variant.
 * @param fractalId - Id of the fractal
 * @returns The variant value to start from
 */
export function defaultVariant(fractalId: string): string {
  return fractalVariants(fractalId)?.options[0]?.value ?? "";
}

/**
 * Whether a value is one this fractal can be drawn with: a named choice, or for
 * a fractal that allows it, a readable custom one. False for every value of a
 * fractal with no variant.
 * @param fractalId - Id of the fractal
 * @param value - A variant value from a link, a saved view or the page
 * @returns True when the value is a variant of that fractal
 */
export function isVariantValue(
  fractalId: string,
  value: string | null | undefined,
): value is string {
  return fractalId === "julia" && isJuliaConstantName(value);
}

/**
 * Whether a value is the fractal's custom choice: readable, and not one of its
 * named options. It is what makes the select show Custom and the boxes appear.
 * @param fractalId - Id of the fractal
 * @param value - The variant on the page
 * @returns True for a custom value of a fractal that allows one
 */
export function isCustomVariant(fractalId: string, value: string): boolean {
  return (
    fractalVariants(fractalId)?.allowsCustom === true &&
    isCustomJuliaConstant(value)
  );
}

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
 * @param variant - Name of the Julia constant; ignored unless typeId is "julia"
 * @returns The kind to draw
 */
export function resolveFractalKind(
  typeId: string,
  variant: string,
): FractalKind {
  if (typeId === "burning-ship") return burningShipKind;
  if (typeId !== "julia") return mandelbrotKind;

  const constant = parseJuliaConstant(variant);

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
