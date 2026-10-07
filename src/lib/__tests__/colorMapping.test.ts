import { describe, expect, it } from "vitest";

import { getAvailableColorSchemes, mapIterationsToColor } from "../colorMapping";
import type { ColorScheme } from "../../types/fractal";

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

describe("getAvailableColorSchemes", () => {
  it("advertises every scheme the mapper understands", () => {
    const schemes = getAvailableColorSchemes();
    expect(schemes.map((scheme) => scheme.value)).toEqual(SCHEMES);
    for (const { label } of schemes) {
      expect(label).not.toBe("");
    }
  });
});
