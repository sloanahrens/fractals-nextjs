import { describe, expect, it } from "vitest";

import { getAvailableColorSchemes } from "../colorMapping";
import { FRACTAL_TYPES, fractalVariants, isVariantValue } from "../fractalTypes";
import { MAX_CUSTOM_CONSTANT_LENGTH } from "../julia";
import {
  ITERATION_STEP,
  MAX_ITERATIONS,
  MAX_ZOOM,
  MIN_ITERATIONS,
  MIN_ZOOM,
} from "../mandelbrot";
import {
  CANVAS_SIZES,
  MAX_FRAGMENT_LENGTH,
  decodeTour,
  decodeView,
  encodeView,
  linkWithoutColour,
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

/** Palette shifts a state is sampled with, all of them exact in two decimals. */
const SHIFTS = [0, 0.25, 0.5, 0.75];

/**
 * A state for each fractal, colour scheme, canvas size and iteration mode: the
 * whole of what the picker, the palette, the resolution buttons and the
 * iteration switch can put together — and a share of them reversed and shifted,
 * since those travel in a link beside the scheme.
 */
function sampleStates(): ViewLinkState[] {
  const states: ViewLinkState[] = [];
  const schemes = getAvailableColorSchemes();

  FRACTAL_TYPES.forEach((fractal, fractalIndex) => {
    schemes.forEach((scheme, schemeIndex) => {
      CANVAS_SIZES.forEach((size, sizeIndex) => {
        const view =
          VIEWS[(fractalIndex + schemeIndex + sizeIndex) % VIEWS.length];
        // The fractal and its variant are one choice, so only a fractal that
        // takes one carries one (a Julia constant, a Multibrot power) — which
        // is the state the format writes.
        const options = fractalVariants(fractal.id)?.options ?? [];
        const constant =
          options.length > 0
            ? {
                variant:
                  options[(fractalIndex + schemeIndex) % options.length].value,
              }
            : {};

        for (const autoIterationsOn of [true, false]) {
          states.push({
            fractalType: fractal.id,
            ...constant,
            ...view,
            colorScheme: scheme.value,
            reverse: (fractalIndex + sizeIndex) % 2 === 1,
            shift: SHIFTS[(fractalIndex + schemeIndex) % SHIFTS.length],
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
  // Both settings are written only when they ask for something, so a link
  // reads back the field as absent for the value that means "no change".
  expect(actual.reverse ?? false).toBe(expected.reverse ?? false);
  expect(actual.shift ?? 0).toBe(expected.shift ?? 0);
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

  it("writes the Tricorn as f=tricorn and reads it back", () => {
    const view = {
      fractalType: "tricorn",
      centerX: 0.872,
      centerY: 1.51,
      zoomLevel: 50,
      colorScheme: "classic" as const,
      autoIterationsOn: true,
      canvasWidth: 800,
      canvasHeight: 600,
    };
    const link = encodeView(view);

    expect(link).toBe(
      "v=1&f=tricorn&x=0.872&y=1.51&z=50&s=classic&i=auto&w=800&h=600",
    );
    expect(decodeView(`#${link}`)).toMatchObject({
      fractalType: "tricorn",
      centerX: 0.872,
      centerY: 1.51,
      zoomLevel: 50,
    });
  });

  it("writes the Celtic set as f=celtic, with no k, and reads it back", () => {
    const view = {
      fractalType: "celtic",
      centerX: -1.3,
      centerY: 0.7,
      zoomLevel: 4,
      colorScheme: "classic" as const,
      autoIterationsOn: true,
      canvasWidth: 800,
      canvasHeight: 600,
    };
    const link = encodeView(view);

    expect(link).toBe(
      "v=1&f=celtic&x=-1.3&y=0.7&z=4&s=classic&i=auto&w=800&h=600",
    );
    expect(decodeView(`#${link}`)).toMatchObject({
      fractalType: "celtic",
      centerX: -1.3,
      centerY: 0.7,
      zoomLevel: 4,
    });
  });

  it("writes Nova as f=nova, with no k, and reads it back", () => {
    const view = {
      fractalType: "nova",
      centerX: -0.55,
      centerY: 0,
      zoomLevel: 1.5,
      colorScheme: "classic" as const,
      autoIterationsOn: true,
      canvasWidth: 800,
      canvasHeight: 600,
      // A variant left over from Julia is not written beside a fractal that
      // takes none.
      variant: "Dendrite",
    };
    const link = encodeView(view);

    expect(link).toBe(
      "v=1&f=nova&x=-0.55&y=0&z=1.5&s=classic&i=auto&w=800&h=600",
    );
    expect(decodeView(`#${link}`)).toMatchObject({
      fractalType: "nova",
      centerX: -0.55,
      centerY: 0,
      zoomLevel: 1.5,
    });
  });

  it("writes the Perpendicular Ship as f=perpendicular-ship, with no k, and reads it back", () => {
    const view = {
      fractalType: "perpendicular-ship",
      // A variant left over from Julia is not written beside a fractal that
      // takes none.
      variant: "Dendrite",
      centerX: -0.55,
      centerY: 0,
      zoomLevel: 1,
      colorScheme: "classic" as const,
      autoIterationsOn: true,
      canvasWidth: 800,
      canvasHeight: 600,
    };
    const link = encodeView(view);

    expect(link).toBe(
      "v=1&f=perpendicular-ship&x=-0.55&y=0&z=1&s=classic&i=auto&w=800&h=600",
    );
    expect(decodeView(`#${link}`)).toMatchObject({
      fractalType: "perpendicular-ship",
      centerX: -0.55,
      centerY: 0,
      zoomLevel: 1,
    });
  });

  it("writes the Newton fractal's polynomial as k and reads it back", () => {
    for (const polynomial of ["3", "4", "5", "cycle"]) {
      const link = encodeView({
        fractalType: "newton",
        variant: polynomial,
        centerX: 0,
        centerY: 0,
        zoomLevel: 8,
        colorScheme: "rainbow",
        autoIterationsOn: true,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(link).toBe(
        `v=1&f=newton&k=${polynomial}&x=0&y=0&z=8&s=rainbow&i=auto&w=800&h=600`,
      );
      expect(decodeView(`#${link}`)).toMatchObject({
        fractalType: "newton",
        variant: polynomial,
        centerX: 0,
        centerY: 0,
        zoomLevel: 8,
        colorScheme: "rainbow",
      });
    }
  });

  it("writes a Newton state a polynomial the fractal cannot draw as f=newton and no k", () => {
    const view = {
      fractalType: "newton",
      // A variant left over from Julia is not written beside a fractal that
      // cannot draw it.
      variant: "Dendrite",
      centerX: 0,
      centerY: 0,
      zoomLevel: 8,
      colorScheme: "rainbow" as const,
      autoIterationsOn: true,
      canvasWidth: 800,
      canvasHeight: 600,
    };
    const link = encodeView(view);

    expect(link).toBe("v=1&f=newton&x=0&y=0&z=8&s=rainbow&i=auto&w=800&h=600");
    expect(decodeView(`#${link}`)).toMatchObject({
      fractalType: "newton",
      centerX: 0,
      centerY: 0,
      zoomLevel: 8,
      colorScheme: "rainbow",
    });
    expect(decodeView(`#${link}`).variant).toBeUndefined();
    // The state's own value is still "Dendrite"; it is the page that falls
    // back to z^3 - 1 (`viewLinkState.ts`), not the codec that invents one.
  });

  it("writes the Multibrot's power as k and reads it back", () => {
    for (const power of ["3", "4", "5"]) {
      const link = encodeView({
        fractalType: "multibrot",
        variant: power,
        centerX: 0,
        centerY: 0,
        zoomLevel: 1,
        colorScheme: "classic",
        autoIterationsOn: true,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(link).toBe(
        `v=1&f=multibrot&k=${power}&x=0&y=0&z=1&s=classic&i=auto&w=800&h=600`,
      );
      expect(decodeView(`#${link}`)).toMatchObject({
        fractalType: "multibrot",
        variant: power,
      });
    }
  });

  it("writes only the variant the fractal can draw: no constant beside the Multibrot, no power beside Julia", () => {
    const multibrot = encodeView({
      ...EXAMPLE,
      fractalType: "multibrot",
      variant: "Classic",
    });
    const julia = encodeView({ ...EXAMPLE, variant: "4" });

    expect(multibrot).toBe(
      "v=1&f=multibrot&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600",
    );
    expect(julia).toBe(
      "v=1&f=julia&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600",
    );
  });

  it("writes no power for a Multibrot state whose power is not one it offers", () => {
    for (const variant of ["2", "6", "3.0", "03", "", undefined]) {
      expect(
        encodeView({ ...EXAMPLE, fractalType: "multibrot", variant }),
        String(variant),
      ).not.toContain("k=");
    }
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
        fractalType: "lyapunov",
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

  it("reads a Multibrot power out of a link", () => {
    expect(decodeView("v=1&f=multibrot&k=5")).toEqual({
      fractalType: "multibrot",
      variant: "5",
    });
  });

  it("drops a power it cannot read and keeps the rest of the view", () => {
    // Judged by the one rule in `multibrot.ts`: a power outside 3 to 5, another
    // spelling of one, or text, is dropped and the page keeps its own power.
    // "2" is deliberately not in this list: it is a Magnet type, so a value the
    // codec reads is read here too — which fractal a value belongs to is
    // `viewLinkToUpdates`'s business, and it drops it there — see the test
    // below.
    for (const power of ["6", "3.0", "03", "%204", "4%20", "x", "-3"]) {
      expect(decodeView(`v=1&f=multibrot&k=${power}&z=2.5`), power).toEqual({
        fractalType: "multibrot",
        zoomLevel: 2.5,
      });
    }
  });

  it("reads a variant another fractal owns, and leaves it to the page to place", () => {
    // The codec asks of a `k` only whether this build reads the value at all:
    // "2" is the Magnet's second type, so a link naming it beside the Multibrot
    // comes back with it, and the page's half (`viewLinkToUpdates`) is what
    // keeps it for a fractal that can draw it and drops it for one that cannot.
    expect(decodeView("v=1&f=multibrot&k=2&z=2.5")).toEqual({
      fractalType: "multibrot",
      variant: "2",
      zoomLevel: 2.5,
    });
  });

  it("reads a Magnet type out of a link", () => {
    expect(decodeView("v=1&f=magnet&k=2")).toEqual({
      fractalType: "magnet",
      variant: "2",
    });
  });

  it("drops a magnet type it cannot read and keeps the rest of the view", () => {
    // Judged by the one rule in `magnet.ts`: a type outside 1 to 2, another
    // spelling of one, or text, is dropped and the page keeps its own type.
    // "3" is left out for the reason "2" is left out of the power list above:
    // it is a Multibrot power, so the codec reads it and the page drops it.
    for (const type of ["0", "1.0", "01", "%201", "2%20", "x", "-1"]) {
      expect(decodeView(`v=1&f=magnet&k=${type}&z=2.5`), type).toEqual({
        fractalType: "magnet",
        zoomLevel: 2.5,
      });
    }
  });

  it("reads a Phoenix constant out of a link", () => {
    for (const name of ["Classic", "Spirals", "Hourglass"]) {
      expect(decodeView(`v=1&f=phoenix&k=${name}`), name).toEqual({
        fractalType: "phoenix",
        variant: name,
      });
    }
  });

  it("drops a Phoenix constant it cannot read and keeps the rest of the view", () => {
    // Judged by the one rule in `phoenix.ts`: only the offered names are read,
    // in their own case, so another case, padding or text is dropped and the
    // page keeps its own constant. A name some other fractal reads ("Dendrite",
    // "4") is read here too and left to `viewLinkToUpdates` to place.
    for (const name of ["classic", "Classic%20", "%20Classic", "x", "Hour"]) {
      expect(decodeView(`v=1&f=phoenix&k=${name}&z=2.5`), name).toEqual({
        fractalType: "phoenix",
        zoomLevel: 2.5,
      });
    }
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
      // A variant that came back is one some fractal this build draws can be
      // drawn with, which is the whole of the codec's own test: it reads a `k`
      // without asking which fractal it sits beside.
      expect(
        FRACTAL_TYPES.some((type) => isVariantValue(type.id, state.variant)),
      ).toBe(true);
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
    if (state.reverse !== undefined) expect(state.reverse).toBe(true);
    if (state.shift !== undefined) {
      // A whole turn reads as nought; anything else a link may say is a
      // fraction of one.
      expect(state.shift).toBeGreaterThanOrEqual(0);
      expect(state.shift).toBeLessThan(1);
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

describe("linkWithoutColour", () => {
  it("drops the colour fields and keeps every other, in the format's order", () => {
    expect(linkWithoutColour(EXAMPLE_LINK)).toBe(
      EXAMPLE_LINK.replace("s=fire&", ""),
    );
    expect(linkWithoutColour(`#${EXAMPLE_LINK}`)).toBe(
      EXAMPLE_LINK.replace("s=fire&", ""),
    );
  });

  it("drops a reversal and a shift as readily as a scheme", () => {
    const state: ViewLinkState = {
      ...EXAMPLE,
      colorScheme: "ocean",
      reverse: true,
      shift: 0.25,
    };

    expect(linkWithoutColour(encodeView(state))).toBe(
      linkWithoutColour(EXAMPLE_LINK),
    );
  });

  it("makes two links that differ only in their colours the same text", () => {
    const same = (change: Partial<ViewLinkState>) =>
      linkWithoutColour(encodeView({ ...EXAMPLE, ...change }));

    const first = same({ colorScheme: "classic" });
    const others: Partial<ViewLinkState>[] = [
      { colorScheme: "fire", reverse: true },
      { colorScheme: "grayscale", reverse: true, shift: 0.5 },
      { colorScheme: "rainbow", shift: 0.75 },
    ];

    for (const change of others) expect(same(change)).toBe(first);
  });

  it("keeps two links that differ in anything else apart", () => {
    const base = linkWithoutColour(encodeView(EXAMPLE));
    const others: Partial<ViewLinkState>[] = [
      { centerX: EXAMPLE.centerX + 0.001 },
      { centerY: EXAMPLE.centerY + 0.001 },
      { zoomLevel: EXAMPLE.zoomLevel * 2 },
      { fractalType: "mandelbrot", variant: undefined },
      { variant: "Dendrite" },
      { autoIterationsOn: false, maxIterations: 150 },
      { canvasWidth: 400, canvasHeight: 300 },
    ];

    for (const change of others) {
      expect(linkWithoutColour(encodeView({ ...EXAMPLE, ...change }))).not.toBe(
        base,
      );
    }
  });

  it("carries a custom Julia constant through unchanged", () => {
    const state: ViewLinkState = {
      ...EXAMPLE,
      variant: "custom:-0.8,0.156",
    };

    // The name survives the field being dropped and the rest re-serialised, so
    // the two halves of the check read the same way round.
    expect(linkWithoutColour(encodeView(state))).toContain(
      `k=${encodeURIComponent("custom:-0.8,0.156")}`,
    );
  });
});

describe("encodeView and decodeView: the scheme's own settings", () => {
  it("writes r and o after s and before i, and only when they say something", () => {
    expect(encodeView({ ...EXAMPLE, reverse: true })).toBe(
      "v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&r=1&i=auto&w=800&h=600",
    );
    expect(encodeView({ ...EXAMPLE, shift: 0.25 })).toBe(
      "v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&o=0.25&i=auto&w=800&h=600",
    );
    expect(encodeView({ ...EXAMPLE, reverse: true, shift: 0.25 })).toBe(
      "v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&r=1&o=0.25&i=auto&w=800&h=600",
    );
  });

  it("writes neither for a reversal that is off or a shift of nought", () => {
    expect(encodeView({ ...EXAMPLE, reverse: false, shift: 0 })).toBe(
      EXAMPLE_LINK,
    );
  });

  it("writes a shift with two decimals and no more", () => {
    // A third of a turn is a shade nobody can name; the hundredth is enough.
    expect(encodeView({ ...EXAMPLE, shift: 1 / 3 })).toContain("&o=0.33&");
    expect(encodeView({ ...EXAMPLE, shift: 0.1 })).toContain("&o=0.1&");
    expect(encodeView({ ...EXAMPLE, shift: 0.9042 })).toContain("&o=0.9&");
  });

  it("writes a shift outside 0 to 1 as the fraction it is worth", () => {
    // The mapping reads a shift modulo a whole turn, so a link that names the
    // same colours as one of ours is written the way ours is.
    expect(encodeView({ ...EXAMPLE, shift: 1.25 })).toContain("&o=0.25&");
    expect(encodeView({ ...EXAMPLE, shift: -0.25 })).toContain("&o=0.75&");
  });

  it("reads r and o back", () => {
    const read = decodeView(`#${EXAMPLE_LINK}&r=1&o=0.25`);

    expect(read.reverse).toBe(true);
    expect(read.shift).toBe(0.25);
  });

  it("writes a link with every field well inside the longest fragment it reads", () => {
    const link = encodeView({
      fractalType: "multibrot",
      variant: "4",
      centerX: -0.644,
      centerY: -0.094,
      zoomLevel: 2.56,
      colorScheme: "fire",
      reverse: true,
      shift: 0.25,
      autoIterationsOn: false,
      maxIterations: 430,
      canvasWidth: 1200,
      canvasHeight: 900,
    });

    expect(link).toBe(
      "v=1&f=multibrot&k=4&x=-0.644&y=-0.094&z=2.56&s=fire&r=1&o=0.25&i=430&w=1200&h=900",
    );
    expect(link.length).toBeLessThanOrEqual(MAX_FRAGMENT_LENGTH);
    expect(decodeView(link)).toMatchObject({
      reverse: true,
      shift: 0.25,
      maxIterations: 430,
    });
  });

  it("reads a whole turn of shift as nought, which is no shift", () => {
    expect(decodeView(`#${EXAMPLE_LINK}&o=1`).shift).toBe(0);
  });

  it("leaves out a shift outside 0 to 1, and any r that is not 1", () => {
    for (const value of ["2", "-1", "abc", "", "0x1", " 0.5"]) {
      expect(decodeView(`#${EXAMPLE_LINK}&o=${value}`).shift).toBeUndefined();
    }

    for (const value of ["2", "0", "true", ""]) {
      expect(decodeView(`#${EXAMPLE_LINK}&r=${value}`).reverse).toBeUndefined();
    }
  });

  it("reads r and o with no scheme beside them, since each field stands alone", () => {
    const read = decodeView("v=1&x=-0.75&r=1&o=0.5");

    expect(read.colorScheme).toBeUndefined();
    expect(read.reverse).toBe(true);
    expect(read.shift).toBe(0.5);
  });

  it("round-trips every sample state's settings, and reads nothing into a link without them", () => {
    for (const state of sampleStates()) {
      const read = decodeView(`#${encodeView(state)}`);

      expect(read.reverse ?? false).toBe(state.reverse ?? false);
      expect(read.shift ?? 0).toBe(state.shift ?? 0);
    }

    const plain = decodeView(`#${EXAMPLE_LINK}`);
    expect(plain.reverse).toBeUndefined();
    expect(plain.shift).toBeUndefined();
  });
});

describe("encodeView and decodeView: the orbit trap", () => {
  const SHAPES = ["point", "line", "circle"] as const;

  it("writes m after o and before i, and only when a shape is on", () => {
    for (const shape of SHAPES) {
      expect(encodeView({ ...EXAMPLE, trap: shape })).toBe(
        `v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&m=${shape}&i=auto&w=800&h=600`,
      );
    }

    expect(
      encodeView({ ...EXAMPLE, reverse: true, shift: 0.25, trap: "line" }),
    ).toBe(
      "v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&r=1&o=0.25&m=line&i=auto&w=800&h=600",
    );
  });

  it("writes the link a view with no trap always had, byte for byte", () => {
    expect(encodeView({ ...EXAMPLE, trap: null })).toBe(EXAMPLE_LINK);
    expect(encodeView({ ...EXAMPLE, trap: undefined })).toBe(EXAMPLE_LINK);
    expect(encodeView(EXAMPLE)).toBe(EXAMPLE_LINK);
  });

  it("does not write a trap this build does not know", () => {
    const state = { ...EXAMPLE, trap: "spiral" } as unknown as ViewLinkState;

    expect(encodeView(state)).toBe(EXAMPLE_LINK);
  });

  it("reads m back for each shape", () => {
    for (const shape of SHAPES) {
      expect(decodeView(`#${EXAMPLE_LINK}&m=${shape}`).trap).toBe(shape);
    }
  });

  it("leaves out an m it cannot read, so the page keeps its own", () => {
    for (const value of [
      "spiral",
      "",
      "Point",
      "CIRCLE",
      " line",
      "line ",
      "1",
      "point,line",
      "%00",
    ]) {
      expect(
        decodeView(`#${EXAMPLE_LINK}&m=${value}`).trap,
        value,
      ).toBeUndefined();
    }
  });

  it("reads a repeated m by its first value, as every key here is", () => {
    expect(decodeView(`#${EXAMPLE_LINK}&m=line&m=circle`).trap).toBe("line");
    expect(
      decodeView(`#${EXAMPLE_LINK}&m=spiral&m=circle`).trap,
    ).toBeUndefined();
  });

  it("reads m with no scheme beside it, since each field stands alone", () => {
    expect(decodeView("v=1&x=-0.75&m=circle").trap).toBe("circle");
  });

  it("round-trips every sample state with a trap, and reads none from a link without one", () => {
    for (const [index, state] of sampleStates().entries()) {
      const trap = [null, ...SHAPES][index % 4];
      const read = decodeView(`#${encodeView({ ...state, trap })}`);

      expect(read.trap ?? null).toBe(trap);
    }

    expect(decodeView(`#${EXAMPLE_LINK}`).trap).toBeUndefined();
  });

  it("keeps the longest link well inside the length limit with a trap on", () => {
    const link = encodeView({
      fractalType: "multibrot",
      variant: "4",
      centerX: -0.7436438870371587,
      centerY: 0.1318259042053119,
      zoomLevel: 2.56,
      colorScheme: "fire",
      reverse: true,
      shift: 0.25,
      trap: "circle",
      autoIterationsOn: false,
      maxIterations: 430,
      canvasWidth: 1200,
      canvasHeight: 900,
    });

    expect(link).toContain("&r=1&o=0.25&m=circle&i=430&");
    expect(link.length).toBeLessThanOrEqual(MAX_FRAGMENT_LENGTH);
  });

  it("keeps m in linkWithoutColour, so a change of trap is a render and not a repaint", () => {
    const plain = linkWithoutColour(encodeView(EXAMPLE));

    for (const shape of SHAPES) {
      const trapped = linkWithoutColour(
        encodeView({ ...EXAMPLE, trap: shape }),
      );

      expect(trapped).toContain(`m=${shape}`);
      expect(trapped).not.toBe(plain);
    }

    // ...while a scheme, reversal or shift inside one trap still compares equal,
    // which is what lets them repaint from the kept distances.
    expect(
      linkWithoutColour(
        encodeView({
          ...EXAMPLE,
          trap: "line",
          colorScheme: "ocean",
          reverse: true,
          shift: 0.5,
        }),
      ),
    ).toBe(linkWithoutColour(encodeView({ ...EXAMPLE, trap: "line" })));
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
