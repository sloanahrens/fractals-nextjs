import { describe, expect, it } from "vitest";

import { mapIterationsToColor } from "../colorMapping";
import { resolveFractalKind } from "../fractalTypes";
import {
  calculateZoomBounds,
  mandelbrotKind,
  pixelToComplex,
} from "../mandelbrot";
import {
  colourRgbaRows,
  countRgbaRows,
  renderRgba,
  renderRgbaRows,
} from "../renderRgba";

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

describe("the counting and colouring steps", () => {
  const WIDTH = 12;
  const HEIGHT = 9;

  it("counts every pixel's point, in row order, exactly as the kind answers", () => {
    const kind = resolveFractalKind("julia", "Douady rabbit");
    const counts = new Float64Array(WIDTH * HEIGHT);

    countRgbaRows(counts, 0, HEIGHT, BOUNDS, WIDTH, HEIGHT, 90, kind, true);

    let index = 0;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const point = pixelToComplex(x, y, WIDTH, HEIGHT, BOUNDS);
        // The count is the kind's own number, unrounded: a Float64Array holds
        // it as it came, which is what makes a picture drawn from counts the
        // picture drawn in one pass.
        expect(counts[index]).toBe(kind.iterations(point, 90, true));
        index++;
      }
    }
  });

  it("counts one row into the start of the buffer, as the rows are asked for", () => {
    const wholePicture = new Float64Array(WIDTH * HEIGHT);
    const oneRow = new Float64Array(WIDTH);

    countRgbaRows(
      wholePicture,
      0,
      HEIGHT,
      BOUNDS,
      WIDTH,
      HEIGHT,
      80,
      mandelbrotKind,
    );
    countRgbaRows(oneRow, 3, 4, BOUNDS, WIDTH, HEIGHT, 80, mandelbrotKind);

    expect([...oneRow]).toEqual([
      ...wholePicture.subarray(3 * WIDTH, 4 * WIDTH),
    ]);
  });

  it("colours the counts it is given, and nothing else", () => {
    const kind = resolveFractalKind("burning-ship", "");
    const counts = new Float64Array(WIDTH * HEIGHT);
    const out = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

    countRgbaRows(counts, 0, HEIGHT, BOUNDS, WIDTH, HEIGHT, 70, kind, true);
    colourRgbaRows(out, counts, 0, HEIGHT, WIDTH, 70, "ocean");

    // The counts are untouched by the colouring, so the same counts may be
    // coloured again in another scheme.
    const before = [...counts];
    let index = 0;
    for (let i = 0; i < counts.length; i++) {
      const expected = mapIterationsToColor(counts[i], 70, "ocean");
      expect([...out.subarray(index, index + 4)]).toEqual([
        expected.r,
        expected.g,
        expected.b,
        255,
      ]);
      index += 4;
    }
    expect([...counts]).toEqual(before);
  });

  it("makes the one-pass picture, and renderRgba's, for every fractal", () => {
    // Newton's count packs a root and a shade into one number, so it is the
    // one a count buffer that rounded would change: it is here to be sure the
    // counts are the kind's own numbers and not a copy of them.
    const KINDS = [
      mandelbrotKind,
      resolveFractalKind("julia", "Dendrite"),
      resolveFractalKind("burning-ship", ""),
      resolveFractalKind("tricorn", ""),
      resolveFractalKind("multibrot", "4"),
      resolveFractalKind("newton", ""),
    ];

    for (const kind of KINDS) {
      const counts = new Float64Array(WIDTH * HEIGHT);
      const apart = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

      countRgbaRows(counts, 0, HEIGHT, BOUNDS, WIDTH, HEIGHT, 100, kind, true);
      colourRgbaRows(apart, counts, 0, HEIGHT, WIDTH, 100, "fire");

      let index = 0;
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const point = pixelToComplex(x, y, WIDTH, HEIGHT, BOUNDS);
          const color = mapIterationsToColor(
            kind.iterations(point, 100, true),
            100,
            "fire",
          );

          expect([...apart.subarray(index, index + 4)]).toEqual([
            ...new Uint8ClampedArray([color.r, color.g, color.b]),
            255,
          ]);
          index += 4;
        }
      }

      expect([...apart]).toEqual([
        ...renderRgba(BOUNDS, WIDTH, HEIGHT, 100, "fire", kind, true),
      ]);
    }
  });
});

describe("the scheme's own settings through the pipeline", () => {
  const WIDTH = 12;
  const HEIGHT = 9;
  const KINDS = [
    mandelbrotKind,
    resolveFractalKind("julia", "Dendrite"),
    resolveFractalKind("burning-ship", ""),
    resolveFractalKind("tricorn", ""),
    resolveFractalKind("multibrot", "4"),
    resolveFractalKind("newton", ""),
  ];
  const OPTIONS = [
    {},
    { reverse: true },
    { shift: 0.25 },
    { reverse: true, shift: 0.5 },
  ];

  it("draws the very picture it always did when asked for no settings", () => {
    for (const kind of KINDS) {
      for (const scheme of ["classic", "fire", "rainbow"] as const) {
        const plain = renderRgba(BOUNDS, WIDTH, HEIGHT, 90, scheme, kind);

        expect([
          ...renderRgba(BOUNDS, WIDTH, HEIGHT, 90, scheme, kind, true, {}),
        ]).toEqual([...plain]);
        expect([
          ...renderRgba(BOUNDS, WIDTH, HEIGHT, 90, scheme, kind, true, {
            reverse: false,
            shift: 0,
          }),
        ]).toEqual([...plain]);
      }
    }
  });

  it("colours each count through the mapping with the same settings", () => {
    for (const kind of KINDS) {
      for (const options of OPTIONS) {
        const counts = new Float64Array(WIDTH * HEIGHT);
        const out = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

        countRgbaRows(counts, 0, HEIGHT, BOUNDS, WIDTH, HEIGHT, 90, kind, true);
        colourRgbaRows(out, counts, 0, HEIGHT, WIDTH, 90, "fire", options);

        let index = 0;
        for (let i = 0; i < counts.length; i++) {
          const expected = mapIterationsToColor(
            counts[i],
            90,
            "fire",
            options,
          );
          expect([...out.subarray(index, index + 4)]).toEqual([
            ...new Uint8ClampedArray([expected.r, expected.g, expected.b]),
            255,
          ]);
          index += 4;
        }
      }
    }
  });

  it("makes the one-pass picture again when the settings are asked for once", () => {
    // The settings colour the picture without touching a count, so the rows
    // drawn one at a time and the picture drawn whole are the same pixels
    // whichever pair is asked for — which is what lets a colour change repaint
    // from kept counts.
    for (const kind of KINDS) {
      for (const options of OPTIONS) {
        const whole = renderRgba(
          BOUNDS,
          WIDTH,
          HEIGHT,
          90,
          "ocean",
          kind,
          true,
          options,
        );
        const rows = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

        for (let y = 0; y < HEIGHT; y++) {
          renderRgbaRows(
            rows.subarray(y * WIDTH * 4, (y + 1) * WIDTH * 4),
            y,
            y + 1,
            BOUNDS,
            WIDTH,
            HEIGHT,
            90,
            "ocean",
            kind,
            true,
            options,
          );
        }

        expect([...rows]).toEqual([...whole]);
      }
    }
  });
});
