import { describe, expect, it } from "vitest";

import {
  CUSTOM_OPTION_VALUE,
  isCustomJuliaConstant,
  parseCustomConstantInput,
} from "../customConstantInput";
import { JULIA_CONSTANTS, parseJuliaConstant } from "../julia";

describe("parseCustomConstantInput", () => {
  it("names a valid pair", () => {
    expect(parseCustomConstantInput("0.5", "-0.25")).toEqual({
      constant: "custom:0.5,-0.25",
    });
  });

  it("accepts the ends of the range, inclusive", () => {
    expect(parseCustomConstantInput("-2", "2")).toEqual({
      constant: "custom:-2,2",
    });
  });

  it("ignores spaces around either box", () => {
    expect(parseCustomConstantInput("  0.5 ", "\t-1\n")).toEqual({
      constant: "custom:0.5,-1",
    });
  });

  it("writes the name the way the link does, rounded to six decimals", () => {
    expect(parseCustomConstantInput("0.50", "0.1234567")).toEqual({
      constant: "custom:0.5,0.123457",
    });
  });

  it("returns a name the constant parser reads back as the same point", () => {
    const result = parseCustomConstantInput("-0.8", "0.156");

    expect(result).toEqual({ constant: "custom:-0.8,0.156" });
    if ("constant" in result) {
      expect(parseJuliaConstant(result.constant)).toEqual({
        real: -0.8,
        imaginary: 0.156,
      });
    }
  });

  it.each([
    ["an empty real box", "", "0.5"],
    ["an empty imaginary box", "0.5", ""],
    ["a blank box", "   ", "0.5"],
    ["text", "abc", "0.5"],
    ["exponent notation", "1e3", "0.5"],
    ["a small exponent too", "1e-1", "0.5"],
    ["a number just past the range", "2.0001", "0.5"],
    ["a negative number just past it", "0.5", "-2.0001"],
    ["a number far past it", "100", "0.5"],
    ["a comma used as the decimal separator", "0,5", "0.5"],
    ["a comma in the imaginary box", "0.5", "0,5"],
    ["two numbers in a box", "0.5 0.5", "0.5"],
    ["a bare sign", "-", "0.5"],
    ["a bare point", ".", "0.5"],
    ["Infinity", "Infinity", "0.5"],
  ])("refuses %s with a message", (_description, real, imaginary) => {
    const result = parseCustomConstantInput(real, imaginary);

    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("constant");
    if ("error" in result) expect(result.error.length).toBeGreaterThan(0);
  });

  it("names the box that is wrong", () => {
    expect(parseCustomConstantInput("", "0.5")).toEqual({
      error: expect.stringMatching(/^Real/),
    });
    expect(parseCustomConstantInput("0.5", "abc")).toEqual({
      error: expect.stringMatching(/^Imaginary/),
    });
  });

  it("tells a comma from other bad text", () => {
    const comma = parseCustomConstantInput("0,5", "0");
    const text = parseCustomConstantInput("abc", "0");

    expect(comma).toEqual({ error: expect.stringMatching(/comma/) });
    expect(text).not.toEqual(comma);
  });

  it("says out of range for a number that reads but does not fit", () => {
    expect(parseCustomConstantInput("2.0001", "0")).toEqual({
      error: expect.stringMatching(/between -2 and 2/),
    });
  });

  it("reports the real box first when both are wrong", () => {
    expect(parseCustomConstantInput("abc", "xyz")).toEqual({
      error: expect.stringMatching(/^Real/),
    });
  });
});

describe("isCustomJuliaConstant", () => {
  it("is true for a readable custom name", () => {
    expect(isCustomJuliaConstant("custom:-0.8,0.156")).toBe(true);
  });

  it("is false for each named constant", () => {
    for (const constant of JULIA_CONSTANTS) {
      expect(isCustomJuliaConstant(constant.name)).toBe(false);
    }
  });

  it("is false for a name that reads as nothing", () => {
    expect(isCustomJuliaConstant("custom:3,0")).toBe(false);
    expect(isCustomJuliaConstant("")).toBe(false);
  });

  it("does not take the select's own option value for a constant", () => {
    expect(isCustomJuliaConstant(CUSTOM_OPTION_VALUE)).toBe(false);
    expect(
      JULIA_CONSTANTS.some((constant) => constant.name === CUSTOM_OPTION_VALUE),
    ).toBe(false);
  });
});
