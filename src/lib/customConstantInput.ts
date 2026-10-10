import {
  customConstantName,
  isJuliaConstantName,
  JULIA_CONSTANTS,
} from "./julia";

/**
 * What the Custom Julia constant fields make of the two boxes
 *
 * The page keeps a constant as a name, and a custom one is `custom:<re>,<im>`.
 * The two fields hold what the user typed, and this is the one step between the
 * text and the name: either the name to hand the constant handler, or the
 * sentence that says why the text is not one. The handler is not called for the
 * second answer, so the picture on screen stays the last one that was valid.
 */

/**
 * The value the Julia constant select shows while the constant is a custom one.
 * Not a constant's name: no named constant is spelled this way and neither is a
 * custom name, so the page can tell a pick of Custom from a pick of a constant.
 */
export const CUSTOM_OPTION_VALUE = "custom-option";

/** The label of that option. */
export const CUSTOM_OPTION_LABEL = "Custom";

/** Either the constant's name, or why the two boxes do not give one. */
export type CustomConstantInput = { constant: string } | { error: string };

/**
 * A number as the fields accept it: a plain decimal, optionally signed. No
 * exponent, and no comma — the name a constant is stored under cannot carry
 * either, and a box that read `1e-1` as 0.1 would show a different text from
 * the one its link holds.
 */
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** A comma where a decimal point goes, as `0,5` — common enough to name. */
const COMMA_DECIMAL_PATTERN = /^[+-]?\d*,\d+$/;

/**
 * The reason a box cannot be read, or null when it holds a number in range
 *
 * @param label - The name of the box, which the sentence starts with
 * @param text - Exactly what is in the box
 */
function problemWith(label: string, text: string): string | null {
  const trimmed = text.trim();

  if (trimmed === "") return `${label} is empty. Enter a number from -2 to 2.`;

  if (COMMA_DECIMAL_PATTERN.test(trimmed)) {
    return `${label} must use a point, not a comma, as the decimal separator.`;
  }

  if (!DECIMAL_PATTERN.test(trimmed)) {
    return `${label} must be a plain number from -2 to 2, like 0.25.`;
  }

  if (customConstantName(Number(trimmed), 0) === null) {
    return `${label} must be between -2 and 2.`;
  }

  return null;
}

/**
 * The constant two typed boxes name, or the reason they name none
 *
 * The real box is judged first, so a pair that is wrong twice is reported once
 * and the user fixes it in order. Surrounding spaces are not part of a number.
 *
 * @param realText - Exactly what is in the Real box
 * @param imaginaryText - Exactly what is in the Imaginary box
 * @returns The `custom:<re>,<im>` name, or the message to show
 */
export function parseCustomConstantInput(
  realText: string,
  imaginaryText: string,
): CustomConstantInput {
  const problem =
    problemWith("Real", realText) ?? problemWith("Imaginary", imaginaryText);
  if (problem !== null) return { error: problem };

  const name = customConstantName(
    Number(realText.trim()),
    Number(imaginaryText.trim()),
  );

  // Both parts passed the range check above, so a name exists; the check is the
  // type's, not a case.
  if (name === null) return { error: "Enter two numbers from -2 to 2." };

  return { constant: name };
}

/**
 * Whether a constant's name is a custom one: readable, and not one of the named
 * four. This is what makes the select show Custom and the fields appear.
 */
export function isCustomJuliaConstant(name: string): boolean {
  return (
    isJuliaConstantName(name) &&
    !JULIA_CONSTANTS.some((constant) => constant.name === name)
  );
}
