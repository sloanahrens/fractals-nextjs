import { describe, expect, it } from "vitest";

import { decodeView, encodeView } from "../viewLink";
import { parseOgQuery } from "../ogView";
import { describeViewLine, previewFor } from "../viewPreview";
import { viewLinkToUpdates } from "../viewLinkState";

const JULIA = {
  v: "1",
  f: "julia",
  k: "Dendrite",
  x: "-0.5",
  y: "0.25",
  z: "400",
  s: "fire",
  i: "auto",
};

describe("previewFor", () => {
  it("is null for no parameters and for parameters that name no view", () => {
    expect(previewFor({})).toBeNull();
    expect(previewFor({ utm_source: "mail" })).toBeNull();
    expect(previewFor({ v: "1" })).toBeNull();
    expect(previewFor({ v: "2", f: "julia", z: "4" })).toBeNull();
    expect(previewFor({ f: "julia", z: "4" })).toBeNull();
  });

  it("is the codec's re-encoding of a valid view, and the phrase for it", () => {
    const preview = previewFor(JULIA);

    expect(preview).not.toBeNull();
    expect(preview!.line).toBe("Julia set, Dendrite, 400x");
    // The fragment is what encodeView writes for the decoded state: the codec's
    // order, the canvas size filled in, nothing else.
    expect(preview!.fragment).toBe(
      "v=1&f=julia&k=Dendrite&x=-0.5&y=0.25&z=400&s=fire&i=auto&w=800&h=600",
    );
    expect(parseOgQuery(preview!.fragment).ok).toBe(true);
  });

  it("only previews what /api/og would draw", () => {
    // The route refuses a known key whose value it cannot read; a preview that
    // pointed at it would be a broken card.
    expect(previewFor({ ...JULIA, x: "oops" })).toBeNull();
    expect(previewFor({ ...JULIA, s: "neon" })).toBeNull();
    expect(previewFor({ ...JULIA, f: "lyapunov" })).toBeNull();
  });

  it("writes known fields only: unknown keys never reach the fragment", () => {
    const preview = previewFor({
      ...JULIA,
      fbclid: "abc",
      evil: "<script>alert(1)</script>",
      tour: "1",
    });
    const keys = [...new URLSearchParams(preview!.fragment).keys()];

    expect(preview!.fragment).not.toMatch(/fbclid|evil|script|tour/);
    expect(keys.every((key) => "vfkxyzsiwh".includes(key))).toBe(true);
  });

  it("reads a repeated key by its first value", () => {
    const preview = previewFor({
      ...JULIA,
      f: ["tricorn", "julia"],
      z: ["8", "9"],
    });

    expect(preview!.line).toBe("Tricorn, 8x");
    expect(decodeView(preview!.fragment).zoomLevel).toBe(8);
  });

  it("clamps a zoom past the range, as the page does", () => {
    expect(previewFor({ ...JULIA, z: "99999999" })!.line).toBe(
      "Julia set, Dendrite, 10.0Kx",
    );
  });

  it("refuses a 600-character value and nests no encoding", () => {
    expect(previewFor({ ...JULIA, k: "A".repeat(600) })).toBeNull();
    expect(previewFor({ ...JULIA, z: "9".repeat(600) })).toBeNull();

    // Next decodes once: %2566 arrives as the text %66, which is not a fractal.
    expect(previewFor({ ...JULIA, f: "%66ractal" })).toBeNull();
    expect(previewFor({ ...JULIA, f: "%2566ractal" })).toBeNull();
  });

  it("never lets script-looking text near the output", () => {
    const hostile = [
      "<script>alert(1)</script>",
      '"><img src=x onerror=alert(1)>',
      "javascript:alert(1)",
      "{{7*7}}",
      "\u0000‮",
    ];

    for (const text of hostile) {
      for (const key of ["f", "k", "s", "x", "y", "z", "i", "w", "h", "v"]) {
        const preview = previewFor({ ...JULIA, [key]: text });
        if (preview === null) continue;
        const output = `${preview.fragment} ${preview.line}`;

        expect(output).not.toMatch(/[<>"'{}\\]|script|onerror/);
      }
    }
  });

  it("names a custom Julia constant by its numbers, not its text", () => {
    const preview = previewFor({ ...JULIA, k: "custom:-0.8,0.156" });

    expect(preview!.line).toBe("Julia set, c = -0.8 + 0.156i, 400x");
    expect(preview!.fragment).toContain("k=custom%3A-0.8%2C0.156");
  });

  it("takes an array of nothing as nothing", () => {
    expect(previewFor({ v: [], f: undefined })).toBeNull();
  });
});

describe("describeViewLine", () => {
  const line = (link: Parameters<typeof encodeView>[0]) =>
    describeViewLine(viewLinkToUpdates(decodeView(encodeView(link))));
  const base = {
    centerX: 0,
    centerY: 0,
    zoomLevel: 1,
    colorScheme: "classic" as const,
    autoIterationsOn: true,
    canvasWidth: 800,
    canvasHeight: 600,
  };

  it("says the fractal, its setting and the zoom for every fractal", () => {
    expect(line({ ...base, fractalType: "mandelbrot" })).toBe(
      "Mandelbrot set, 1x",
    );
    expect(line({ ...base, fractalType: "burning-ship", zoomLevel: 40 })).toBe(
      "Burning Ship, 40x",
    );
    expect(line({ ...base, fractalType: "tricorn" })).toBe("Tricorn, 1x");
    expect(line({ ...base, fractalType: "newton", zoomLevel: 8 })).toBe(
      "Newton fractal, 8x",
    );
    expect(line({ ...base, fractalType: "multibrot", variant: "4" })).toBe(
      "Multibrot, z^4, 1x",
    );
    expect(
      line({ ...base, fractalType: "julia", variant: "Douady rabbit" }),
    ).toBe("Julia set, Douady rabbit, 1x");
  });
});
