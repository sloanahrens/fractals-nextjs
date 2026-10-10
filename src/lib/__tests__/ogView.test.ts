import { describe, expect, it } from "vitest";

import { BASE_HEIGHT, calculateZoomBounds } from "../mandelbrot";
import { OG_HEIGHT, OG_WIDTH, cardBounds, parseOgQuery } from "../ogView";
import { decodeView } from "../viewLink";
import type { ViewLinkUpdates } from "../viewLinkState";

function view(query: string): ViewLinkUpdates {
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
    const withMark = view(`?${link}`);

    expect(view(link)).toEqual(withMark);
    expect(withMark.fractalType).toBe("julia");
    expect(withMark.variant).toBe("Classic");
    expect(withMark.centerX).toBe(-0.644);
    expect(withMark.zoomLevel).toBe(2.56);
    expect(withMark.colorScheme).toBe("fire");
  });

  it("honours a reversed or shifted scheme, since each field stands alone", () => {
    expect(view("v=1&f=mandelbrot&z=3&s=fire&r=1&o=0.25")).toMatchObject({
      reverse: true,
      shift: 0.25,
    });
    // A whole turn is no shift, read the way the mapping reads it.
    expect(view("v=1&f=mandelbrot&z=3&s=fire&o=1").shift).toBe(0);
    expect(view("v=1&x=-0.75&r=1")).toMatchObject({ reverse: true, shift: 0 });
  });

  it("fills what the link leaves out with the page's own view", () => {
    const opening = view("v=1&s=fire");

    expect(opening.fractalType).toBe("mandelbrot");
    expect(opening.centerX).toBe(-0.75);
    expect(opening.centerY).toBe(0);
    expect(opening.zoomLevel).toBe(1);
    expect(opening.colorScheme).toBe("fire");
  });

  it("opens a link that names a fractal and no centre on that fractal's own frame", () => {
    // The reported link (fr-99q): the Dendrite at 400x, whole. The missing
    // centre is that fractal's default view, not the Mandelbrot set's, which is
    // what keeps the picture the route sends a crawler to from being empty
    // plane.
    expect(view("v=1&f=julia&k=Dendrite&z=400")).toMatchObject({
      fractalType: "julia",
      variant: "Dendrite",
      centerX: 0,
      centerY: 0,
      zoomLevel: 400,
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
      expect(view("v=1&z=99999999").zoomLevel).toBe(10000);
      expect(view("v=1&z=0.001").zoomLevel).toBe(1);
    });
  });

  it("agrees with the decoder about what is a view at all", () => {
    for (const query of ["v=1&x=0.5", "v=1&f=newton", "v=2&x=0.5", ""]) {
      const decoded = Object.keys(decodeView(query)).length > 0;

      expect(parseOgQuery(query).ok).toBe(decoded);
    }
  });
});

describe("cardBounds", () => {
  it("keeps the 4:3 view's height and centre and widens to the card", () => {
    const bounds = cardBounds(-0.5, 0.25, 8);
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
