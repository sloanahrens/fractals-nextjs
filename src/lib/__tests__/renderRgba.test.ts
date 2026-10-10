import { describe, expect, it } from "vitest";

import { mapIterationsToColor } from "../colorMapping";
import { resolveFractalKind } from "../fractalTypes";
import {
  calculateZoomBounds,
  mandelbrotKind,
  pixelToComplex,
} from "../mandelbrot";
import { renderRgba, renderRgbaRows } from "../renderRgba";

const BOUNDS = calculateZoomBounds(-0.75, 0, 2);

describe("renderRgba", () => {
  it("returns four bytes a pixel, row by row, all opaque", () => {
    const pixels = renderRgba(BOUNDS, 10, 6, 80, "classic", mandelbrotKind);

    expect(pixels).toBeInstanceOf(Uint8ClampedArray);
    expect(pixels.length).toBe(10 * 6 * 4);
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
  });

  it("is the iteration count of each pixel's point, coloured, written out by hand", () => {
    // The pipeline the canvas renderer ran before it was shared: a pixel's
    // corner to a point, the point to a count through the kind, the count to a
    // colour through the scheme.
    const kind = resolveFractalKind("julia", "Dendrite");
    const width = 24;
    const height = 18;
    const pixels = renderRgba(BOUNDS, width, height, 90, "fire", kind, true);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const point = pixelToComplex(x, y, width, height, BOUNDS);
        const color = mapIterationsToColor(
          kind.iterations(point, 90, true),
          90,
          "fire",
        );
        const index = (y * width + x) * 4;

        // A smooth count just under 0 is a negative channel in the mapping, and
        // an ImageData (a canvas's pixels) clamps it to 0, as this does.
        expect([...pixels.subarray(index, index + 4)]).toEqual([
          ...new Uint8ClampedArray([color.r, color.g, color.b]),
          255,
        ]);
      }
    }
  });

  it("draws smooth counts unless told otherwise", () => {
    const smooth = renderRgba(BOUNDS, 16, 12, 100, "rainbow", mandelbrotKind);
    const explicit = renderRgba(
      BOUNDS,
      16,
      12,
      100,
      "rainbow",
      mandelbrotKind,
      true,
    );
    const whole = renderRgba(
      BOUNDS,
      16,
      12,
      100,
      "rainbow",
      mandelbrotKind,
      false,
    );

    expect([...smooth]).toEqual([...explicit]);
    expect([...whole]).not.toEqual([...smooth]);
  });

  it("is a pure function of its arguments", () => {
    const a = renderRgba(BOUNDS, 20, 15, 60, "ocean", mandelbrotKind);
    const b = renderRgba(BOUNDS, 20, 15, 60, "ocean", mandelbrotKind);

    expect([...a]).toEqual([...b]);
  });
});

describe("renderRgbaRows", () => {
  it("draws rows into the start of the buffer it is given", () => {
    const whole = renderRgba(BOUNDS, 12, 9, 70, "classic", mandelbrotKind);
    const slice = new Uint8ClampedArray(12 * 3 * 4);

    renderRgbaRows(slice, 3, 6, BOUNDS, 12, 9, 70, "classic", mandelbrotKind);

    expect([...slice]).toEqual([...whole.subarray(3 * 12 * 4, 6 * 12 * 4)]);
  });

  it("makes the whole picture when drawn in slices of any height", () => {
    const whole = renderRgba(BOUNDS, 12, 9, 70, "grayscale", mandelbrotKind);
    const pieced = new Uint8ClampedArray(whole.length);

    for (let first = 0; first < 9; first += 4) {
      const end = Math.min(first + 4, 9);
      renderRgbaRows(
        pieced.subarray(first * 12 * 4, end * 12 * 4),
        first,
        end,
        BOUNDS,
        12,
        9,
        70,
        "grayscale",
        mandelbrotKind,
      );
    }

    expect([...pieced]).toEqual([...whole]);
  });

  it("draws nothing for an empty range", () => {
    const out = new Uint8ClampedArray(16);

    renderRgbaRows(out, 2, 2, BOUNDS, 4, 4, 50, "classic", mandelbrotKind);

    expect([...out]).toEqual(new Array(16).fill(0));
  });
});
