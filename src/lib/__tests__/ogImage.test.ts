import { describe, expect, it } from "vitest";

import { FRACTAL_TYPES, defaultVariant, defaultViewFor } from "../fractalTypes";
import { CARD_PATH, OG_IMAGE_DIR, ogImageFor, ogImagePath } from "../ogImage";
import { PLACES, nearestPlace, type PlaceView } from "../places";

/** A view with the fields every case here has to state anyway. */
function view(
  changes: Partial<PlaceView> & Pick<PlaceView, "fractal">,
): PlaceView {
  return { centerX: 0, centerY: 0, zoom: 1, ...changes };
}

describe("ogImagePath", () => {
  it("is a place's id under the preview directory, as a JPEG", () => {
    expect(OG_IMAGE_DIR).toBe("/og");
    expect(ogImagePath("mandelbrot-whole")).toBe("/og/mandelbrot-whole.jpg");
  });
});

describe("ogImageFor", () => {
  it("names the place a view is on, for every place in the catalogue", () => {
    // The view a place describes is the one a click on its tile opens, so a
    // link to that view previews as that place's picture and never another's.
    for (const place of PLACES) {
      expect(ogImageFor(place), place.id).toBe(ogImagePath(place.id));
    }
  });

  it("gives the nearer place when a view is between two", () => {
    // Two places on the real axis, either side of the view: -1.45 sits nearer
    // the spiky little copy (-1.4786) than the bulbs along the needle (-1.4),
    // and -1.75 nearer the copy of the whole set (-1.7549).
    expect(
      ogImageFor(view({ fractal: "mandelbrot", centerX: -1.45, zoom: 8 })),
    ).toBe(ogImagePath("mandelbrot-spiky-copy"));
    expect(
      ogImageFor(view({ fractal: "mandelbrot", centerX: -1.75, zoom: 45 })),
    ).toBe(ogImagePath("mandelbrot-needle-copy"));
  });

  it("prefers a place of the view's own variant when the fractal has one", () => {
    // The Classic Julia set's spirals sit exactly at this view's centre, and
    // its constant is Dendrite: the picture is of the Dendrite set, since
    // another constant's Julia set is not this fractal's shape.
    expect(
      ogImageFor(
        view({ fractal: "julia", variant: "Dendrite", centerX: 0, zoom: 3 }),
      ),
    ).toBe(ogImagePath("julia-dendrite-whole"));

    // Likewise a Multibrot power: a power-5 view on a power-3 place is shown
    // as a power-5 picture, as near as the catalogue has one.
    expect(
      ogImageFor(
        view({
          fractal: "multibrot",
          variant: "5",
          centerX: 0.267,
          centerY: 1.26,
          zoom: 50,
        }),
      ),
    ).toBe(ogImagePath("multibrot-5-twin-bulbs"));
  });

  it("shows a Julia constant the catalogue has no place of as a Julia place", () => {
    for (const constant of ["custom:-0.4,0.6", "custom:0,0.9"]) {
      const image = ogImageFor(
        view({ fractal: "julia", variant: constant, centerX: 0 }),
      );

      expect(image).toMatch(/^\/og\/julia-/);
      expect(image).not.toBe(CARD_PATH);
    }
  });

  it("resolves every fractal the picker offers to one of its own places", () => {
    for (const type of FRACTAL_TYPES) {
      const image = ogImageFor(
        view({
          fractal: type.id,
          ...defaultViewFor(type.id),
          variant: defaultVariant(type.id),
        }),
      );

      expect(image, type.id).not.toBe(CARD_PATH);
      const place = PLACES.find((entry) => ogImagePath(entry.id) === image);
      expect(place?.fractal, type.id).toBe(type.id);
    }
  });

  it("falls back to the application's card for a view it cannot place", () => {
    const garbage: PlaceView[] = [
      view({ fractal: "mandelbrot", centerX: Number.NaN }),
      view({ fractal: "mandelbrot", centerY: Number.POSITIVE_INFINITY }),
      view({ fractal: "mandelbrot", zoom: 0 }),
      view({ fractal: "mandelbrot", zoom: -4 }),
      view({ fractal: "mandelbrot", zoom: Number.NaN }),
      view({ fractal: "lyapunov" }),
      view({ fractal: "" }),
    ];

    for (const entry of garbage) {
      expect(ogImageFor(entry), JSON.stringify(entry)).toBe(CARD_PATH);
    }
  });
});

describe("nearestPlace", () => {
  /** A tiny catalogue, so a rule can be shown without the real places. */
  const catalogue = [
    {
      id: "a",
      name: "A",
      fractal: "mandelbrot",
      centerX: 0,
      centerY: 0,
      zoom: 1,
    },
    {
      id: "b",
      name: "B",
      fractal: "mandelbrot",
      centerX: 1,
      centerY: 0,
      zoom: 1,
    },
    {
      id: "c",
      name: "C",
      fractal: "julia",
      variant: "Classic",
      centerX: 0,
      centerY: 0,
      zoom: 1,
    },
    {
      id: "d",
      name: "D",
      fractal: "julia",
      variant: "Dendrite",
      centerX: 0,
      centerY: 0,
      zoom: 1,
    },
  ] as const;

  it("gives the nearer of two, and the one the view is on", () => {
    const nearB = { fractal: "mandelbrot", centerX: 0.9, centerY: 0, zoom: 1 };

    expect(nearestPlace(nearB, catalogue)?.id).toBe("b");
    expect(nearestPlace({ ...nearB, centerX: 0 }, catalogue)?.id).toBe("a");
  });

  it("prefers the view's variant, then any place of the fractal", () => {
    const dendrite = {
      fractal: "julia",
      variant: "Dendrite",
      centerX: 0,
      centerY: 0,
      zoom: 1,
    };

    expect(nearestPlace(dendrite, catalogue)?.id).toBe("d");
    // No place of this constant: any Julia place is better than none, and the
    // two sit at the same centre, so the tie is broken by id.
    expect(
      nearestPlace({ ...dendrite, variant: "custom:0.1,0.2" }, catalogue)?.id,
    ).toBe("c");
  });

  it("answers null for a view it cannot measure or place", () => {
    expect(
      nearestPlace(
        { fractal: "mandelbrot", centerX: Number.NaN, centerY: 0, zoom: 1 },
        catalogue,
      ),
    ).toBeNull();
    expect(
      nearestPlace(
        { fractal: "tricorn", centerX: 0, centerY: 0, zoom: 1 },
        catalogue,
      ),
    ).toBeNull();
    expect(
      nearestPlace(
        { fractal: "mandelbrot", centerX: 0, centerY: 0, zoom: 1 },
        [],
      ),
    ).toBeNull();
  });
});
