import { describe, expect, it } from "vitest";

import { getAvailableColorSchemes } from "../colorMapping";
import { FRACTAL_TYPES } from "../fractalTypes";
import {
  JULIA_CONSTANTS,
  MAX_CUSTOM_CONSTANT_LENGTH,
  isJuliaConstantName,
} from "../julia";
import {
  ITERATION_STEP,
  MAX_ITERATIONS,
  MAX_ZOOM,
  MIN_ITERATIONS,
  MIN_ZOOM,
} from "../mandelbrot";
import {
  CANVAS_SIZES,
  decodeTour,
  decodeView,
  encodeView,
  type ViewLinkState,
} from "../viewLink";

/** The view the format's example describes, as the page holds it. */
const EXAMPLE: ViewLinkState = {
  fractalType: "julia",
  variant: "Classic",
  centerX: -0.644,
  centerY: -0.094,
  zoomLevel: 2.56,
  colorScheme: "fire",
  autoIterationsOn: true,
  canvasWidth: 800,
  canvasHeight: 600,
};

const EXAMPLE_LINK =
  "v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600";

/**
 * Centres and zooms a session lands on: the framed default, a view at the
 * deepest zoom whose centre needs every digit the format keeps, and one
 * between the two.
 */
const VIEWS = [
  { centerX: -0.75, centerY: 0, zoomLevel: 1 },
  {
    centerX: -0.7436438870371587,
    centerY: 0.1318259042053119,
    zoomLevel: 10000,
  },
  { centerX: 0.2925755, centerY: -0.0149977, zoomLevel: 42.5 },
];

/**
 * A state for each fractal, colour scheme, canvas size and iteration mode: the
 * whole of what the picker, the palette, the resolution buttons and the
 * iteration switch can put together.
 */
function sampleStates(): ViewLinkState[] {
  const states: ViewLinkState[] = [];
  const schemes = getAvailableColorSchemes();

  FRACTAL_TYPES.forEach((fractal, fractalIndex) => {
    schemes.forEach((scheme, schemeIndex) => {
      CANVAS_SIZES.forEach((size, sizeIndex) => {
        const view =
          VIEWS[(fractalIndex + schemeIndex + sizeIndex) % VIEWS.length];
        // The fractal and its constant are one choice, so only a Julia state
        // carries one — which is the state the format writes.
        const constant =
          fractal.id === "julia"
            ? {
                variant:
                  JULIA_CONSTANTS[
                    (fractalIndex + schemeIndex) % JULIA_CONSTANTS.length
                  ].name,
              }
            : {};

        for (const autoIterationsOn of [true, false]) {
          states.push({
            fractalType: fractal.id,
            ...constant,
            ...view,
            colorScheme: scheme.value,
            autoIterationsOn,
            maxIterations: autoIterationsOn
              ? undefined
              : MIN_ITERATIONS + ITERATION_STEP * (sizeIndex + 1),
            canvasWidth: size.width,
            canvasHeight: size.height,
          });
        }
      });
    });
  });

  return states;
}

/** Equality the way the format promises it: the numbers come back within the
 * ten significant digits a link writes, not bit for bit. */
function expectClose(got: number | undefined, expected: number): void {
  expect(typeof got).toBe("number");
  expect(Math.abs((got as number) - expected)).toBeLessThanOrEqual(
    1e-9 * Math.abs(expected),
  );
}

function expectSameState(
  actual: Partial<ViewLinkState>,
  expected: ViewLinkState,
): void {
  expect(actual.fractalType).toBe(expected.fractalType);
  expect(actual.variant).toBe(expected.variant);
  expect(actual.colorScheme).toBe(expected.colorScheme);
  expect(actual.autoIterationsOn).toBe(expected.autoIterationsOn);
  expect(actual.maxIterations).toBe(expected.maxIterations);
  expect(actual.canvasWidth).toBe(expected.canvasWidth);
  expect(actual.canvasHeight).toBe(expected.canvasHeight);

  expectClose(actual.centerX, expected.centerX);
  expectClose(actual.centerY, expected.centerY);
  expectClose(actual.zoomLevel, expected.zoomLevel);
}

describe("encodeView", () => {
  it("writes the link the format describes, key for key", () => {
    expect(encodeView(EXAMPLE)).toBe(EXAMPLE_LINK);
  });

  it("writes the version first, then the fields in one fixed order", () => {
    // The string a view produces is part of the format: one view is always one
    // link, so a link can be compared, cached and pasted as text.
    expect(
      encodeView({
        fractalType: "burning-ship",
        centerX: -0.45,
        centerY: -0.5,
        zoomLevel: 200,
        colorScheme: "grayscale",
        autoIterationsOn: false,
        maxIterations: 430,
        canvasWidth: 1200,
        canvasHeight: 900,
      }),
    ).toBe(
      "v=1&f=burning-ship&x=-0.45&y=-0.5&z=200&s=grayscale&i=430&w=1200&h=900",
    );
  });

  it("writes no constant for a fractal that has none", () => {
    // The fractal and its constant are one choice, so a leftover Julia constant
    // on a Mandelbrot view is not part of the picture and does not travel.
    const link = encodeView({
      ...EXAMPLE,
      fractalType: "mandelbrot",
      variant: "Dendrite",
    });

    expect(link).toBe(
      "v=1&f=mandelbrot&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600",
    );
  });

  it("carries a custom constant as the name it already is", () => {
    // A constant is a string wherever the app holds one, and a custom one is
    // that string written as a point, so a link has only to carry it: the
    // fragment's own escaping is the whole of the translation, and the name
    // comes back as the identical string rather than as a re-rendering of the
    // number it names.
    const link = encodeView({
      ...EXAMPLE,
      variant: "custom:-0.8,0.156",
    });

    expect(link).toBe(
      "v=1&f=julia&k=custom%3A-0.8%2C0.156&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600",
    );
    expect(decodeView(link).variant).toBe("custom:-0.8,0.156");
  });

  it("leaves out every field the format cannot carry", () => {
    // The mirror of the decoder: what cannot be read is not written, so the two
    // halves agree about what a link holds. The version is always written.
    expect(
      encodeView({
        fractalType: "newton",
        centerX: 42,
        centerY: 0,
        zoomLevel: 3,
        colorScheme: "classic",
        autoIterationsOn: false,
        maxIterations: 7,
        canvasWidth: 800,
        canvasHeight: 700,
      }),
    ).toBe("v=1&y=0&z=3&s=classic");
  });

  it("writes the zoom clamped into the range the explorer offers", () => {
    // A gesture is clamped the same way, so the link carries the view the app
    // would actually be showing.
    expect(encodeView({ ...EXAMPLE, zoomLevel: 0 })).toContain("z=1&");
    expect(encodeView({ ...EXAMPLE, zoomLevel: 99999 })).toContain("z=10000&");
  });

  it("writes numbers with no exponent, no trailing zeros and ten digits at most", () => {
    const link = encodeView({
      fractalType: "mandelbrot",
      centerX: -1.8965650826446265,
      centerY: 0.0000001234567890123,
      zoomLevel: 1234.5678901234,
      colorScheme: "ocean",
      autoIterationsOn: false,
      maxIterations: 430,
      canvasWidth: 1200,
      canvasHeight: 900,
    });

    expect(link).toBe(
      "v=1&f=mandelbrot&x=-1.896565083&y=0.000000123456789&z=1234.56789&s=ocean&i=430&w=1200&h=900",
    );

    for (const pair of link.split("&")) {
      const [key, value] = pair.split("=");
      if (!["x", "y", "z", "w", "h"].includes(key)) continue;

      expect(value).toMatch(/^-?\d+(?:\.\d+)?$/);
      expect(value).not.toMatch(/\.\d*0$/);

      // Leading zeros hold a place rather than say anything; the rest are the
      // digits the format keeps.
      const digits = value.replace("-", "").replace(".", "").replace(/^0+/, "");
      expect(digits.length).toBeGreaterThan(0);
      expect(digits.length).toBeLessThanOrEqual(10);
    }
  });
});

describe("decodeView", () => {
  it("reads the link the format describes", () => {
    expect(decodeView(EXAMPLE_LINK)).toEqual(EXAMPLE);
  });

  it("reads a fragment with or without the hash a URL bar shows", () => {
    expect(decodeView(`#${EXAMPLE_LINK}`)).toEqual(decodeView(EXAMPLE_LINK));
  });

  it("reads a custom constant out of a link", () => {
    expect(decodeView("v=1&f=julia&k=custom%3A-0.8%2C0.156")).toEqual({
      fractalType: "julia",
      variant: "custom:-0.8,0.156",
    });
  });

  it("drops a custom constant it cannot read and keeps the rest of the view", () => {
    // A name is judged as suspiciously as any other field, and by the one rule
    // in `julia.ts`: out of range, misspelled, in the wrong case or longer
    // than a name can be, it is dropped and the page keeps its own constant.
    const unreadable = [
      "custom:0.5,0.5x",
      "custom:3,0",
      "custom:0,-3",
      "custom:1e3,0",
      "Custom:0,0",
      `custom:0,${"0".repeat(MAX_CUSTOM_CONSTANT_LENGTH)}`,
    ];

    for (const name of unreadable) {
      expect(
        decodeView(`v=1&f=julia&k=${encodeURIComponent(name)}&z=2.5`),
        name,
      ).toEqual({ fractalType: "julia", zoomLevel: 2.5 });
    }
  });

  it("ignores a key it has never heard of", () => {
    // A later build may add a key; this one reads the fields it knows and
    // leaves the rest, rather than refusing the whole link.
    expect(decodeView(`${EXAMPLE_LINK}&q=zzz`)).toEqual(
      decodeView(EXAMPLE_LINK),
    );
  });

  it("clamps a zoom outside the explorer's range instead of dropping it", () => {
    expect(decodeView("v=1&z=0")).toEqual({ zoomLevel: MIN_ZOOM });
    expect(decodeView("v=1&z=99999")).toEqual({ zoomLevel: MAX_ZOOM });
    expect(decodeView("v=1&z=-1")).toEqual({ zoomLevel: MIN_ZOOM });
  });

  it("puts a count inside the slider's range on its step", () => {
    // A hand-edited link lands on a value the slider can show rather than being
    // thrown away over one digit; a count the slider cannot reach is refused.
    expect(decodeView("v=1&i=57")).toEqual({
      autoIterationsOn: false,
      maxIterations: 60,
    });
    expect(decodeView("v=1&i=1000")).toEqual({
      autoIterationsOn: false,
      maxIterations: 1000,
    });
    expect(decodeView("v=1&i=7")).toEqual({});
    expect(decodeView("v=1&i=9999")).toEqual({});
  });

  it("reads the first of a key that appears twice", () => {
    // The same rule a form's own reader uses, and the rule the browser applies
    // to a query string.
    expect(decodeView("v=1&z=2.5&z=9")).toEqual({ zoomLevel: 2.5 });
    expect(decodeView("v=1&f=mandelbrot&f=julia")).toEqual({
      fractalType: "mandelbrot",
    });
  });

  it("refuses a fragment of another version, however well formed", () => {
    expect(decodeView(EXAMPLE_LINK.replace("v=1&", "v=2&"))).toEqual({});
    expect(decodeView(EXAMPLE_LINK.replace("v=1&", "v=11&"))).toEqual({});
    expect(decodeView(EXAMPLE_LINK.replace("v=1&", ""))).toEqual({});
  });

  it("reads a fragment of exactly the length it accepts, and refuses one past it", () => {
    const prefix = "v=1&f=mandelbrot&q=";
    const padded = (length: number) =>
      prefix + "z".repeat(length - prefix.length);

    expect(padded(500)).toHaveLength(500);
    expect(decodeView(padded(500))).toEqual({ fractalType: "mandelbrot" });
    expect(decodeView(padded(501))).toEqual({});
  });
});

describe("decodeView against a fragment it should not trust", () => {
  /** Every field a decode returned, held against the rules of its format: a
   * value that came back is always one the page could be in. */
  function expectOnlyValidFields(state: Partial<ViewLinkState>): void {
    if (state.fractalType !== undefined) {
      expect(FRACTAL_TYPES.map((type) => type.id)).toContain(state.fractalType);
    }
    if (state.variant !== undefined) {
      // A constant that came back is a name this build reads: one of the four
      // the picker offers, or a custom spelling of a point.
      expect(isJuliaConstantName(state.variant)).toBe(true);
    }
    if (state.colorScheme !== undefined) {
      expect(
        getAvailableColorSchemes().map((scheme) => scheme.value),
      ).toContain(state.colorScheme);
    }
    for (const coordinate of [state.centerX, state.centerY]) {
      if (coordinate === undefined) continue;
      expect(Number.isFinite(coordinate)).toBe(true);
      expect(Math.abs(coordinate)).toBeLessThanOrEqual(10);
    }
    if (state.zoomLevel !== undefined) {
      expect(state.zoomLevel).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(state.zoomLevel).toBeLessThanOrEqual(MAX_ZOOM);
    }
    if (state.maxIterations !== undefined) {
      expect(state.maxIterations).toBeGreaterThanOrEqual(MIN_ITERATIONS);
      expect(state.maxIterations).toBeLessThanOrEqual(MAX_ITERATIONS);
      expect(state.maxIterations % ITERATION_STEP).toBe(0);
    }
    if (state.canvasWidth !== undefined) {
      // The size is one value, so a width never travels without the height it
      // was chosen with.
      expect(CANVAS_SIZES).toContainEqual({
        width: state.canvasWidth,
        height: state.canvasHeight,
      });
    } else {
      expect(state.canvasHeight).toBeUndefined();
    }
  }

  /**
   * Fragments a link is never allowed to make the decoder stumble over: empty,
   * truncated, of another version, longer than it will read, naming values that
   * do not exist, or carrying text that is not a number at all.
   */
  const JUNK = [
    "",
    "#",
    "&",
    "=",
    "v=",
    "v=1",
    "x".repeat(600),
    `v=1&f=mandelbrot&x=${"1".repeat(600)}`,
    "v=2&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600",
    "v=1&x=abc",
    "v=1&x=1e999",
    "v=1&x=NaN",
    "v=1&x=Infinity",
    "v=1&x=0x10",
    "v=1&x=1_000",
    "v=1&x=",
    "v=1&x=100",
    "v=1&y=-100",
    "v=1&f=nope",
    "v=1&k=Nope",
    "v=1&f=julia&k=custom:0.5,0.5x",
    "v=1&f=julia&k=custom:9,9",
    "v=1&f=julia&k=Custom:0,0",
    "v=1&s=nope",
    "v=1&i=7",
    "v=1&i=auto2",
    "v=1&i=57.5",
    "v=1&w=800&h=700",
    "v=1&w=800",
    "v=1&h=600",
    "v=1&%FF%FE=1&f=%C3%A9",
    "v=1&f=mandelbrot&f=julia",
    "v=1&z=%",
    "#%",
  ];

  it("never throws, and returns only values the explorer could hold", () => {
    for (const fragment of JUNK) {
      expectOnlyValidFields(decodeView(fragment));
    }
  });

  it("drops a value it cannot read and keeps the ones it can", () => {
    // One bad field is not a bad link: the rest of the view still arrives, and
    // the page keeps its own default for the field that was dropped.
    expect(decodeView("v=1&x=abc&f=julia&z=2.5&i=auto&w=800&h=600")).toEqual({
      fractalType: "julia",
      zoomLevel: 2.5,
      autoIterationsOn: true,
      canvasWidth: 800,
      canvasHeight: 600,
    });
  });

  it("reads nothing at all out of a fragment that is not one of ours", () => {
    expect(decodeView("")).toEqual({});
    expect(decodeView("#")).toEqual({});
    expect(decodeView("hello world")).toEqual({});
    expect(decodeView(EXAMPLE_LINK.replace("v=1&", "v=2&"))).toEqual({});
  });
});

describe("the round trip", () => {
  it("returns every sample state of every fractal, colour, size and mode", () => {
    const states = sampleStates();

    // A sweep that quietly shrank to nothing would still pass, so the count is
    // part of the test: three fractals, five schemes, three sizes, two modes.
    expect(states).toHaveLength(
      FRACTAL_TYPES.length *
        getAvailableColorSchemes().length *
        CANVAS_SIZES.length *
        2,
    );

    for (const state of states) {
      expectSameState(decodeView(encodeView(state)), state);
    }
  });

  it("returns a view whose constant is a custom name", () => {
    // The member of the sweep that is not one of the four named constants: a
    // name the link carries as text, compared as text, so the string is what
    // has to come back and not merely the point it names.
    const state: ViewLinkState = {
      fractalType: "julia",
      variant: "custom:0.285,0.01",
      ...VIEWS[2],
      colorScheme: "fire",
      autoIterationsOn: false,
      maxIterations: 430,
      canvasWidth: 800,
      canvasHeight: 600,
    };

    expectSameState(decodeView(encodeView(state)), state);
  });

  it("keeps a deep view's centre to within the precision the link promises", () => {
    // Ten significant digits is about 1e-10 of relative error, which is what
    // makes a link to a view at the deepest zoom open on the view it names
    // rather than a few pixels away from it.
    const deep = VIEWS[1];
    const state: ViewLinkState = {
      fractalType: "mandelbrot",
      ...deep,
      colorScheme: "classic",
      autoIterationsOn: true,
      canvasWidth: 800,
      canvasHeight: 600,
    };

    const read = decodeView(encodeView(state));

    for (const field of ["centerX", "centerY"] as const) {
      const error =
        Math.abs((read[field] as number) - state[field]) /
        Math.abs(state[field]);
      expect(error).toBeLessThan(1e-9);
    }
  });
});

describe("decodeTour", () => {
  it("reads #tour, with or without its #, as a request for a tour", () => {
    expect(decodeTour("#tour")).toBe(true);
    expect(decodeTour("tour")).toBe(true);
  });

  it("reads tour=1 beside a view of this version", () => {
    expect(decodeTour(`#${EXAMPLE_LINK}&tour=1`)).toBe(true);
    expect(decodeTour(`#tour=1&${EXAMPLE_LINK}`)).toBe(true);
    expect(decodeTour("v=1&tour=1")).toBe(true);
  });

  it("asks for nothing from a view alone, or from any other value of tour", () => {
    expect(decodeTour(`#${EXAMPLE_LINK}`)).toBe(false);
    expect(decodeTour(`#${EXAMPLE_LINK}&tour=0`)).toBe(false);
    expect(decodeTour(`#${EXAMPLE_LINK}&tour=`)).toBe(false);
    expect(decodeTour(`#${EXAMPLE_LINK}&tour=true`)).toBe(false);
    expect(decodeTour(`#${EXAMPLE_LINK}&tour=11`)).toBe(false);
  });

  it("does not read tour=1 in a link of another version, or in none", () => {
    expect(decodeTour("#tour=1")).toBe(false);
    expect(decodeTour("#v=2&tour=1")).toBe(false);
    expect(decodeTour("#x=1&tour=1")).toBe(false);
  });

  it("is exact about the bare spelling", () => {
    for (const fragment of [
      "#Tour",
      "#TOUR",
      "#tour ",
      "# tour",
      "#tours",
      "#tour/",
      "#tour&",
      "#tour=",
      "##tour",
      "#/tour",
    ]) {
      expect(decodeTour(fragment), fragment).toBe(false);
    }
  });

  it("answers false for garbage without throwing", () => {
    const garbage = [
      "",
      "#",
      "%",
      "#%E0%A4%A",
      "#v=1&tour=%",
      "#&&&&",
      "#=",
      "#\u0000tour",
      undefined as unknown as string,
      null as unknown as string,
      42 as unknown as string,
    ];

    for (const fragment of garbage) {
      expect(() => decodeTour(fragment)).not.toThrow();
      expect(decodeTour(fragment), String(fragment)).toBe(false);
    }
  });

  it("reads the first value of a repeated tour key", () => {
    expect(decodeTour("#v=1&tour=1&tour=0")).toBe(true);
    expect(decodeTour("#v=1&tour=0&tour=1")).toBe(false);
  });

  it("refuses a fragment past the length the decoder reads", () => {
    const padding = `&pad=${"x".repeat(600)}`;

    expect(decodeTour(`#${EXAMPLE_LINK}&tour=1${padding}`)).toBe(false);
  });

  it("leaves what encodeView writes, and what decodeView reads, as they were", () => {
    for (const state of sampleStates()) {
      const link = encodeView(state);

      // The tour is something opening a link does, never part of the view.
      expect(link).not.toContain("tour");
      expect(decodeTour(link)).toBe(false);

      // Asking for one beside the view changes nothing about the view.
      expectSameState(decodeView(`${link}&tour=1`), state);
      expect(decodeTour(`#${link}&tour=1`)).toBe(true);
    }
  });

  it("reads #tour as no view at all, so the page opens on its own", () => {
    expect(decodeView("#tour")).toEqual({});
  });
});
