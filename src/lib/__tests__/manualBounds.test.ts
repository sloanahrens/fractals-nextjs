import { describe, expect, it } from "vitest";

import {
  ASPECT_TOLERANCE,
  BASE_ASPECT,
  ManualBoundsInput,
  checkManualBounds,
  hasBaseAspect,
  readManualCoordinate,
} from "../manualBounds";
import { FractalBounds } from "../../types/fractal";

/** The four boxes as numbers, with the unreadable one written last. */
function box(overrides: Partial<ManualBoundsInput> = {}): ManualBoundsInput {
  return {
    minReal: -2,
    maxReal: 0.5,
    minImaginary: -1.25,
    maxImaginary: 1.25,
    ...overrides,
  };
}

/** A 4:3 box centred where it is, so only its shape is under test. */
function baseAspectBox(width: number, height: number): FractalBounds {
  return {
    minReal: -width / 2,
    maxReal: width / 2,
    minImaginary: -height / 2,
    maxImaginary: height / 2,
  };
}

describe("readManualCoordinate", () => {
  it("reads a number the user typed", () => {
    expect(readManualCoordinate("-1.5")).toBe(-1.5);
    expect(readManualCoordinate("0")).toBe(0);
    expect(readManualCoordinate("  2.5  ")).toBe(2.5);
    expect(readManualCoordinate("1e3")).toBe(1000);
  });

  it("reports an empty box as no number", () => {
    expect(readManualCoordinate("")).toBeNaN();
    expect(readManualCoordinate("   ")).toBeNaN();
  });

  it("reports text that is not a number as no number", () => {
    // `Number` rather than `parseFloat`, which would read "1abc" as 1 and send
    // a box the user cannot read back into the view as 1.
    expect(readManualCoordinate("abc")).toBeNaN();
    expect(readManualCoordinate("1abc")).toBeNaN();
    expect(readManualCoordinate("1,5")).toBeNaN();
  });

  it("reports a value the view cannot hold as no number", () => {
    expect(readManualCoordinate("Infinity")).toBeNaN();
    expect(readManualCoordinate("-Infinity")).toBeNaN();
    expect(readManualCoordinate("NaN")).toBeNaN();
  });
});

describe("hasBaseAspect", () => {
  it("accepts the base 4:3 shape at any size", () => {
    expect(hasBaseAspect(baseAspectBox(4, 3))).toBe(true);
    expect(hasBaseAspect(baseAspectBox(0.004, 0.003))).toBe(true);
    expect(hasBaseAspect(baseAspectBox(40000, 30000))).toBe(true);
  });

  it("accepts a 4:3 box carrying the noise of the arithmetic that built it", () => {
    // Bounds arrive from zooms, drags and coordinate round-trips, so their last
    // bits are not the same bits a multiplication by 4/3 would produce. A box
    // that differs by that much is the view's shape, not another shape.
    expect(hasBaseAspect(baseAspectBox(4 + 1e-6, 3 + 1e-6))).toBe(true);
  });

  it("rejects a box meant as another shape", () => {
    expect(hasBaseAspect(baseAspectBox(4, 4))).toBe(false);
    expect(hasBaseAspect(baseAspectBox(3, 4))).toBe(false);
    expect(hasBaseAspect(baseAspectBox(2, 1))).toBe(false);
  });

  it("rejects a box one step past the tolerance either way", () => {
    const justInside = BASE_ASPECT * (1 + ASPECT_TOLERANCE);
    const justOutside = BASE_ASPECT * (1 + 2 * ASPECT_TOLERANCE);

    expect(hasBaseAspect(baseAspectBox(justInside, 1))).toBe(true);
    expect(hasBaseAspect(baseAspectBox(justOutside, 1))).toBe(false);
  });

  it("rejects a box with no height to measure", () => {
    expect(hasBaseAspect(baseAspectBox(4, 0))).toBe(false);
  });
});

describe("checkManualBounds", () => {
  it("returns a valid box as it stands", () => {
    const values = box();
    const checked = checkManualBounds(values);

    expect(checked).toEqual({
      ok: true,
      bounds: {
        minReal: values.minReal,
        maxReal: values.maxReal,
        minImaginary: values.minImaginary,
        maxImaginary: values.maxImaginary,
      },
    });
  });

  it("returns a valid box that is not 4:3 as it stands, leaving the fit to the caller", () => {
    const checked = checkManualBounds(
      box({ minImaginary: -2, maxImaginary: 2 }),
    );

    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(hasBaseAspect(checked.bounds)).toBe(false);
  });

  it("asks for four numbers when a box is empty", () => {
    expect(checkManualBounds(box({ minReal: NaN }))).toEqual({
      ok: false,
      messages: ["Enter all four coordinates as numbers."],
    });
    expect(checkManualBounds(box({ maxImaginary: NaN }))).toEqual({
      ok: false,
      messages: ["Enter all four coordinates as numbers."],
    });
  });

  it("asks for four numbers when a box holds text", () => {
    const checked = checkManualBounds(
      box({ minReal: readManualCoordinate("abc") }),
    );

    expect(checked).toEqual({
      ok: false,
      messages: ["Enter all four coordinates as numbers."],
    });
  });

  it("does not accuse a pair while a box is unreadable", () => {
    // The imaginary pair is reversed here as well, and the message still names
    // only the value that could not be read: an order the user cannot check
    // against a box that would not read is not what is wrong with this box.
    const checked = checkManualBounds(box({ maxReal: NaN, minImaginary: 5 }));

    expect(checked).toEqual({
      ok: false,
      messages: ["Enter all four coordinates as numbers."],
    });
  });

  it("rejects two equal values, which are not one below the other", () => {
    expect(checkManualBounds(box({ minReal: 1, maxReal: 1 }))).toEqual({
      ok: false,
      messages: ["Min Real must be less than Max Real."],
    });
  });

  it("names the real pair when it runs the wrong way", () => {
    expect(checkManualBounds(box({ minReal: 2, maxReal: -2 }))).toEqual({
      ok: false,
      messages: ["Min Real must be less than Max Real."],
    });
  });

  it("names the imaginary pair when it runs the wrong way", () => {
    expect(
      checkManualBounds(box({ minImaginary: 3, maxImaginary: -3 })),
    ).toEqual({
      ok: false,
      messages: ["Min Imaginary must be less than Max Imaginary."],
    });
  });

  it("names both pairs when both run the wrong way", () => {
    expect(
      checkManualBounds(
        box({ minReal: 2, maxReal: -2, minImaginary: 3, maxImaginary: -3 }),
      ),
    ).toEqual({
      ok: false,
      messages: [
        "Min Real must be less than Max Real.",
        "Min Imaginary must be less than Max Imaginary.",
      ],
    });
  });
});
