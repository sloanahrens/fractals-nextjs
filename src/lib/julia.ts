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
 * The prefix that turns the two parts of a point into a constant's name.
 *
 * A constant is a point of the plane and the app has always carried one as a
 * name: the page's state, a saved view and a link each hold a string, and the
 * four constants above are four of those strings. This is the second spelling
 * — the named constants keep their names exactly — so a constant can be any
 * point at all without changing what a constant is stored as.
 */
export const CUSTOM_CONSTANT_PREFIX = "custom:";

/**
 * How far from zero either part of a custom constant may sit, inclusive.
 *
 * A constant is a point of the plane the picture is drawn in, and both the
 * constants above and every point of the Mandelbrot set — the map of Julia
 * constants — lie within this box about the origin. A part further out names a
 * point off that map, and the bound is also what keeps a name short enough to
 * be one.
 */
const CONSTANT_LIMIT = 2;

/** Decimal places a custom constant's parts are written with. */
const CONSTANT_DECIMALS = 6;

/**
 * The longest name {@link parseJuliaConstant} will read.
 *
 * The longest one this build writes is 26 characters — the prefix, a sign and
 * six decimals on each of the two parts — so the rest is room for the shapes a
 * hand-written name can take rather than for anything the app produces. Past
 * this a string is not a name, there is no reason to walk it, and a string
 * that long only arrives from somewhere else: a link, or a stored view.
 */
export const MAX_CUSTOM_CONSTANT_LENGTH = 40;

/** One part of a custom name: a decimal, optionally signed, no exponent. */
const CONSTANT_PART_PATTERN = "-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";

/**
 * A custom name, whole: the prefix, a part, a comma, a part.
 *
 * A part is written the way the number fields of a link are, and the anchors
 * are what make `custom:0.5,0.5x` no name rather than the point at the front
 * of it. Built from the prefix so the two spellings of that cannot drift.
 */
const CUSTOM_CONSTANT_PATTERN = new RegExp(
  `^${CUSTOM_CONSTANT_PREFIX}(${CONSTANT_PART_PATTERN}),(${CONSTANT_PART_PATTERN})$`,
);

/** Whether a part is a number a name may carry. */
function inConstantRange(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= CONSTANT_LIMIT;
}

/**
 * One part of a custom constant as its name writes it, or null when the part
 * is not one a name may carry.
 *
 * Written with {@link CONSTANT_DECIMALS} decimal places, which rounds rather
 * than truncates, so a point a hair off the grid of a millionth is written as
 * the nearest point on it — and the point a name is read back as is that one.
 * The trailing zeros come off and the result is never an exponent, so a name
 * is exactly what it looks like.
 */
function constantPartText(value: number): string | null {
  if (!inConstantRange(value)) return null;

  return value
    .toFixed(CONSTANT_DECIMALS)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

/**
 * The name for a point of the plane, or null when the point has none.
 *
 * The one way this build writes a constant that is not one of the four above.
 * A part that is not a finite number inside the range a name covers has no
 * name at all, so the answer here is either a name {@link parseJuliaConstant}
 * reads back as the same point or nothing to write.
 *
 * @param real - Real part of the point
 * @param imaginary - Imaginary part of the point
 * @returns The name, or null when the point is not one a name may carry
 */
export function customConstantName(
  real: number,
  imaginary: number,
): string | null {
  const realText = constantPartText(real);
  const imaginaryText = constantPartText(imaginary);

  if (realText === null || imaginaryText === null) return null;

  return `${CUSTOM_CONSTANT_PREFIX}${realText},${imaginaryText}`;
}

/**
 * The point a custom name stands for, or null when the string is not one.
 *
 * Everything about the spelling is checked, because everything about it can be
 * wrong: the prefix is in lower case, which is how this module writes it, the
 * whole string is within the length a name can be, both parts are numbers in
 * range, and the pattern is anchored — so `custom:0.5,0.5x` is no name, rather
 * than the point at the front of it.
 */
function customConstantIn(value: string): ComplexNumber | null {
  if (value.length > MAX_CUSTOM_CONSTANT_LENGTH) return null;

  const parts = CUSTOM_CONSTANT_PATTERN.exec(value);
  if (parts === null) return null;

  const real = Number(parts[1]);
  const imaginary = Number(parts[2]);

  if (!inConstantRange(real) || !inConstantRange(imaginary)) return null;

  return { real, imaginary };
}

/**
 * The point a Julia constant name stands for, or null.
 *
 * A name is the whole of what the app stores for a constant, so this is the
 * one place that says what one may be: one of the four above, or a custom
 * spelling of a point. Nothing is guessed and nothing is half read — a name
 * holding anything this build cannot read, from its capitalisation to the text
 * after the second number, is null — which is what lets each caller fall back
 * in its own way, the renderer to the first named constant and the link reader
 * to dropping the field.
 *
 * @param value - The name to read, from anywhere: the page's state, a saved
 *   view, a link
 * @returns The constant it names, or null when it names none
 */
export function parseJuliaConstant(
  value: string | null | undefined,
): ComplexNumber | null {
  if (typeof value !== "string") return null;

  const named = JULIA_CONSTANTS.find((constant) => constant.name === value);
  if (named !== undefined) return named.constant;

  return customConstantIn(value);
}

/**
 * Whether a string names a constant this build draws.
 *
 * The question the places that compared a name against {@link JULIA_CONSTANTS}
 * were really asking. Narrowing, so a caller that has asked it may go on
 * holding the name as a string.
 *
 * @param value - The name to judge
 * @returns True for a named constant, or for a well-formed custom one
 */
export function isJuliaConstantName(
  value: string | null | undefined,
): value is string {
  return parseJuliaConstant(value) !== null;
}

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
    escapeInfo(point, maxIterations) {
      const steps = escapeTimeIterations(
        point,
        constant,
        maxIterations,
        false,
      );

      return { steps, escaped: steps < maxIterations };
    },
  };
}
