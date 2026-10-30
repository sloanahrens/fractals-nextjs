/**
 * The Math card's probe: the point under the pointer, what its orbit did and
 * the colour it is painted.
 *
 * The heart of this file is the parity check: a small view is drawn through the
 * same `renderRgba` a full render draws through, and every pixel of it is held
 * to the probe for its own point — the same step count, and the same colour,
 * byte for byte. That is what makes the card's swatch the pixel under the
 * pointer rather than a lookalike.
 */
import { describe, expect, it } from "vitest";

import { burningShipKind } from "../burningShip";
import { createJuliaKind } from "../julia";
import {
  calculateZoomBounds,
  mandelbrotKind,
  pixelToComplex,
} from "../mandelbrot";
import {
  type FrameThrottle,
  ORBIT_MAX_STEPS,
  colourCss,
  createFrameThrottle,
  describeProbe,
  escapeInfoFor,
  pointerToCanvasPixel,
  probeAtPointer,
  probePoint,
  shouldClearProbe,
} from "../mathProbe";
import { createMultibrotKind } from "../multibrot";
import { createNewtonKind, newtonKind } from "../newton";
import { renderRgba } from "../renderRgba";
import { celticKind } from "../celtic";
import { createMagnetKind } from "../magnet";
import { novaKind } from "../nova";
import { sineKind } from "../sine";
import { createPhoenixKind } from "../phoenix";
import { perpendicularShipKind } from "../perpendicularShip";
import { tricornKind } from "../tricorn";
import type {
  ColorScheme,
  FractalBounds,
  FractalKind,
} from "../../types/fractal";

const WIDTH = 16;
const HEIGHT = 12;
const CAP = 60;
const SCHEME: ColorScheme = "classic";

/** A view with set, boundary and open plane all in it. */
const VIEW = calculateZoomBounds(-0.6, 0, 0.7);

const KINDS: {
  name: string;
  kind: FractalKind;
  packsOutcomes?: boolean;
  /** Where to draw the parity view; the Mandelbrot set's corner unless said. */
  view?: FractalBounds;
}[] = [
  { name: "mandelbrot", kind: mandelbrotKind },
  { name: "julia", kind: createJuliaKind({ real: -0.8, imaginary: 0.156 }) },
  { name: "burning-ship", kind: burningShipKind },
  { name: "tricorn", kind: tricornKind },
  { name: "celtic", kind: celticKind },
  // Nova's picture is around -0.55, so its view is the frame the fractal opens
  // on: the arc, the disks, the bands and the flat field beyond them.
  { name: "nova", kind: novaKind, view: calculateZoomBounds(-0.55, 0, 1.5) },
  // The Sine set is built around the origin: its opening frame holds the central
  // disc, the discs beside it and the filigree between them.
  { name: "sine", kind: sineKind, view: calculateZoomBounds(0, 0, 1) },
  { name: "perpendicular-ship", kind: perpendicularShipKind },
  { name: "multibrot 3", kind: createMultibrotKind(3) },
  { name: "multibrot 5", kind: createMultibrotKind(5) },
  // The magnet set is not around the origin, so its view is the frame the
  // fractal opens on: the settled black, the escaping island, and the boundary
  // between them all in one picture.
  {
    name: "magnet type 1",
    kind: createMagnetKind(1),
    view: calculateZoomBounds(1.3, 0, 1),
  },
  {
    name: "magnet type 2",
    kind: createMagnetKind(2),
    view: calculateZoomBounds(1.3, 0, 1),
  },
  // A Phoenix set is a Julia set around the origin, so its view is the frame
  // the fractal opens on: the set, its boundary and the open plane together.
  {
    name: "phoenix hourglass",
    kind: createPhoenixKind({ real: 0.5667, imaginary: -0.55 }),
    view: calculateZoomBounds(0, 0, 1),
  },
  // Newton's count is its root and its speed packed together rather than a
  // step count, so its steps are held to escapeInfo's alone.
  { name: "newton", kind: newtonKind, packsOutcomes: true },
  { name: "newton 4", kind: createNewtonKind("4"), packsOutcomes: true },
  { name: "newton 5", kind: createNewtonKind("5"), packsOutcomes: true },
  { name: "newton cycle", kind: createNewtonKind("cycle"), packsOutcomes: true },
];

describe.each(KINDS)("$name", ({ kind, packsOutcomes = false, view = VIEW }) => {
  it("reads every pixel of a drawn view as the picture draws it", () => {
    const pixels = renderRgba(view, WIDTH, HEIGHT, CAP, SCHEME, kind, true);
    let painted = 0;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const point = pixelToComplex(x, y, WIDTH, HEIGHT, view);
        const probe = probePoint(kind, point, CAP, SCHEME);

        expect(probe.point).toEqual(point);
        // The words are the whole-step count, which is the number a step
        // count is; the colour is the smooth one the full render paints.
        expect(probe.info).toEqual(kind.escapeInfo!(point, CAP));
        if (!packsOutcomes) {
          expect(probe.info.steps).toBe(kind.iterations(point, CAP, false));
        }

        const at = (y * WIDTH + x) * 4;
        expect([
          probe.colour.r,
          probe.colour.g,
          probe.colour.b,
          pixels[at + 3],
        ]).toEqual([pixels[at], pixels[at + 1], pixels[at + 2], 255]);
        painted++;
      }
    }

    expect(painted).toBe(WIDTH * HEIGHT);
  });

  it("paints the swatch in the scheme the picture is drawn in", () => {
    const point = pixelToComplex(3, 2, WIDTH, HEIGHT, view);

    for (const scheme of ["classic", "fire", "ocean", "rainbow"] as const) {
      const pixels = renderRgba(view, WIDTH, HEIGHT, CAP, scheme, kind, true);
      const probe = probePoint(kind, point, CAP, scheme);
      const at = (2 * WIDTH + 3) * 4;

      expect(probe.colour).toEqual({
        r: pixels[at],
        g: pixels[at + 1],
        b: pixels[at + 2],
      });
    }
  });
});

describe("escapeInfoFor", () => {
  it("asks the kind when it can answer", () => {
    const point = { real: 2, imaginary: 0 };

    expect(escapeInfoFor(mandelbrotKind, point, CAP)).toEqual(
      mandelbrotKind.escapeInfo!(point, CAP),
    );
  });

  it("reads a kind without an escapeInfo off its count", () => {
    // A kind from outside this app still probes: its count is the whole story,
    // and a count short of the cap is an escape.
    const bare: FractalKind = {
      id: "bare",
      iterations: (point, maxIterations) =>
        point.real > 0 ? 3 : maxIterations,
    };

    expect(escapeInfoFor(bare, { real: 1, imaginary: 0 }, CAP)).toEqual({
      steps: 3,
      escaped: true,
    });
    expect(escapeInfoFor(bare, { real: -1, imaginary: 0 }, CAP)).toEqual({
      steps: CAP,
      escaped: false,
    });
  });
});

describe("describeProbe", () => {
  it("says how an orbit ended, in an escape-time set's words", () => {
    expect(describeProbe("mandelbrot", { steps: 7, escaped: true }, CAP)).toBe(
      "Escaped at step 7",
    );
    expect(
      describeProbe("mandelbrot", { steps: CAP, escaped: false }, CAP),
    ).toBe("Inside the set");
    expect(describeProbe("julia", { steps: 0, escaped: true }, CAP)).toBe(
      "Escaped at step 0",
    );
  });

  it("says which root Newton settled on, counted from 1", () => {
    // The kind numbers the roots from 0 (escapeInfo.test.ts); a person counts
    // them from 1.
    expect(
      describeProbe("newton", { steps: 6, escaped: true, root: 0 }, CAP),
    ).toBe("Settles on root 1 after 6 steps");
    expect(
      describeProbe("newton", { steps: 2, escaped: true, root: 2 }, CAP),
    ).toBe("Settles on root 3 after 2 steps");
  });

  it("has no set for Newton to be inside of, so says what happened", () => {
    expect(describeProbe("newton", { steps: CAP, escaped: false }, CAP)).toBe(
      `Never settled in ${CAP} steps`,
    );
  });

  it("says Nova's orbits settle, escape or never settle, and is not 'inside the set' for the last", () => {
    expect(
      describeProbe("nova", { steps: 22, escaped: true, settled: true }, CAP),
    ).toBe("Settles after 22 steps");
    expect(
      describeProbe("nova", { steps: 1, escaped: true, settled: false }, CAP),
    ).toBe("Escaped at step 1");
    expect(describeProbe("nova", { steps: CAP, escaped: false }, CAP)).toBe(
      `Never settled in ${CAP} steps`,
    );
  });

  it("treats a fractal this build does not know as an escape-time set", () => {
    // The card's descriptors fall back the same way, so it says what is drawn.
    expect(describeProbe("lyapunov", { steps: CAP, escaped: false }, CAP)).toBe(
      "Inside the set",
    );
  });
});

describe("colourCss", () => {
  it("writes a colour the swatch can be painted with", () => {
    expect(colourCss({ r: 0, g: 128, b: 255 })).toBe("rgb(0, 128, 255)");
  });
});

describe("shouldClearProbe", () => {
  /** Something the pointer can be over, standing in for a DOM node. */
  function target(): EventTarget {
    return {} as EventTarget;
  }

  /** An element standing in for one the page holds: itself and its parts. */
  function element(...parts: unknown[]): Element {
    const holder = {
      contains: (node: unknown) => node === holder || parts.includes(node),
    };

    return holder as unknown as Element;
  }

  it("holds the probe for a pointer that moved onto the card", () => {
    // Leaving the picture for the card: the related target is the panel, or
    // something inside it such as the Play button.
    const card = element();
    const play = target();

    expect(shouldClearProbe(card, [card])).toBe(false);
    expect(shouldClearProbe(play, [element(play)])).toBe(false);
  });

  it("holds it for a pointer that moved back onto the picture", () => {
    const canvas = element();

    expect(shouldClearProbe(canvas, [canvas])).toBe(false);
  });

  it("clears it for a pointer that went anywhere else", () => {
    const elsewhere = target();

    expect(shouldClearProbe(elsewhere, [element()])).toBe(true);
    expect(shouldClearProbe(elsewhere, [element(), element()])).toBe(true);
  });

  it("clears it for a pointer that left the window, which names no target", () => {
    expect(shouldClearProbe(null, [element()])).toBe(true);
    expect(shouldClearProbe(null, [element(), element()])).toBe(true);
  });

  it("has nothing to hold with no holder at all", () => {
    expect(shouldClearProbe(target(), [null, undefined])).toBe(true);
  });
});

describe("pointerToCanvasPixel", () => {
  const rect = { left: 10, top: 20, width: 320, height: 240 };

  it("scales a pointer on a canvas the layout has shrunk", () => {
    // A 640x480 canvas shown at 320x240: half size, so pointer pixels double.
    expect(pointerToCanvasPixel(10, 20, rect, 640, 480)).toEqual({
      x: 0,
      y: 0,
    });
    expect(pointerToCanvasPixel(170, 140, rect, 640, 480)).toEqual({
      x: 320,
      y: 240,
    });
  });

  it("is exact when the canvas is at its natural size", () => {
    expect(pointerToCanvasPixel(30, 45, rect, 320, 240)).toEqual({
      x: 20,
      y: 25,
    });
  });

  it("has no pixel to give for a canvas with no box on screen", () => {
    const hidden = { left: 0, top: 0, width: 0, height: 0 };

    expect(pointerToCanvasPixel(10, 10, hidden, 640, 480)).toBeNull();
    expect(
      pointerToCanvasPixel(10, 10, { ...rect, height: 0 }, 640, 480),
    ).toBeNull();
  });
});

describe("the path the probe carries", () => {
  it("is the kind's own orbit, capped for the plot rather than by the cap", () => {
    const point = pixelToComplex(5, 4, WIDTH, HEIGHT, VIEW);
    const probe = probePoint(mandelbrotKind, point, CAP, SCHEME);

    expect(probe.orbit).toEqual(
      mandelbrotKind.orbit!(point, ORBIT_MAX_STEPS),
    );
    // CAP is 60 here and so is the plot's cap; the walk is the plot's, not the
    // render's, whatever the iteration cap in use is.
    expect(probePoint(mandelbrotKind, point, 1000, SCHEME).orbit).toEqual(
      probe.orbit,
    );
  });

  it("is the point alone for a kind that cannot walk one", () => {
    const bare: FractalKind = {
      id: "bare",
      iterations: (point, maxIterations) =>
        point.real > 0 ? 3 : maxIterations,
    };
    const point = { real: 1, imaginary: 0 };

    expect(probePoint(bare, point, CAP, SCHEME).orbit).toEqual([point]);
  });
});

describe("probeAtPointer", () => {
  const rect = { left: 0, top: 0, width: 640, height: 480 };

  it("is the probe for the point under the pointer", () => {
    const at = probeAtPointer(
      mandelbrotKind,
      160,
      120,
      rect,
      640,
      480,
      VIEW,
      CAP,
      SCHEME,
    );

    expect(at).toEqual(
      probePoint(
        mandelbrotKind,
        pixelToComplex(160, 120, 640, 480, VIEW),
        CAP,
        SCHEME,
      ),
    );
  });

  it("says nothing for a canvas with no box on screen", () => {
    expect(
      probeAtPointer(
        mandelbrotKind,
        10,
        10,
        { left: 0, top: 0, width: 0, height: 0 },
        640,
        480,
        VIEW,
        CAP,
        SCHEME,
      ),
    ).toBeNull();
  });
});

describe("createFrameThrottle", () => {
  /** A stand-in for the browser's frames, run by hand. */
  function fakeFrames() {
    const queued = new Map<number, () => void>();
    let next = 1;
    let cancelled = 0;

    return {
      schedule: (callback: () => void) => {
        const handle = next++;
        queued.set(handle, callback);
        return handle;
      },
      cancelFrame: (handle: number) => {
        cancelled++;
        queued.delete(handle);
      },
      frame: () => {
        const callbacks = [...queued.values()];
        queued.clear();
        callbacks.forEach((callback) => callback());
      },
      pending: () => queued.size,
      cancelled: () => cancelled,
    };
  }

  function throttleOver(frames: ReturnType<typeof fakeFrames>) {
    let runs = 0;
    const throttle = createFrameThrottle(
      () => {
        runs++;
      },
      frames.schedule,
      frames.cancelFrame,
    );

    return { throttle, runs: () => runs };
  }

  it("runs once a frame however often it is asked", () => {
    const frames = fakeFrames();
    const { throttle, runs } = throttleOver(frames);

    throttle.request();
    throttle.request();
    throttle.request();
    expect(frames.pending()).toBe(1);
    expect(runs()).toBe(0);

    frames.frame();
    expect(runs()).toBe(1);

    // The frame is over: another request is another run.
    throttle.request();
    frames.frame();
    expect(runs()).toBe(2);
  });

  it("drops a run that has not happened yet", () => {
    const frames = fakeFrames();
    const { throttle, runs } = throttleOver(frames);

    throttle.request();
    throttle.cancel();
    frames.frame();

    expect(frames.cancelled()).toBe(1);
    expect(runs()).toBe(0);
  });

  it("does nothing when there is nothing to cancel", () => {
    const frames = fakeFrames();
    const throttle: FrameThrottle = createFrameThrottle(
      () => {},
      frames.schedule,
      frames.cancelFrame,
    );

    throttle.cancel();
    expect(frames.cancelled()).toBe(0);

    // And a run that has already happened leaves nothing to cancel either.
    throttle.request();
    frames.frame();
    throttle.cancel();
    expect(frames.cancelled()).toBe(0);
  });

  it("asks for the next frame from inside a run", () => {
    const frames = fakeFrames();
    let runs = 0;
    const throttle = createFrameThrottle(
      () => {
        runs++;
        if (runs === 1) throttle.request();
      },
      frames.schedule,
      frames.cancelFrame,
    );

    throttle.request();
    frames.frame();
    expect(runs).toBe(1);
    expect(frames.pending()).toBe(1);

    frames.frame();
    expect(runs).toBe(2);
  });
});

describe("probePoint in an orbit trap", () => {
  // The swatch is the colour on screen, and in trap mode the picture paints the
  // stored (Float32) distance: every pixel of a small view is held to the probe.
  const KINDS = [
    mandelbrotKind,
    createJuliaKind({ real: -0.8, imaginary: 0.156 }),
    tricornKind,
  ];

  it.each([
    ["point", { reverse: false, shift: 0 }],
    ["line", { reverse: true, shift: 0.25 }],
    ["circle", { reverse: true, shift: 0.5 }],
  ] as const)("matches every pixel of a %s trap picture", (trap, options) => {
    for (const kind of KINDS) {
      const pixels = renderRgba(
        VIEW,
        WIDTH,
        HEIGHT,
        CAP,
        SCHEME,
        kind,
        true,
        options,
        trap,
      );

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const point = pixelToComplex(x, y, WIDTH, HEIGHT, VIEW);
          const probe = probePoint(kind, point, CAP, SCHEME, options, trap);
          const at = (y * WIDTH + x) * 4;

          expect(
            [probe.colour.r, probe.colour.g, probe.colour.b],
            `${kind.id} ${trap} (${x}, ${y})`,
          ).toEqual([pixels[at], pixels[at + 1], pixels[at + 2]]);
        }
      }
    }
  });

  it("is the count swatch with no trap, or with null", () => {
    const point = { real: -0.5, imaginary: 0.3 };
    const plain = probePoint(mandelbrotKind, point, CAP, SCHEME);

    expect(probePoint(mandelbrotKind, point, CAP, SCHEME, undefined, null))
      .toEqual(plain);
  });

  it("says the same steps and path, which the trap does not move", () => {
    const point = { real: -0.5, imaginary: 0.3 };
    const plain = probePoint(mandelbrotKind, point, CAP, SCHEME);
    const trapped = probePoint(mandelbrotKind, point, CAP, SCHEME, undefined, "line");

    expect(trapped.info).toEqual(plain.info);
    expect(trapped.orbit).toEqual(plain.orbit);
  });

  it("probeAtPointer passes the trap on", () => {
    const rect = { left: 0, top: 0, width: WIDTH, height: HEIGHT };
    const a = probeAtPointer(mandelbrotKind, 1, 1, rect, WIDTH, HEIGHT, VIEW, CAP, SCHEME, undefined, "circle");
    const b = probePoint(
      mandelbrotKind,
      pixelToComplex(1, 1, WIDTH, HEIGHT, VIEW),
      CAP,
      SCHEME,
      undefined,
      "circle",
    );

    expect(a).toEqual(b);
  });
});

describe("probePoint with the scheme's own settings", () => {
  const OPTIONS = [
    { reverse: true },
    { shift: 0.25 },
    { reverse: true, shift: 0.5 },
  ];

  it("reports the colour the picture paints under those settings", () => {
    // The swatch is the colour on screen, so a reversed or shifted picture has
    // a reversed or shifted swatch: the probe reads the same mapping, with the
    // same settings, that the render does.
    for (const options of OPTIONS) {
      const pixels = renderRgba(
        VIEW,
        WIDTH,
        HEIGHT,
        CAP,
        SCHEME,
        mandelbrotKind,
        true,
        options,
      );

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const point = pixelToComplex(x, y, WIDTH, HEIGHT, VIEW);
          const probe = probePoint(mandelbrotKind, point, CAP, SCHEME, options);
          const at = (y * WIDTH + x) * 4;

          expect([probe.colour.r, probe.colour.g, probe.colour.b]).toEqual([
            pixels[at],
            pixels[at + 1],
            pixels[at + 2],
          ]);
        }
      }
    }
  });

  it("says the same steps and the same path, which colour does not move", () => {
    const point = { real: -0.5, imaginary: 0.3 };
    const plain = probePoint(mandelbrotKind, point, CAP, SCHEME);

    for (const options of OPTIONS) {
      const probe = probePoint(mandelbrotKind, point, CAP, SCHEME, options);

      expect(probe.info).toEqual(plain.info);
      expect(probe.orbit).toEqual(plain.orbit);
    }
  });
});
