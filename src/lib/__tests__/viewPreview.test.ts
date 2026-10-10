import { describe, expect, it } from "vitest";

import { FRACTAL_TYPES, defaultVariant, defaultViewFor } from "../fractalTypes";
import { encodeTourLink } from "../tourLink";
import { decodeView, encodeView } from "../viewLink";
import { parseOgQuery } from "../ogView";
import {
  describeTourLine,
  describeViewLine,
  previewFor,
  type SearchParams,
} from "../viewPreview";
import {
  DEFAULT_VIEW_LINK_UPDATES,
  viewLinkToUpdates,
  type ViewLinkUpdates,
} from "../viewLinkState";

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

  it("names the pre-built picture of the nearest place, and says it is that place", () => {
    // The Dendrite set's only catalogue place: a deep view of the same set
    // previews as its whole set's picture, a static file rather than a render.
    const preview = previewFor(JULIA);

    expect(preview!.image).toBe("/og/julia-dendrite-whole.jpg");
    expect(preview!.imageType).toBe("image/jpeg");
    expect(preview!.alt).toBe(
      "Julia set, Dendrite, 400x, a picture of Dendrite: the whole set",
    );
  });

  it("shows every fractal the picker offers as one of its own places", () => {
    for (const type of FRACTAL_TYPES) {
      const query = `v=1&f=${type.id}`;
      const preview = previewFor(
        Object.fromEntries(new URLSearchParams(query)),
      );

      expect(preview!.image, type.id).toMatch(/^\/og\//);
      expect(preview!.imageType, type.id).toBe("image/jpeg");
      expect(preview!.alt, type.id).toContain("a picture of");
    }
  });

  it("only previews what /api/og would draw", () => {
    // The route refuses a known key whose value it cannot read; a preview that
    // pointed at it would be a broken card.
    expect(previewFor({ ...JULIA, x: "oops" })).toBeNull();
    expect(previewFor({ ...JULIA, s: "neon" })).toBeNull();
    expect(previewFor({ ...JULIA, f: "lyapunov" })).toBeNull();
  });

  it("previews a fractal-only link as that fractal's whole view, as the page opens it", () => {
    // A link can name a picture and no place in it, and the preview has to be
    // the view the page would open — the fractal's own frame, which is what
    // `viewLinkToUpdates` fills in for the page as well. Equal fragments is the
    // agreement: one text, one view, wherever it is read.
    const asParams = (query: string): SearchParams =>
      Object.fromEntries(new URLSearchParams(query));

    for (const type of FRACTAL_TYPES) {
      const query = `v=1&f=${type.id}`;
      const preview = previewFor(asParams(query));
      const frame = defaultViewFor(type.id);

      expect(preview, type.id).not.toBeNull();
      expect(preview!.fragment, type.id).toBe(
        encodeView(viewLinkToUpdates(decodeView(query))),
      );
      expect(decodeView(preview!.fragment), type.id).toMatchObject({
        centerX: frame.centerX,
        centerY: frame.centerY,
        zoomLevel: frame.zoom,
      });
      expect(parseOgQuery(preview!.fragment).ok, type.id).toBe(true);
    }

    // The reported link, in the words the card is described with.
    const dendrite = previewFor(asParams("v=1&f=julia&k=Dendrite&z=400"));

    expect(dendrite!.line).toBe("Julia set, Dendrite, 400x");
    expect(dendrite!.fragment).toBe(
      "v=1&f=julia&k=Dendrite&x=0&y=0&z=400&s=classic&i=auto&w=800&h=600",
    );
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
    expect(keys.every((key) => "vfkxyzsiwhro".includes(key))).toBe(true);
  });

  it("carries the scheme's own settings into the fragment and the card", () => {
    const preview = previewFor({ ...JULIA, r: "1", o: "0.25" });

    expect(preview).not.toBeNull();
    // The preview is the picture the link names, settings and all, so the
    // fragment keeps them where the codec writes them and the route that draws
    // it honours them.
    expect(preview!.fragment).toBe(
      "v=1&f=julia&k=Dendrite&x=-0.5&y=0.25&z=400&s=fire&r=1&o=0.25&i=auto&w=800&h=600",
    );
    expect(parseOgQuery(preview!.fragment).ok).toBe(true);
    // The phrase is about the view, not its colours: a reversed Julia set is
    // still "Julia set, Dendrite, 400x".
    expect(preview!.line).toBe("Julia set, Dendrite, 400x");
  });

  it("refuses a reversal or a shift the route would refuse", () => {
    expect(previewFor({ ...JULIA, r: "2" })).toBeNull();
    expect(previewFor({ ...JULIA, o: "7" })).toBeNull();
    expect(previewFor({ ...JULIA, o: "nope" })).toBeNull();
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
        const output = `${preview.fragment} ${preview.line} ${preview.image} ${preview.alt}`;

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

describe("previewFor with a tour link", () => {
  const stop = (changes: Partial<ViewLinkUpdates>): ViewLinkUpdates => ({
    fractalType: "mandelbrot",
    variant: defaultVariant("julia"),
    centerX: 0,
    centerY: 0,
    zoomLevel: 1,
    colorScheme: "classic",
    reverse: false,
    shift: 0,
    autoIterationsOn: true,
    maxIterations: DEFAULT_VIEW_LINK_UPDATES.maxIterations,
    canvasWidth: 800,
    canvasHeight: 600,
    ...changes,
  });
  const TOUR = encodeTourLink([
    stop({
      fractalType: "julia",
      variant: "Dendrite",
      centerX: -0.5,
      centerY: 0.25,
      zoomLevel: 400,
      colorScheme: "fire",
    }),
    stop({ fractalType: "tricorn", zoomLevel: 8 }),
    stop({ fractalType: "newton", centerX: 0.5, colorScheme: "ocean" }),
  ])!;

  /** A link as the route's `searchParams` hand it over. */
  const params = (link: string): SearchParams => {
    const out: Record<string, string> = {};

    for (const [key, value] of new URLSearchParams(link)) out[key] = value;

    return out;
  };

  it("is the first stop, as a view link, and says how long the tour is", () => {
    const preview = previewFor(params(TOUR));

    expect(preview).not.toBeNull();
    expect(preview!.line).toBe(
      "Tour of 3 views, starting at Julia set, Dendrite, 400x",
    );
    // The fragment is the codec's re-encoding of the first stop alone, which is
    // what /api/og draws and what the route's own reader accepts.
    expect(preview!.fragment).toBe(
      "v=1&f=julia&k=Dendrite&x=-0.5&y=0.25&z=400&s=fire&i=auto&w=800&h=600",
    );
    expect(parseOgQuery(preview!.fragment).ok).toBe(true);
  });

  it("shows the walk's first stop's picture, under the walk's own line", () => {
    const preview = previewFor(params(TOUR));

    expect(preview!.image).toBe("/og/julia-dendrite-whole.jpg");
    expect(preview!.imageType).toBe("image/jpeg");
    expect(preview!.alt).toBe(
      "Tour of 3 views, starting at Julia set, Dendrite, 400x, a picture of Dendrite: the whole set",
    );
  });

  it("beats a single view in the same query", () => {
    // A query that carries both: the columns are the tour's and the loose keys
    // are the view's, so neither reader mistakes one for the other, and the
    // link that names a walk is the one that previews.
    expect(previewFor({ ...params(TOUR), ...JULIA })).toEqual(
      previewFor(params(TOUR)),
    );
  });

  it("falls back to the view, or to the static card, for a link it cannot read", () => {
    // A tour of one stop is no tour, and the view beside it is still a view.
    const single = params("v=1&t.f=julia");

    expect(previewFor({ ...single, ...JULIA })).toEqual(previewFor(JULIA));
    expect(previewFor(single)).toBeNull();
    // Another version is neither reader's.
    expect(previewFor(params("v=2&t.f=julia~tricorn"))).toBeNull();
  });

  it("reads a two-stop link, and refuses one past its own limit", () => {
    expect(
      previewFor(
        params(
          encodeTourLink([
            stop({ fractalType: "julia" }),
            stop({ fractalType: "tricorn", zoomLevel: 8 }),
          ])!,
        ),
      )!.line,
    ).toBe("Tour of 2 views, starting at Julia set, Classic, 1x");

    expect(previewFor(params(`v=1&t.f=${"a".repeat(900)}~julia`))).toBeNull();
  });
});

describe("describeTourLine", () => {
  it("says how many views and where the walk begins", () => {
    expect(describeTourLine(2, "Tricorn, 8x")).toBe(
      "Tour of 2 views, starting at Tricorn, 8x",
    );
    expect(describeTourLine(1, "Tricorn, 8x")).toBe(
      "Tour of 1 view, starting at Tricorn, 8x",
    );
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
