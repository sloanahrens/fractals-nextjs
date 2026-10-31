/**
 * With trap mode off, nothing changes: the pictures the app draws for counts are
 * the bytes they were before orbit traps existed.
 *
 * The checksums below were taken from the tree at 2866a45, the commit before
 * the trap engine landed, by running `renderRgba` for each fractal's opening
 * view, so they pin the whole count pipeline (the kinds, `mapIterationsToColor`
 * now split into `mapPositionToColor`, `colourRgbaRows`) to its old output. They
 * are FNV-1a over every byte. If one of them changes the count picture changed,
 * which the trap engine must not do; a change that is wanted regenerates them
 * from a tree that is known to be right, not from this one.
 */
import { describe, expect, it } from "vitest";

import type { ColorOptions, ColorScheme } from "../../types/fractal";
import { autoIterations, calculateZoomBounds } from "../mandelbrot";
import {
  FRACTAL_TYPES,
  defaultVariant,
  defaultViewFor,
  resolveFractalKind,
} from "../fractalTypes";
import { renderRgba } from "../renderRgba";

const WIDTH = 64;
const HEIGHT = 48;

/** FNV-1a over a byte buffer, as 8 hex digits. */
function fnv1a(bytes: Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index++) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const SCHEMES: ColorScheme[] = [
  "classic",
  "fire",
  "ocean",
  "rainbow",
  "grayscale",
];

/** Reverse and shift, cycled through the fractals so each option pair is drawn. */
const OPTIONS: (ColorOptions | undefined)[] = [
  undefined,
  { reverse: true },
  { shift: 0.3 },
  { reverse: true, shift: 0.7 },
];

function pictureHash(index: number): string {
  const type = FRACTAL_TYPES[index];
  const kind = resolveFractalKind(type.id, defaultVariant(type.id));
  const view = defaultViewFor(type.id);
  const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);

  return fnv1a(
    renderRgba(
      bounds,
      WIDTH,
      HEIGHT,
      autoIterations(view.zoom),
      SCHEMES[index % SCHEMES.length],
      kind,
      true,
      OPTIONS[index % OPTIONS.length],
    ),
  );
}

/** Taken from the tree before the trap engine; see the file's comment. */
const GOLDEN: Record<string, string> = {
  mandelbrot: "41da6742",
  julia: "c36603e4",
  "burning-ship": "17088f48",
  tricorn: "5652ce57",
  multibrot: "bb1bbd33",
  newton: "bf0569eb",
  celtic: "f2bc74b7",
  "perpendicular-ship": "20d2f2ce",
  magnet: "7e1bc9a7",
  phoenix: "ba1539dc",
  nova: "815504b9",
  // The Sine set came after the trap engine, so its value is not from 2866a45:
  // it was taken from the tree that added the set (fr-tkax), once the opening
  // view had been drawn and looked at (a central disc, a chain of beads and the
  // filigree between), and it pins that picture from then on.
  sine: "c789dd4b",
  // The Cosine set, likewise not from 2866a45: its value is from the tree that
  // registered it (fr-tce2), once the opening view had been drawn and looked at
  // (two large discs meeting at the origin, smaller discs along the axis), and
  // it pins that picture from then on.
  cosine: "3be46901",
};

describe("the plain (iteration-count) picture", () => {
  it("covers the whole picker", () => {
    expect(Object.keys(GOLDEN)).toEqual(FRACTAL_TYPES.map((type) => type.id));
  });

  it.each(FRACTAL_TYPES.map((type, index) => [type.id, index] as const))(
    "%s: is the bytes it was before orbit traps",
    (id, index) => {
      expect(pictureHash(index)).toBe(GOLDEN[id]);
    },
  );
});
