import { describe, expect, it } from "vitest";

import { resolveFractalKind } from "../fractalTypes";
import {
  BASE_HEIGHT,
  autoIterations,
  calculateZoomBounds,
} from "../mandelbrot";
import {
  OG_HEIGHT,
  OG_MAX_ITERATIONS,
  OG_WIDTH,
  cardBounds,
  parseOgQuery,
  type OgView,
} from "../ogView";
import { decodeView } from "../viewLink";

function view(query: string): OgView {
  const parsed = parseOgQuery(query);
  if (!parsed.ok) throw new Error(`expected a view: ${parsed.message}`);
  return parsed.view;
}

function refusal(query: string): string {
  const parsed = parseOgQuery(query);
  if (parsed.ok) throw new Error(`expected a refusal for ${query}`);
  return parsed.message;
}

describe("parseOgQuery", () => {
  it("reads the query the link codec writes, with or without its ?", () => {
    const link = "v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto";

    expect(view(link).key).toBe(view(`?${link}`).key);
    expect(view(link).colorScheme).toBe("fire");
  });

  it("honours a reversed or shifted scheme, in the key and in what draws", () => {
    const plain = view("v=1&f=mandelbrot&z=3&s=fire");
    const reversed = view("v=1&f=mandelbrot&z=3&s=fire&r=1&o=0.25");

    expect(reversed.colorOptions).toEqual({ reverse: true, shift: 0.25 });
    expect(reversed.key).toContain("&r=1&o=0.25&");
    // Two pictures, so two keys: the cache holds the colours the link named.
    expect(reversed.key).not.toBe(plain.key);
    expect(plain.colorOptions).toEqual({ reverse: false, shift: 0 });
  });

  it("rounds a shift the codec writes, so the key names the picture exactly", () => {
    const key = view("v=1&f=mandelbrot&z=3&s=fire&o=0.33").key;

    expect(key).toContain("&o=0.33&");
    expect(view(key).colorOptions.shift).toBe(0.33);
  });

  it("reads a whole turn of shift as nought, and writes no key for it", () => {
    const whole = view("v=1&f=mandelbrot&z=3&s=fire&o=1");

    expect(whole.colorOptions).toEqual({ reverse: false, shift: 0 });
    expect(whole.key).toBe(view("v=1&f=mandelbrot&z=3&s=fire").key);
    expect(whole.key).not.toMatch(/&o=/);
  });

  it("reads a reversal with no scheme beside it, since each field stands alone", () => {
    expect(view("v=1&x=-0.75&r=1").colorOptions).toEqual({
      reverse: true,
      shift: 0,
    });
  });

  it("resolves the fractal and its variant the way the page does", () => {
    const julia = view("v=1&f=julia&k=Dendrite&x=0&y=0&z=1");
    const point = { real: 0.3, imaginary: 0.2 };

    expect(julia.kind.id).toBe("julia");
    expect(julia.kind.iterations(point, 200, true)).toBe(
      resolveFractalKind("julia", "Dendrite").iterations(point, 200, true),
    );
    expect(
      view("v=1&f=multibrot&k=4&x=0&y=0&z=1").kind.iterations(point, 99, true),
    ).toBe(resolveFractalKind("multibrot", "4").iterations(point, 99, true));
    expect(view("v=1&f=newton").kind.id).toBe("newton");
  });

  it("fills what the link leaves out with the page's opening view", () => {
    const opening = view("v=1&s=fire");

    expect(opening.kind.id).toBe("mandelbrot");
    expect(opening.bounds).toEqual(cardBounds(-0.75, 0, 1));
    expect(opening.colorScheme).toBe("fire");
  });

  describe("iterations", () => {
    it("takes the zoom's Auto count when i is auto or absent", () => {
      expect(view("v=1&z=2&i=auto").maxIterations).toBe(autoIterations(2));
      expect(view("v=1&z=2").maxIterations).toBe(autoIterations(2));
      expect(view("v=1&z=2").maxIterations).toBe(150);
    });

    it("holds Auto to 400 for a deep view", () => {
      expect(autoIterations(400)).toBeGreaterThan(OG_MAX_ITERATIONS);
      expect(view("v=1&z=400&i=auto").maxIterations).toBe(400);
      expect(view("v=1&z=10000").maxIterations).toBe(400);
    });

    it("takes a count the link names, held to 400", () => {
      expect(view("v=1&i=200").maxIterations).toBe(200);
      expect(view("v=1&i=400").maxIterations).toBe(400);
      expect(view("v=1&i=1000").maxIterations).toBe(400);
      expect(view("v=1&i=50").maxIterations).toBe(50);
    });
  });

  describe("bounds", () => {
    it("keeps the 4:3 view's height and centre and widens to the card", () => {
      const bounds = view("v=1&x=-0.5&y=0.25&z=8").bounds;
      const page = calculateZoomBounds(-0.5, 0.25, 8);

      expect(bounds.minImaginary).toBeCloseTo(page.minImaginary, 12);
      expect(bounds.maxImaginary).toBeCloseTo(page.maxImaginary, 12);
      expect((bounds.minReal + bounds.maxReal) / 2).toBeCloseTo(-0.5, 12);
      expect(bounds.maxImaginary - bounds.minImaginary).toBeCloseTo(
        BASE_HEIGHT / 8,
        12,
      );
    });

    it("has square pixels at 1200x630", () => {
      const b = cardBounds(0.3, -0.2, 40);
      const perPixelX = (b.maxReal - b.minReal) / OG_WIDTH;
      const perPixelY = (b.maxImaginary - b.minImaginary) / OG_HEIGHT;

      expect(perPixelX).toBeCloseTo(perPixelY, 15);
    });

    it("contains the whole of the 4:3 view the visitor had", () => {
      for (const zoom of [1, 2.5, 400]) {
        const card = cardBounds(-0.7453, 0.1127, zoom);
        const page = calculateZoomBounds(-0.7453, 0.1127, zoom);

        expect(card.minReal).toBeLessThan(page.minReal);
        expect(card.maxReal).toBeGreaterThan(page.maxReal);
        expect(card.minImaginary).toBeCloseTo(page.minImaginary, 12);
        expect(card.maxImaginary).toBeCloseTo(page.maxImaginary, 12);
      }
    });
  });

  describe("the canonical key", () => {
    it("is the codec's own encoding, written from the view", () => {
      expect(
        view("v=1&f=mandelbrot&x=-0.7453&y=0.1127&z=400&s=ocean").key,
      ).toBe("v=1&f=mandelbrot&x=-0.7453&y=0.1127&z=400&s=ocean&i=400");
    });

    it("is one string for spellings of one picture", () => {
      const key = view(
        "v=1&f=julia&k=Classic&x=0.5&y=0.25&z=3&s=fire&i=auto",
      ).key;

      expect(
        view("s=fire&z=3.0&y=0.250&x=0.50&k=Classic&f=julia&v=1").key,
      ).toBe(key);
      expect(
        view(
          `v=1&f=julia&k=Classic&x=0.5&y=0.25&z=3&s=fire&i=${autoIterations(3)}`,
        ).key,
      ).toBe(key);
    });

    it("ignores the canvas size, which changes nothing about the card", () => {
      const plain = view("v=1&f=newton&z=2");

      expect(view("v=1&f=newton&z=2&w=400&h=300").key).toBe(plain.key);
      expect(view("v=1&f=newton&z=2&w=1200&h=900").key).toBe(plain.key);
      expect(plain.key).not.toMatch(/[&?](w|h)=/);
    });

    it("drops keys it does not know and a variant the fractal cannot use", () => {
      const plain = view("v=1&f=mandelbrot&z=3");

      expect(view("v=1&f=mandelbrot&z=3&tour=1&utm_source=x").key).toBe(
        plain.key,
      );
      expect(view("v=1&f=mandelbrot&k=4&z=3").key).toBe(plain.key);
    });

    it("differs when the picture does", () => {
      const keys = new Set([
        view("v=1&f=mandelbrot&z=3").key,
        view("v=1&f=julia&z=3").key,
        view("v=1&f=julia&k=Dendrite&z=3").key,
        view("v=1&f=mandelbrot&z=4").key,
        view("v=1&f=mandelbrot&z=3&s=fire").key,
        view("v=1&f=mandelbrot&z=3&i=100").key,
      ]);

      expect(keys.size).toBe(6);
    });

    it("names the image exactly: the key parses to itself", () => {
      const first = view(
        "v=1&f=mandelbrot&x=-0.74530000000001&y=0.11&z=400.000000001",
      );
      const again = view(first.key);

      expect(again.key).toBe(first.key);
      expect(again.bounds).toEqual(first.bounds);
    });
  });

  describe("refusals", () => {
    const EMPTY_OR_NOT_A_VIEW = [
      "",
      "?",
      "v=1",
      "v=2&f=julia&x=1",
      "f=julia&x=0.1&y=0.2&z=5",
      "tour",
      "v=1&tour=1",
      "utm_source=x",
      "&&&",
      "%",
      "v=%",
    ];

    it.each(EMPTY_OR_NOT_A_VIEW)("refuses %j, which names no view", (query) => {
      expect(refusal(query)).toMatch(/Not a view/);
    });

    it.each([
      ["f", "v=1&f=lyapunov"],
      ["f", "v=1&f="],
      ["f", "v=1&f=__proto__"],
      ["k", "v=1&f=julia&k=Nope"],
      ["k", "v=1&f=julia&k=custom:9,9"],
      ["x", "v=1&x=abc"],
      ["x", "v=1&x=1e3"],
      ["x", "v=1&x=11"],
      ["x", "v=1&x=-10.5"],
      ["x", "v=1&x=NaN"],
      ["x", "v=1&x=Infinity"],
      ["x", "v=1&x=0x10"],
      ["y", "v=1&y="],
      ["y", "v=1&y=%3Cscript%3E"],
      ["z", "v=1&z=zero"],
      ["z", "v=1&z=-"],
      ["s", "v=1&s=neon"],
      ["s", "v=1&s=CLASSIC"],
      ["r", "v=1&r=2"],
      ["r", "v=1&r=yes"],
      ["o", "v=1&o=abc"],
      ["o", "v=1&o=2"],
      ["o", "v=1&o=-1"],
      ["o", "v=1&o="],
      ["i", "v=1&i=7"],
      ["i", "v=1&i=5000"],
      ["i", "v=1&i=1.5"],
      ["i", "v=1&i=lots"],
      ["w", "v=1&w=800"],
      ["w", "v=1&w=13&h=7"],
      ["h", "v=1&h=600"],
    ])("refuses a link whose %s cannot be read: %s", (key, query) => {
      expect(refusal(query)).toBe(`Cannot read the value of "${key}".`);
    });

    it("refuses a link where one good field sits beside a bad one", () => {
      expect(refusal("v=1&f=julia&k=Classic&x=0.1&y=oops")).toContain('"y"');
    });

    it("refuses what is too long to be a link, before reading it", () => {
      const long = `v=1&f=julia&x=${"1".repeat(600)}`;

      expect(long.length).toBeGreaterThan(500);
      expect(refusal(long)).toMatch(/Not a view/);
    });

    it("never repeats a value it refused", () => {
      const hostile = "<script>alert(1)</script>";
      const message = refusal(`v=1&x=${encodeURIComponent(hostile)}`);

      expect(message).not.toContain("script");
      expect(message.length).toBeLessThan(80);
    });

    it("clamps a zoom past the range as the page does, rather than refusing it", () => {
      expect(view("v=1&z=99999999").key).toContain("z=10000");
      expect(view("v=1&z=0.001").key).toContain("z=1&");
    });
  });

  it("agrees with the decoder about what is a view at all", () => {
    for (const query of ["v=1&x=0.5", "v=1&f=newton", "v=2&x=0.5", ""]) {
      const decoded = Object.keys(decodeView(query)).length > 0;

      expect(parseOgQuery(query).ok).toBe(decoded);
    }
  });
});
