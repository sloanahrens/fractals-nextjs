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
import { tricornKind } from "./tricorn";

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
  { id: "tricorn", label: "Tricorn" },
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
 * @returns Its variant descriptor; null for every fractal but Julia and for any id this build does not know
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
 * the Mandelbrot set, the Burning Ship and the Tricorn those are the same
 * thing. Julia is a family rather than a picture, so the choice carries a constant as well — one
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
  if (typeId === "tricorn") return tricornKind;
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
 * the origin, around -0.45 by -0.5, at the size that holds the whole of it, and
 * the Tricorn is turned onto itself by 120 degrees about the origin.
 * @param typeId - Id of the fractal to frame
 * @returns The centre and zoom that fractal opens on
 */
export function defaultViewFor(typeId: string): FractalDefaultView {
  if (typeId === "julia") return { centerX: 0, centerY: 0, zoom: 1 };

  if (typeId === "burning-ship") {
    return { centerX: -0.45, centerY: -0.5, zoom: 1 };
  }

  // The Tricorn's three arms point to -2 and to 1 +- 1.73i, the left tip turned
  // by 120 degrees each way, so the set maps onto itself about the origin and
  // the origin frames all three arms alike. Zoom 1 is the widest view the
  // explorer has (4 by 3, x from -2 to 2, y from -1.5 to 1.5): the left arm and
  // the body are whole and the other two arms run off the top and bottom edges,
  // losing the last 0.23 of their thin tips. Chosen from renders at 400x300 of
  // (0, 0) and (-0.25, 0), both at zoom 1: the second moved the left tip off
  // the frame's edge and no more of the others in, at the cost of the symmetry,
  // so the centre stays on the origin.
  if (typeId === "tricorn") return { centerX: 0, centerY: 0, zoom: 1 };

  return { centerX: -0.75, centerY: 0, zoom: 1 };
}
