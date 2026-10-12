/**
 * The two paths the page takes when the Orbit trap control or a colour control
 * moves, driven through the real renderer and the real link codec.
 *
 * The page decides in `drawCanvas`: when the link it is drawing and the link on
 * the canvas agree once the colour-only keys are taken out
 * (`linkWithoutColour`) and `recolour` answers true, it repaints; otherwise it
 * renders. The renderer keeps counts or trap distances, one buffer at a time
 * (`docs/design/orbit-traps.md`, section 2), so:
 *
 * - turning a trap on, changing its shape and turning it off are each a render
 *   of the view, because the distances being asked for are not the ones held;
 * - once a trap is on, the scheme, Reverse, Shift and every frame of colour
 *   cycling are repaints from the stored distances, byte for byte the picture a
 *   full render in those settings makes, and compute no orbit.
 */
import { describe, expect, it } from "vitest";

import type {
  ColorOptions,
  ColorScheme,
  FractalKind,
} from "../../types/fractal";
import { FractalRenderer } from "../fractalRenderer";
import { calculateZoomBounds, mandelbrotKind } from "../mandelbrot";
import { renderRgba } from "../renderRgba";
import { encodeView, linkWithoutColour, type ViewLinkState } from "../viewLink";

const WIDTH = 32;
const HEIGHT = 24;
const CAP = 90;
const BOUNDS = calculateZoomBounds(0.1, -0.05, 1.5);

/** The smallest stand-in for a 2D canvas that FractalRenderer touches. */
function createFakeCanvas(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const context = {
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: (image: { data: Uint8ClampedArray }) => {
      pixels.set(image.data);
    },
  };

  return {
    element: {
      width,
      height,
      getContext: () => context,
    } as unknown as HTMLCanvasElement,
    pixels,
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
    trapDistance: (...args) => {
      calls.count++;
      return kind.trapDistance!(...args);
    },
  };
}

const VIEW: ViewLinkState = {
  fractalType: "mandelbrot",
  centerX: 0.1,
  centerY: -0.05,
  zoomLevel: 1.5,
  colorScheme: "classic",
  autoIterationsOn: false,
  maxIterations: CAP,
  canvasWidth: 800,
  canvasHeight: 600,
};

/** The page's own question, asked of two views' links. */
const repaintable = (showing: ViewLinkState, drawing: ViewLinkState) =>
  linkWithoutColour(encodeView(showing)) ===
  linkWithoutColour(encodeView(drawing));

describe("turning a trap on, changing its shape and turning it off", () => {
  it("are each a render: the links differ, and the renderer holds the other kind of buffer", async () => {
    const { element } = createFakeCanvas(WIDTH, HEIGHT);
    const renderer = new FractalRenderer(element, mandelbrotKind);
    const config = {
      bounds: BOUNDS,
      maxIterations: CAP,
      width: WIDTH,
      height: HEIGHT,
    };

    // Off -> on: the page's link test sends it to a render...
    await renderer.renderFractal({ ...config, colorScheme: "classic" });
    expect(repaintable(VIEW, { ...VIEW, trap: "line" })).toBe(false);
    // ...and a repaint would not have worked anyway: no distances are held.
    expect(renderer.recolour("classic", CAP, undefined, "line")).toBe(false);

    // On: the distances are measured by that render, and now repaint.
    await renderer.renderFractal({
      ...config,
      colorScheme: "classic",
      trap: "line",
    });
    expect(renderer.recolour("fire", CAP, undefined, "line")).toBe(true);

    // A change of shape is a render, not a repaint.
    expect(
      repaintable({ ...VIEW, trap: "line" }, { ...VIEW, trap: "circle" }),
    ).toBe(false);
    expect(renderer.recolour("fire", CAP, undefined, "circle")).toBe(false);

    // On -> off is a render: the held distances are not counts.
    expect(repaintable({ ...VIEW, trap: "line" }, VIEW)).toBe(false);
    expect(renderer.recolour("fire", CAP)).toBe(false);
  });
});

describe("inside a trap", () => {
  const SETTINGS: [ColorScheme, ColorOptions][] = [
    ["fire", {}],
    ["classic", { reverse: true }],
    ["ocean", { shift: 0.25 }],
    ["rainbow", { reverse: true, shift: 0.5 }],
  ];

  it.each([["point"], ["line"], ["circle"]] as const)(
    "the scheme, Reverse and Shift repaint from the %s distances: the link test passes, and the picture is the full render's",
    async (trap) => {
      const calls = { count: 0 };
      const { element, pixels } = createFakeCanvas(WIDTH, HEIGHT);
      const renderer = new FractalRenderer(
        element,
        watched(mandelbrotKind, calls),
      );

      await renderer.renderFractal({
        bounds: BOUNDS,
        maxIterations: CAP,
        width: WIDTH,
        height: HEIGHT,
        colorScheme: "classic",
        trap,
      });
      const measured = calls.count;
      expect(measured).toBeGreaterThan(0);

      for (const [scheme, options] of SETTINGS) {
        expect(
          repaintable(
            { ...VIEW, trap },
            {
              ...VIEW,
              trap,
              colorScheme: scheme,
              reverse: options.reverse,
              shift: options.shift,
            },
          ),
        ).toBe(true);
        expect(renderer.recolour(scheme, CAP, options, trap)).toBe(true);

        const full = renderRgba(
          BOUNDS,
          WIDTH,
          HEIGHT,
          CAP,
          scheme,
          mandelbrotKind,
          true,
          options,
          trap,
        );
        expect(Array.from(pixels)).toEqual(Array.from(full));
      }

      // No orbit was walked by any of the repaints.
      expect(calls.count).toBe(measured);
    },
  );

  it("every frame of colour cycling repaints from the distances and counts nothing", async () => {
    const calls = { count: 0 };
    const { element, pixels } = createFakeCanvas(WIDTH, HEIGHT);
    const renderer = new FractalRenderer(
      element,
      watched(mandelbrotKind, calls),
    );

    await renderer.renderFractal({
      bounds: BOUNDS,
      maxIterations: CAP,
      width: WIDTH,
      height: HEIGHT,
      colorScheme: "rainbow",
      trap: "circle",
    });
    const measured = calls.count;

    // The cycling loop's call: the scheme, the cap, the settings with the
    // palette's current shift, and the trap the page holds.
    for (let step = 0; step < 12; step++) {
      const options = { reverse: false, shift: step / 12 };

      expect(renderer.recolour("rainbow", CAP, options, "circle")).toBe(true);
      expect(Array.from(pixels)).toEqual(
        Array.from(
          renderRgba(
            BOUNDS,
            WIDTH,
            HEIGHT,
            CAP,
            "rainbow",
            mandelbrotKind,
            true,
            options,
            "circle",
          ),
        ),
      );
    }

    expect(calls.count).toBe(measured);
  });

  it("a frame of cycling cannot paint the wrong picture over the other kind of buffer", async () => {
    const { element } = createFakeCanvas(WIDTH, HEIGHT);
    const renderer = new FractalRenderer(element, mandelbrotKind);

    await renderer.renderFractal({
      bounds: BOUNDS,
      maxIterations: CAP,
      width: WIDTH,
      height: HEIGHT,
      colorScheme: "classic",
    });

    // The page passes the trap it holds; a frame asked for a trap picture while
    // the renderer holds counts is skipped, not painted.
    expect(renderer.recolour("classic", CAP, { shift: 0.5 }, "point")).toBe(
      false,
    );
    expect(renderer.recolour("classic", CAP, { shift: 0.5 })).toBe(true);
  });
});
