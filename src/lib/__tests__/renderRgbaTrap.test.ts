/**
 * The trap half of the pixel pipeline (`countTrapRows`, `colourTrapRows` and the
 * optional `trap` on `renderRgbaRows` and `renderRgba`).
 *
 * A trap picture is its distances, coloured, the way a count picture is its
 * counts, coloured; these tests hold the composed function to the two steps, to
 * a per-pixel statement of the whole thing written out by hand, and to the
 * guards that make the placement of the traps safe: no fractal's opening view
 * is a flat field in any of them, and no pixel is black by accident.
 */
import { describe, expect, it } from "vitest";

import type { ColorOptions, FractalKind } from "../../types/fractal";
import {
  FEATURED_MAX_UNIFORM_SHARE,
  nearUniformShare,
  isBlankImage,
} from "../blankView";
import { mapPositionToColor } from "../colorMapping";
import {
  FRACTAL_TYPES,
  defaultVariant,
  defaultViewFor,
  fractalVariants,
  resolveFractalKind,
} from "../fractalTypes";
import {
  autoIterations,
  calculateZoomBounds,
  pixelToComplex,
} from "../mandelbrot";
import { TRAP_SHAPES, trapDistanceFor, trapPosition } from "../orbitTrap";
import {
  BYTES_PER_PIXEL,
  colourTrapRows,
  countTrapRows,
  renderRgba,
  renderRgbaRows,
} from "../renderRgba";

const WIDTH = 40;
const HEIGHT = 30;
const CAP = 120;
const BOUNDS = calculateZoomBounds(-0.4, 0.1, 1.2);

const KINDS: [string, string, FractalKind][] = FRACTAL_TYPES.flatMap(
  (type): [string, string, FractalKind][] => {
    const options = fractalVariants(type.id)?.options.map((o) => o.value);

    return (options ?? [""]).map((variant) => [
      `${type.id} ${variant}`.trim(),
      type.id,
      resolveFractalKind(type.id, variant),
    ]);
  },
);

describe("countTrapRows and colourTrapRows", () => {
  it.each(KINDS)(
    "%s: renderRgba with a trap is the distances, coloured",
    (_name, _id, kind) => {
      for (const trap of TRAP_SHAPES) {
        const distances = new Float32Array(WIDTH * HEIGHT);
        countTrapRows(
          distances,
          0,
          HEIGHT,
          BOUNDS,
          WIDTH,
          HEIGHT,
          CAP,
          kind,
          trap,
        );
        const coloured = new Uint8ClampedArray(
          WIDTH * HEIGHT * BYTES_PER_PIXEL,
        );
        colourTrapRows(coloured, distances, 0, HEIGHT, WIDTH, "fire", {
          reverse: true,
          shift: 0.2,
        });

        expect(
          Array.from(
            renderRgba(
              BOUNDS,
              WIDTH,
              HEIGHT,
              CAP,
              "fire",
              kind,
              true,
              {
                reverse: true,
                shift: 0.2,
              },
              trap,
            ),
          ),
        ).toEqual(Array.from(coloured));
      }
    },
  );

  it.each(KINDS)(
    "%s: every pixel is the palette position of its stored distance, written out by hand",
    (_name, _id, kind) => {
      const options: ColorOptions = { reverse: true, shift: 0.35 };

      for (const trap of TRAP_SHAPES) {
        const pixels = renderRgba(
          BOUNDS,
          WIDTH,
          HEIGHT,
          CAP,
          "ocean",
          kind,
          true,
          options,
          trap,
        );

        for (let y = 0; y < HEIGHT; y += 3) {
          for (let x = 0; x < WIDTH; x += 3) {
            const point = pixelToComplex(x, y, WIDTH, HEIGHT, BOUNDS);
            // Stored as a Float32, then coloured from the stored value: the one
            // rounding both the render and a repaint see.
            const stored = Math.fround(trapDistanceFor(kind, point, CAP, trap));
            const colour = mapPositionToColor(
              trapPosition(stored),
              "ocean",
              options,
            );
            const index = (y * WIDTH + x) * BYTES_PER_PIXEL;

            expect([
              pixels[index],
              pixels[index + 1],
              pixels[index + 2],
              pixels[index + 3],
            ]).toEqual([colour.r, colour.g, colour.b, 255]);
          }
        }
      }
    },
  );

  it("rows drawn separately make the picture drawn whole", () => {
    const kind = resolveFractalKind("mandelbrot", "");
    const whole = renderRgba(
      BOUNDS,
      WIDTH,
      HEIGHT,
      CAP,
      "classic",
      kind,
      true,
      undefined,
      "circle",
    );
    const pieces = new Uint8ClampedArray(whole.length);

    for (let y = 0; y < HEIGHT; y += 10) {
      const rows = new Uint8ClampedArray(10 * WIDTH * BYTES_PER_PIXEL);
      renderRgbaRows(
        rows,
        y,
        y + 10,
        BOUNDS,
        WIDTH,
        HEIGHT,
        CAP,
        "classic",
        kind,
        true,
        undefined,
        "circle",
      );
      pieces.set(rows, y * WIDTH * BYTES_PER_PIXEL);
    }

    expect(Array.from(pieces)).toEqual(Array.from(whole));
  });

  it("draws the same picture whether the count flag says smooth or not: a distance has no whole-step form", () => {
    const kind = resolveFractalKind("julia", "Dendrite");
    const smooth = renderRgba(
      BOUNDS,
      WIDTH,
      HEIGHT,
      CAP,
      "classic",
      kind,
      true,
      undefined,
      "point",
    );
    const whole = renderRgba(
      BOUNDS,
      WIDTH,
      HEIGHT,
      CAP,
      "classic",
      kind,
      false,
      undefined,
      "point",
    );

    expect(Array.from(whole)).toEqual(Array.from(smooth));
  });

  it("is a different picture from the count's, and each shape from the others", () => {
    const kind = resolveFractalKind("mandelbrot", "");
    const counts = renderRgba(BOUNDS, WIDTH, HEIGHT, CAP, "classic", kind);
    const pictures = TRAP_SHAPES.map((trap) =>
      renderRgba(
        BOUNDS,
        WIDTH,
        HEIGHT,
        CAP,
        "classic",
        kind,
        true,
        undefined,
        trap,
      ),
    );

    for (const picture of pictures) {
      expect(Array.from(picture)).not.toEqual(Array.from(counts));
    }
    expect(Array.from(pictures[0])).not.toEqual(Array.from(pictures[1]));
    expect(Array.from(pictures[1])).not.toEqual(Array.from(pictures[2]));
    expect(Array.from(pictures[0])).not.toEqual(Array.from(pictures[2]));
  });

  it("does not depend on the iteration cap for an orbit that has already ended", () => {
    // Far outside the set every orbit leaves in a few steps; a larger cap walks
    // no further, so the distances and the picture are the same.
    const kind = resolveFractalKind("mandelbrot", "");
    const far = calculateZoomBounds(3, 2, 4);

    for (const trap of TRAP_SHAPES) {
      expect(
        Array.from(
          renderRgba(far, 20, 15, 50, "classic", kind, true, undefined, trap),
        ),
      ).toEqual(
        Array.from(
          renderRgba(far, 20, 15, 900, "classic", kind, true, undefined, trap),
        ),
      );
    }
  });

  it("paints no pixel black by accident, with Reverse and Shift, in rainbow", () => {
    // Rainbow's hue is exactly 360 at the palette's end, where the HSV switch
    // has no branch and paints black. A distance of exactly 0 is common (a real
    // c lands on the real axis, the line trap's neighbourhood) and Reverse sends
    // it to the end; the band keeps it short.
    const kind = resolveFractalKind("mandelbrot", "");
    const view = calculateZoomBounds(-0.5, 0, 1);

    for (const trap of TRAP_SHAPES) {
      for (const options of [
        undefined,
        { reverse: true },
        { shift: 0.5 },
        { reverse: true, shift: 0.5 },
      ] as (ColorOptions | undefined)[]) {
        const pixels = renderRgba(
          view,
          64,
          48,
          100,
          "rainbow",
          kind,
          true,
          options,
          trap,
        );
        let black = 0;
        for (let index = 0; index < pixels.length; index += BYTES_PER_PIXEL) {
          if (pixels[index] + pixels[index + 1] + pixels[index + 2] === 0)
            black++;
        }
        expect([trap, options, black]).toEqual([trap, options, 0]);
      }
    }
  });
});

describe("the placement of the traps", () => {
  // Every fractal's opening view in each trap at 64x48 through the real
  // pipeline. A trap that passed through an attractor would make a basin one
  // flat colour; the design note chose the placements by this measure, and this
  // keeps a future change of placement honest.
  const OPENING: [string, string, FractalKind, string][] =
    FRACTAL_TYPES.flatMap((type) => {
      const variants = fractalVariants(type.id)?.options.map(
        (o) => o.value,
      ) ?? [defaultVariant(type.id)];

      return variants.map((variant): [string, string, FractalKind, string] => [
        `${type.id} ${variant}`.trim(),
        type.id,
        resolveFractalKind(type.id, variant),
        variant,
      ]);
    });

  it.each(OPENING)(
    "%s: is no flat field and not blank in any trap",
    (_name, id, kind) => {
      const view = defaultViewFor(id);
      const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);

      for (const trap of TRAP_SHAPES) {
        const pixels = renderRgba(
          bounds,
          64,
          48,
          autoIterations(view.zoom),
          "classic",
          kind,
          true,
          undefined,
          trap,
        );

        expect(isBlankImage(pixels, 64, 48)).toBe(false);
        expect(nearUniformShare(pixels, 64, 48)).toBeLessThan(
          FEATURED_MAX_UNIFORM_SHARE,
        );
      }
    },
  );
});
