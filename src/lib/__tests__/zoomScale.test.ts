import { describe, expect, it } from "vitest";

import { MAX_ZOOM, MIN_ZOOM } from "../mandelbrot";
import { formatCoordinate, sliderToZoom, zoomToSlider } from "../zoomScale";

describe("sliderToZoom", () => {
  it("puts the full view at the left end and the deepest zoom at the right", () => {
    expect(sliderToZoom(0)).toBe(MIN_ZOOM);
    expect(sliderToZoom(1)).toBe(MAX_ZOOM);
  });

  it("puts a hundredfold zoom at the middle of the travel", () => {
    expect(sliderToZoom(0.5)).toBeCloseTo(100, 10);
  });

  it("makes each quarter of the travel the same zoom ratio", () => {
    // Four equal steps of a decade each, so every one is a tenfold zoom.
    expect(sliderToZoom(0.25)).toBeCloseTo(10, 10);
    expect(sliderToZoom(0.75)).toBeCloseTo(1000, 10);
  });

  it("clamps a position outside the slider to its ends", () => {
    expect(sliderToZoom(-0.5)).toBe(MIN_ZOOM);
    expect(sliderToZoom(1.5)).toBe(MAX_ZOOM);
  });
});

describe("zoomToSlider", () => {
  it("is the inverse of sliderToZoom", () => {
    for (let t = 0; t <= 1; t += 0.01) {
      expect(zoomToSlider(sliderToZoom(t))).toBeCloseTo(t, 9);
    }
    expect(zoomToSlider(sliderToZoom(0.123456789))).toBeCloseTo(0.123456789, 9);
  });

  it("maps a zoom between the ends to a proportionally placed position", () => {
    expect(zoomToSlider(10)).toBeCloseTo(0.25, 10);
    expect(zoomToSlider(100)).toBeCloseTo(0.5, 10);
    expect(zoomToSlider(1000)).toBeCloseTo(0.75, 10);
  });

  it("pins a zoom outside the slider's range to the end it lies beyond", () => {
    expect(zoomToSlider(0.5)).toBe(0);
    expect(zoomToSlider(1e9)).toBe(1);
  });

  it("reads a zoom with no slider position as the left end", () => {
    expect(zoomToSlider(0)).toBe(0);
    expect(zoomToSlider(-4)).toBe(0);
    expect(zoomToSlider(NaN)).toBe(0);
  });
});

describe("formatCoordinate", () => {
  it("shortens the floats the coordinate boxes used to print in full", () => {
    expect(formatCoordinate(0.09285714285714286)).toBe("0.0928571");
    expect(formatCoordinate(-1.8965650826446265)).toBe("-1.89657");
  });

  it("drops trailing zeros rather than padding to six digits", () => {
    expect(formatCoordinate(-0.75)).toBe("-0.75");
    expect(formatCoordinate(0)).toBe("0");
    expect(formatCoordinate(1)).toBe("1");
    expect(formatCoordinate(-2.5)).toBe("-2.5");
  });

  it("keeps an exponent for magnitudes too small for plain digits", () => {
    expect(formatCoordinate(1e-7)).toBe("1e-7");
    expect(formatCoordinate(1.2345678e8)).toBe("1.23457e+8");
  });

  it("passes through a value that has no finite text", () => {
    expect(formatCoordinate(NaN)).toBe("NaN");
    expect(formatCoordinate(Infinity)).toBe("Infinity");
  });
});
