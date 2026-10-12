import { describe, expect, it } from "vitest";

import {
  getAvailableColorSchemes,
  mapIterationsToColor,
  mapPositionToColor,
} from "../colorMapping";
import type { ColorOptions, ColorScheme } from "../../types/fractal";

const SCHEMES: ColorScheme[] = [
  "classic",
  "fire",
  "ocean",
  "rainbow",
  "grayscale",
];

describe("mapIterationsToColor", () => {
  it("paints points that never escaped black", () => {
    for (const scheme of SCHEMES) {
      expect(mapIterationsToColor(100, 100, scheme)).toEqual({
        r: 0,
        g: 0,
        b: 0,
      });
      // A smooth count can overshoot the cap; those are inside the set too.
      expect(mapIterationsToColor(100.5, 100, scheme)).toEqual({
        r: 0,
        g: 0,
        b: 0,
      });
    }
  });

  it("keeps every channel an integer inside 0-255 across every scheme", () => {
    for (const scheme of SCHEMES) {
      for (let iterations = 0; iterations < 100; iterations++) {
        const { r, g, b } = mapIterationsToColor(iterations, 100, scheme);
        for (const channel of [r, g, b]) {
          expect(Number.isInteger(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("ramps grayscale linearly from black to near-white", () => {
    expect(mapIterationsToColor(0, 100, "grayscale")).toEqual({
      r: 0,
      g: 0,
      b: 0,
    });
    expect(mapIterationsToColor(50, 100, "grayscale")).toEqual({
      r: 127,
      g: 127,
      b: 127,
    });
    expect(mapIterationsToColor(99, 100, "grayscale")).toEqual({
      r: 252,
      g: 252,
      b: 252,
    });
  });

  it("walks fire from black through red and orange to white", () => {
    expect(mapIterationsToColor(0, 100, "fire")).toEqual({ r: 0, g: 0, b: 0 });
    // t = 0.3, still in the red-to-orange ramp.
    expect(mapIterationsToColor(30, 100, "fire")).toEqual({
      r: 255,
      g: 32,
      b: 0,
    });
    // t = 0.6, orange on the way to white.
    expect(mapIterationsToColor(60, 100, "fire")).toEqual({
      r: 255,
      g: 201,
      b: 101,
    });
    // t = 0.8, the white-hot end.
    expect(mapIterationsToColor(80, 100, "fire")).toEqual({
      r: 255,
      g: 255,
      b: 255,
    });
  });

  it("ramps ocean from deep blue to white", () => {
    expect(mapIterationsToColor(0, 1000, "ocean")).toEqual({ r: 0, g: 0, b: 76 });
    expect(mapIterationsToColor(500, 1000, "ocean")).toEqual({
      r: 31,
      g: 90,
      b: 165,
    });
  });

  it("hits the primary colours at the rainbow hue stops", () => {
    expect(mapIterationsToColor(0, 300, "rainbow")).toEqual({ r: 255, g: 0, b: 0 });
    expect(mapIterationsToColor(100, 300, "rainbow")).toEqual({
      r: 0,
      g: 255,
      b: 0,
    });
    expect(mapIterationsToColor(200, 300, "rainbow")).toEqual({
      r: 0,
      g: 0,
      b: 255,
    });
  });

  it("distinguishes the schemes from one another", () => {
    // A regression that wired every scheme to the same ramp would show up here.
    const at = SCHEMES.map((scheme) => mapIterationsToColor(50, 100, scheme));
    expect(new Set(at.map((c) => `${c.r},${c.g},${c.b}`)).size).toBe(SCHEMES.length);
  });

  it("falls back to the classic ramp for an unknown scheme", () => {
    expect(mapIterationsToColor(50, 100, "plasma" as ColorScheme)).toEqual(
      mapIterationsToColor(50, 100, "classic"),
    );
  });

  it("defaults to the classic ramp", () => {
    expect(mapIterationsToColor(50, 100)).toEqual(
      mapIterationsToColor(50, 100, "classic"),
    );
  });
});

describe("mapIterationsToColor: the scheme's own settings", () => {
  /** Counts, including ones whose fraction is exact, so a shifted position can
   * be asked for again as a count of its own without rounding. */
  const COUNTS = [0, 1, 7.25, 25, 33, 50, 75, 99.5];

  it("paints the scheme's own colours when asked for nothing", () => {
    for (const scheme of SCHEMES) {
      for (const iterations of COUNTS) {
        expect(mapIterationsToColor(iterations, 100, scheme, {})).toEqual(
          mapIterationsToColor(iterations, 100, scheme),
        );
        expect(
          mapIterationsToColor(iterations, 100, scheme, {
            reverse: false,
            shift: 0,
          }),
        ).toEqual(mapIterationsToColor(iterations, 100, scheme));
      }
    }
  });

  it("reverses by painting the place 1 - t", () => {
    for (const scheme of SCHEMES) {
      for (const iterations of [1, 7.25, 25, 50, 75, 99.5]) {
        const t = iterations / 100;
        expect(
          mapIterationsToColor(iterations, 100, scheme, { reverse: true }),
        ).toEqual(mapIterationsToColor(1 - t, 1, scheme));
      }
    }
  });

  it("shifts by painting the place t + shift, a whole turn round", () => {
    for (const scheme of SCHEMES) {
      // A quarter and a half are exact, and the sums land on exact positions,
      // so each one can be asked for again as a count of its own.
      expect(
        mapIterationsToColor(25, 100, scheme, { shift: 0.25 }),
      ).toEqual(mapIterationsToColor(50, 100, scheme));
      expect(
        mapIterationsToColor(50, 100, scheme, { shift: 0.25 }),
      ).toEqual(mapIterationsToColor(75, 100, scheme));
      // Past the end of the palette: the walk starts again at its beginning.
      expect(
        mapIterationsToColor(75, 100, scheme, { shift: 0.5 }),
      ).toEqual(mapIterationsToColor(25, 100, scheme));
      // A whole turn is the place it started from.
      expect(
        mapIterationsToColor(25, 100, scheme, { shift: 1 }),
      ).toEqual(mapIterationsToColor(25, 100, scheme));
    }
  });

  it("reverses and then shifts, which is not the other way round", () => {
    for (const scheme of SCHEMES) {
      const both = mapIterationsToColor(25, 100, scheme, {
        reverse: true,
        shift: 0.25,
      });

      // t = 0.25, reversed to 0.75, shifted to exactly one whole turn, which
      // is the palette's start. Shifting first would have given 0.5 instead.
      expect(both).toEqual(mapIterationsToColor(0, 100, scheme));
      expect(both).not.toEqual(mapIterationsToColor(50, 100, scheme));
    }
  });

  it("leaves a point that never escaped black whatever the settings", () => {
    for (const scheme of SCHEMES) {
      for (const options of [
        {},
        { reverse: true },
        { shift: 0.25 },
        { reverse: true, shift: 0.5 },
      ]) {
        expect(mapIterationsToColor(100, 100, scheme, options)).toEqual({
          r: 0,
          g: 0,
          b: 0,
        });
        // A smooth count can overshoot the cap; those are inside the set too.
        expect(mapIterationsToColor(100.5, 100, scheme, options)).toEqual({
          r: 0,
          g: 0,
          b: 0,
        });
      }
    }
  });

  it("keeps every channel a whole number inside 0-255 under both settings", () => {
    for (const scheme of SCHEMES) {
      for (const options of [
        { reverse: true },
        { shift: 0.37 },
        { reverse: true, shift: 0.99 },
      ]) {
        for (let iterations = 0; iterations < 100; iterations++) {
          const { r, g, b } = mapIterationsToColor(
            iterations,
            100,
            scheme,
            options,
          );
          for (const channel of [r, g, b]) {
            expect(Number.isInteger(channel)).toBe(true);
            expect(channel).toBeGreaterThanOrEqual(0);
            expect(channel).toBeLessThanOrEqual(255);
          }
        }
      }
    }
  });
});

describe("mapPositionToColor", () => {
  const OPTION_PAIRS: (ColorOptions | undefined)[] = [
    undefined,
    {},
    { reverse: false, shift: 0 },
    { reverse: true },
    { shift: 0.25 },
    { shift: -0.3 },
    { shift: 1.4 },
    { reverse: true, shift: 0.6 },
    { shift: Number.NaN },
  ];

  // The split is invisible to a count picture: mapIterationsToColor is the
  // black test and the division by the cap, then this function, so each count
  // goes through the very same arithmetic it always did.
  it("is mapIterationsToColor with the black test and the division taken out, byte for byte", () => {
    const cap = 240;

    for (const scheme of SCHEMES) {
      for (const options of OPTION_PAIRS) {
        for (let n = 0; n < cap; n += 1.7) {
          expect(mapPositionToColor(n / cap, scheme, options)).toEqual(
            mapIterationsToColor(n, cap, scheme, options),
          );
        }
      }
    }
  });

  it("does not know about the cap's black: a position is always a place on the palette", () => {
    // mapIterationsToColor paints n >= cap black. A position of 1 is not that;
    // it is the palette's end, which is why a trap picture holds its positions
    // short of it (TRAP_POSITION_MAX).
    expect(mapIterationsToColor(100, 100, "grayscale")).toEqual({
      r: 0,
      g: 0,
      b: 0,
    });
    expect(mapPositionToColor(1, "grayscale")).toEqual({
      r: 255,
      g: 255,
      b: 255,
    });
  });

  it("defaults to the classic scheme, as the count mapping does", () => {
    expect(mapPositionToColor(0.4)).toEqual(mapPositionToColor(0.4, "classic"));
  });
});

describe("getAvailableColorSchemes", () => {
  it("advertises every scheme the mapper understands", () => {
    const schemes = getAvailableColorSchemes();
    expect(schemes.map((scheme) => scheme.value)).toEqual(SCHEMES);
    for (const { label } of schemes) {
      expect(label).not.toBe("");
    }
  });
});
