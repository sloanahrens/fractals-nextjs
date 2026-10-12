/**
 * `FractalRenderer` in trap mode: it stores the trap distances beside nothing
 * (one buffer at a time, counts or distances, by the mode the last finished
 * render was drawn in) and `recolour` repaints from whichever it holds.
 *
 * Held here: a repaint after a trap render is the full render of that scheme,
 * Reverse and Shift, byte for byte, for every fractal and variant and each of
 * the three shapes, and counts no orbit; a buffer of the wrong mode or shape is
 * never painted from; the distances are dropped where the counts are; and an
 * export in trap mode is its own renderer drawing the trap picture at its own
 * size, touching nothing on screen.
 */
import { describe, expect, it } from "vitest";

import type {
  ColorOptions,
  ColorScheme,
  FractalConfig,
  FractalKind,
} from "../../types/fractal";
import { FractalRenderer } from "../fractalRenderer";
import {
  FRACTAL_TYPES,
  fractalVariants,
  resolveFractalKind,
} from "../fractalTypes";
import { calculateZoomBounds, mandelbrotKind } from "../mandelbrot";
import { TRAP_SHAPES } from "../orbitTrap";
import { renderRgba } from "../renderRgba";

const SCHEMES: ColorScheme[] = [
  "classic",
  "fire",
  "ocean",
  "rainbow",
  "grayscale",
];

const WIDTH = 32;
const HEIGHT = 24;
const CAP = 90;
const BOUNDS = calculateZoomBounds(0.1, -0.05, 1.5);

function renderConfig(overrides: Partial<FractalConfig> = {}): FractalConfig {
  return {
    bounds: BOUNDS,
    maxIterations: CAP,
    width: WIDTH,
    height: HEIGHT,
    colorScheme: "classic",
    ...overrides,
  };
}

/** The smallest stand-in for a 2D canvas that FractalRenderer touches. */
function createFakeCanvas(width: number, height: number) {
  const state = {
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4),
  };

  const context = {
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: (image: { data: Uint8ClampedArray }) => {
      state.pixels.set(image.data);
    },
  };

  const canvas = {
    get width() {
      return state.width;
    },
    set width(value: number) {
      state.width = value;
      state.pixels = new Uint8ClampedArray(state.width * state.height * 4);
    },
    get height() {
      return state.height;
    },
    set height(value: number) {
      state.height = value;
      state.pixels = new Uint8ClampedArray(state.width * state.height * 4);
    },
    getContext: () => context,
  };

  return {
    element: canvas as unknown as HTMLCanvasElement,
    pixels: (): Uint8ClampedArray => state.pixels,
  };
}

/** A kind that counts how often anything asks it to walk an orbit. */
function watched(kind: FractalKind, calls: { count: number }): FractalKind {
  return {
    ...kind,
    iterations: (...args) => {
      calls.count++;
      return kind.iterations(...args);
    },
    trapDistance: kind.trapDistance
      ? (...args) => {
          calls.count++;
          return kind.trapDistance!(...args);
        }
      : undefined,
    orbit: kind.orbit
      ? (...args) => {
          calls.count++;
          return kind.orbit!(...args);
        }
      : undefined,
  };
}

const KINDS: [string, FractalKind][] = FRACTAL_TYPES.flatMap(
  (type): [string, FractalKind][] => {
    const options = fractalVariants(type.id)?.options.map((o) => o.value);

    return (options ?? [""]).map((variant) => [
      `${type.id} ${variant}`.trim(),
      resolveFractalKind(type.id, variant),
    ]);
  },
);

const OPTIONS: (ColorOptions | undefined)[] = [
  undefined,
  { reverse: true },
  { shift: 0.25 },
  { reverse: true, shift: 0.5 },
];

describe("FractalRenderer in trap mode", () => {
  it.each(KINDS)(
    "%s: a full render in trap mode is renderRgba's trap picture, byte for byte",
    async (_name, kind) => {
      for (const trap of TRAP_SHAPES) {
        const { element, pixels } = createFakeCanvas(WIDTH, HEIGHT);
        const renderer = new FractalRenderer(element, kind);

        await renderer.renderFractal(
          renderConfig({
            colorScheme: "rainbow",
            colorOptions: { shift: 0.1 },
            trap,
          }),
        );

        expect(Array.from(pixels())).toEqual(
          Array.from(
            renderRgba(
              BOUNDS,
              WIDTH,
              HEIGHT,
              CAP,
              "rainbow",
              kind,
              true,
              { shift: 0.1 },
              trap,
            ),
          ),
        );
      }
    },
  );

  it.each(KINDS)(
    "%s: recolour from the stored distances is the full render of every scheme, Reverse and Shift",
    async (_name, kind) => {
      for (const trap of TRAP_SHAPES) {
        const { element, pixels } = createFakeCanvas(WIDTH, HEIGHT);
        const renderer = new FractalRenderer(element, kind);

        await renderer.renderFractal(renderConfig({ trap }));

        for (const scheme of SCHEMES) {
          for (const options of OPTIONS) {
            expect(renderer.recolour(scheme, CAP, options, trap)).toBe(true);

            expect(Array.from(pixels())).toEqual(
              Array.from(
                renderRgba(
                  BOUNDS,
                  WIDTH,
                  HEIGHT,
                  CAP,
                  scheme,
                  kind,
                  true,
                  options,
                  trap,
                ),
              ),
            );
          }
        }
      }
    },
  );

  it("counts no orbit when it repaints a trap picture", async () => {
    const calls = { count: 0 };
    const { element } = createFakeCanvas(WIDTH, HEIGHT);
    const renderer = new FractalRenderer(
      element,
      watched(mandelbrotKind, calls),
    );

    await renderer.renderFractal(renderConfig({ trap: "point" }));
    const walked = calls.count;
    expect(walked).toBeGreaterThan(0);

    expect(renderer.recolour("fire", CAP, { reverse: true }, "point")).toBe(
      true,
    );
    expect(renderer.recolour("ocean", CAP, { shift: 0.4 }, "point")).toBe(true);

    expect(calls.count).toBe(walked);
  });

  it("asks the count nothing in trap mode, and the trap nothing in count mode", async () => {
    const trapCalls = { count: 0 };
    const trapRenderer = new FractalRenderer(
      createFakeCanvas(WIDTH, HEIGHT).element,
      {
        ...mandelbrotKind,
        iterations: () => {
          trapCalls.count++;
          return 0;
        },
      },
    );
    await trapRenderer.renderFractal(renderConfig({ trap: "line" }));
    expect(trapCalls.count).toBe(0);

    const countCalls = { count: 0 };
    const countRenderer = new FractalRenderer(
      createFakeCanvas(WIDTH, HEIGHT).element,
      {
        ...mandelbrotKind,
        trapDistance: () => {
          countCalls.count++;
          return 0;
        },
        orbit: () => {
          countCalls.count++;
          return [];
        },
      },
    );
    await countRenderer.renderFractal(renderConfig());
    expect(countCalls.count).toBe(0);
  });
});

describe("FractalRenderer recolour: which buffer it will paint from", () => {
  it("answers false for a trap picture asked for as counts, and for counts asked for as a trap", async () => {
    const trapped = new FractalRenderer(
      createFakeCanvas(WIDTH, HEIGHT).element,
      mandelbrotKind,
    );
    await trapped.renderFractal(renderConfig({ trap: "circle" }));

    // No trap named: the counts picture is asked for, and there are none.
    expect(trapped.recolour("fire", CAP)).toBe(false);
    expect(trapped.recolour("fire", CAP, { reverse: true })).toBe(false);

    const counted = new FractalRenderer(
      createFakeCanvas(WIDTH, HEIGHT).element,
      mandelbrotKind,
    );
    await counted.renderFractal(renderConfig());

    for (const trap of TRAP_SHAPES) {
      expect(counted.recolour("fire", CAP, undefined, trap)).toBe(false);
    }
    // Neither refusal painted anything or disturbed what each holds.
    expect(trapped.recolour("fire", CAP, undefined, "circle")).toBe(true);
    expect(counted.recolour("fire", CAP)).toBe(true);
  });

  it("answers false for a shape that is not the one the distances are to", async () => {
    const renderer = new FractalRenderer(
      createFakeCanvas(WIDTH, HEIGHT).element,
      mandelbrotKind,
    );
    await renderer.renderFractal(renderConfig({ trap: "line" }));

    expect(renderer.recolour("fire", CAP, undefined, "point")).toBe(false);
    expect(renderer.recolour("fire", CAP, undefined, "circle")).toBe(false);
    expect(renderer.recolour("fire", CAP, undefined, "line")).toBe(true);
  });

  it("leaves the canvas untouched when it refuses", async () => {
    const { element, pixels } = createFakeCanvas(WIDTH, HEIGHT);
    const renderer = new FractalRenderer(element, mandelbrotKind);
    await renderer.renderFractal(renderConfig({ trap: "line" }));
    const before = Array.from(pixels());

    expect(renderer.recolour("fire", CAP, { reverse: true }, "point")).toBe(
      false,
    );
    expect(renderer.recolour("fire", CAP, { reverse: true })).toBe(false);

    expect(Array.from(pixels())).toEqual(before);
  });

  it("has nothing to repaint from before its first trap render finishes", () => {
    const renderer = new FractalRenderer(
      createFakeCanvas(WIDTH, HEIGHT).element,
      mandelbrotKind,
    );

    expect(renderer.recolour("fire", CAP, undefined, "point")).toBe(false);
  });

  it("keeps nothing from a trap render that was cancelled", async () => {
    const renderer = new FractalRenderer(
      createFakeCanvas(WIDTH, HEIGHT).element,
      mandelbrotKind,
    );
    await renderer.renderFractal(renderConfig({ trap: "point" }));
    expect(renderer.recolour("ocean", CAP, undefined, "point")).toBe(true);

    renderer.cancelRender();

    expect(renderer.recolour("ocean", CAP, undefined, "point")).toBe(false);
  });

  it("drops the distances the moment another render starts, and keeps the new run's own", async () => {
    const renderer = new FractalRenderer(
      createFakeCanvas(WIDTH, HEIGHT).element,
      mandelbrotKind,
    );
    await renderer.renderFractal(renderConfig({ trap: "point" }));
    expect(renderer.recolour("fire", CAP, undefined, "point")).toBe(true);

    const replacing = renderer.renderFractal(
      renderConfig({ bounds: calculateZoomBounds(0, 0, 4), trap: "point" }),
    );
    // Mid-render there is nothing to repaint from: the caller renders in full.
    expect(renderer.recolour("ocean", CAP, undefined, "point")).toBe(false);

    await replacing;
    expect(renderer.recolour("ocean", CAP, undefined, "point")).toBe(true);
  });

  it("holds one mode at a time: a count render after a trap render has no distances left", async () => {
    const renderer = new FractalRenderer(
      createFakeCanvas(WIDTH, HEIGHT).element,
      mandelbrotKind,
    );
    await renderer.renderFractal(renderConfig({ trap: "point" }));
    await renderer.renderFractal(renderConfig());

    expect(renderer.recolour("fire", CAP, undefined, "point")).toBe(false);
    expect(renderer.recolour("fire", CAP)).toBe(true);

    // And the other way round: a trap render replaces the counts.
    await renderer.renderFractal(renderConfig({ trap: "circle" }));
    expect(renderer.recolour("fire", CAP)).toBe(false);
    expect(renderer.recolour("fire", CAP, undefined, "circle")).toBe(true);
  });

  it("keeps nothing from a preview pass, which is a different picture at fewer pixels", async () => {
    const { element, pixels } = createFakeCanvas(WIDTH, HEIGHT);
    const renderer = new FractalRenderer(element, mandelbrotKind);

    await renderer.renderFractal(
      renderConfig({ trap: "point" }),
      undefined,
      false,
    );

    expect(renderer.recolour("ocean", CAP, undefined, "point")).toBe(false);
    // The pass itself drew the trap picture, the same measure.
    expect(Array.from(pixels())).toEqual(
      Array.from(
        renderRgba(
          BOUNDS,
          WIDTH,
          HEIGHT,
          CAP,
          "classic",
          mandelbrotKind,
          false,
          undefined,
          "point",
        ),
      ),
    );
  });

  it("refuses distances that are not the canvas's own size", async () => {
    const { element } = createFakeCanvas(WIDTH, HEIGHT);
    const renderer = new FractalRenderer(element, mandelbrotKind);
    await renderer.renderFractal(renderConfig({ trap: "point" }));

    // The canvas was resized under the renderer: a repaint would scramble the
    // picture rather than shade it, so it is refused.
    element.width = WIDTH * 2;

    expect(renderer.recolour("fire", CAP, undefined, "point")).toBe(false);
  });

  it("drops the distances for a resized canvas on the next render", async () => {
    const { element } = createFakeCanvas(WIDTH, HEIGHT);
    const renderer = new FractalRenderer(element, mandelbrotKind);
    await renderer.renderFractal(renderConfig({ trap: "point" }));

    const replacing = renderer.renderFractal(
      renderConfig({ trap: "point", width: 16, height: 12 }),
    );
    expect(renderer.recolour("fire", CAP, undefined, "point")).toBe(false);
    await replacing;

    expect(renderer.recolour("fire", CAP, undefined, "point")).toBe(true);
  });
});

describe("export in trap mode", () => {
  // The page's export draws on a detached canvas with a renderer of its own, at
  // its own size and frame, from a config captured when it started: the same
  // `renderFractal` with the same `trap` field. Held here at the renderer, which
  // is the whole of what the export path adds to a render.
  it("draws the trap picture at its own size and frame, and leaves the screen's buffer alone", async () => {
    const screen = createFakeCanvas(WIDTH, HEIGHT);
    const screenRenderer = new FractalRenderer(screen.element, mandelbrotKind);
    await screenRenderer.renderFractal(renderConfig({ trap: "circle" }));
    const screenPixels = Array.from(screen.pixels());

    const exportWidth = WIDTH * 2;
    const exportHeight = HEIGHT * 2;
    const exportBounds = calculateZoomBounds(-0.7, 0.2, 3);
    const detached = createFakeCanvas(exportWidth, exportHeight);
    const exportRenderer = new FractalRenderer(
      detached.element,
      mandelbrotKind,
    );

    await exportRenderer.renderFractal({
      bounds: exportBounds,
      maxIterations: 150,
      width: exportWidth,
      height: exportHeight,
      colorScheme: "fire",
      colorOptions: { reverse: true },
      trap: "circle",
    });

    expect(Array.from(detached.pixels())).toEqual(
      Array.from(
        renderRgba(
          exportBounds,
          exportWidth,
          exportHeight,
          150,
          "fire",
          mandelbrotKind,
          true,
          { reverse: true },
          "circle",
        ),
      ),
    );
    // The screen's canvas and its stored distances are exactly as they were.
    expect(Array.from(screen.pixels())).toEqual(screenPixels);
    expect(screenRenderer.recolour("classic", CAP, undefined, "circle")).toBe(
      true,
    );
    expect(Array.from(screen.pixels())).toEqual(
      Array.from(
        renderRgba(
          BOUNDS,
          WIDTH,
          HEIGHT,
          CAP,
          "classic",
          mandelbrotKind,
          true,
          undefined,
          "circle",
        ),
      ),
    );
  });

  it("a plain export is still the count picture", async () => {
    const detached = createFakeCanvas(WIDTH, HEIGHT);
    const renderer = new FractalRenderer(detached.element, mandelbrotKind);

    await renderer.renderFractal(renderConfig());

    expect(Array.from(detached.pixels())).toEqual(
      Array.from(
        renderRgba(BOUNDS, WIDTH, HEIGHT, CAP, "classic", mandelbrotKind),
      ),
    );
  });
});
