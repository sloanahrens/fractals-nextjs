import { describe, expect, it } from "vitest";

import { FractalRenderer } from "../fractalRenderer";
import {
  FRACTAL_TYPES,
  defaultViewFor,
  fractalVariants,
  isVariantValue,
  resolveFractalKind,
} from "../fractalTypes";
import {
  FEATURED_MAX_UNIFORM_SHARE,
  isBlankImage,
  nearUniformShare,
} from "../blankView";
import { JULIA_CONSTANTS, parseJuliaConstant } from "../julia";
import {
  MAX_ZOOM,
  BASE_HEIGHT,
  MIN_ZOOM,
  autoIterations,
  calculateZoomBounds,
} from "../mandelbrot";
import type { ColorScheme } from "../../types/fractal";
import { NEWTON_BAND } from "../newton";
import {
  FEATURED_PLACE_IDS,
  PLACES,
  REAL_AXIS_GUARD_MIN_ZOOM,
  REAL_AXIS_MATCHES_MANDELBROT,
  featuredPlace,
  placeColorScheme,
  placesForFractal,
  suggest,
  wholeSetPlaceFor,
  type Place,
  type PlaceView,
} from "../places";
import { decodeView, encodeView } from "../viewLink";

/** Every colour scheme the page offers, for a test that varies the page's. */
const SCHEMES: readonly ColorScheme[] = [
  "classic",
  "fire",
  "ocean",
  "rainbow",
  "grayscale",
];

/** A hand-built place on the Mandelbrot set; a test overrides what it is about. */
function place(id: string, overrides: Partial<Place> = {}): Place {
  return {
    id,
    name: id,
    fractal: "mandelbrot",
    centerX: 0,
    centerY: 0,
    zoom: 10,
    ...overrides,
  };
}

/** A view on the Mandelbrot set at zoom 10, whose span is 0.4. */
const VIEW: PlaceView = {
  fractal: "mandelbrot",
  centerX: 0,
  centerY: 0,
  zoom: 10,
};

function ids(places: readonly Place[]): string[] {
  return places.map((entry) => entry.id);
}

describe("suggest", () => {
  it("ranks by centre distance in the view's spans plus the zoom's distance from a step in", () => {
    // Span 0.4. The scores: nearest-and-two-octaves-in 0.25, farther-and-in 1.0,
    // near and one octave in 1.1, near at the same zoom 2.1, near and shallower
    // 4.1.
    const catalogue = [
      place("shallow", { centerX: 0.04, zoom: 2.5 }),
      place("same-zoom", { centerX: 0.04, zoom: 10 }),
      place("one-octave", { centerY: 0.04, zoom: 20 }),
      place("far-in", { centerX: 0.4, zoom: 40 }),
      place("near-in", { centerX: 0.1, zoom: 40 }),
    ];

    expect(ids(suggest(VIEW, catalogue, 5))).toEqual([
      "near-in",
      "far-in",
      "one-octave",
      "same-zoom",
      "shallow",
    ]);
  });

  it("prefers a place deeper than the view to one as near and shallower", () => {
    const catalogue = [
      place("shallower", { centerX: 0.04, zoom: 5 }),
      place("deeper", { centerX: 0.04, zoom: 20 }),
    ];

    expect(ids(suggest(VIEW, catalogue, 2))).toEqual(["deeper", "shallower"]);
  });

  it("measures the centre in the view's own spans", () => {
    // The same absolute layout reads differently at two zooms. A place 0.2
    // away that is two octaves in, against one 0.1 away at the view's own
    // zoom: from zoom 10 (span 0.4) the first is half a screen off and wins,
    // from zoom 100 (span 0.04) it is five screens off and loses.
    const wideView = { ...VIEW, zoom: 10 };
    const deepView = { ...VIEW, zoom: 100 };

    expect(
      ids(
        suggest(
          wideView,
          [
            place("in", { centerX: 0.2, zoom: 40 }),
            place("here", { centerX: 0.1, zoom: 10 }),
          ],
          2,
        ),
      ),
    ).toEqual(["in", "here"]);
    expect(
      ids(
        suggest(
          deepView,
          [
            place("in", { centerX: 0.2, zoom: 400 }),
            place("here", { centerX: 0.1, zoom: 100 }),
          ],
          2,
        ),
      ),
    ).toEqual(["here", "in"]);
  });

  it("breaks a tie by id, whatever order the catalogue is in", () => {
    const left = place("b", { centerX: -0.1 });
    const right = place("a", { centerX: 0.1 });

    expect(ids(suggest(VIEW, [left, right], 2))).toEqual(["a", "b"]);
    expect(ids(suggest(VIEW, [right, left], 2))).toEqual(["a", "b"]);
  });

  it("is deterministic and leaves the catalogue as it found it", () => {
    const catalogue = [
      place("c", { centerX: 0.3, zoom: 40 }),
      place("a", { centerX: 0.1, zoom: 40 }),
      place("b", { centerX: 0.2, zoom: 40 }),
    ];
    const before = ids(catalogue);

    expect(suggest(VIEW, catalogue, 3)).toEqual(suggest(VIEW, catalogue, 3));
    expect(ids(catalogue)).toEqual(before);
  });

  it("returns at most the count asked for", () => {
    const catalogue = [
      place("a", { centerX: 0.1 }),
      place("b", { centerX: 0.2 }),
      place("c", { centerX: 0.3 }),
    ];

    expect(ids(suggest(VIEW, catalogue, 2))).toEqual(["a", "b"]);
    expect(ids(suggest(VIEW, catalogue, 1))).toEqual(["a"]);
  });

  it("returns what exists when the count is larger than the catalogue", () => {
    const catalogue = [
      place("a", { centerX: 0.1 }),
      place("b", { centerX: 0.2 }),
    ];

    expect(suggest(VIEW, catalogue, 50)).toHaveLength(2);
  });

  it("returns nothing for a count that asks for nothing", () => {
    const catalogue = [place("a", { centerX: 0.1 })];

    expect(suggest(VIEW, catalogue, 0)).toEqual([]);
    expect(suggest(VIEW, catalogue, -3)).toEqual([]);
    expect(suggest(VIEW, catalogue, Number.NaN)).toEqual([]);
    expect(suggest(VIEW, catalogue, 0.5)).toEqual([]);
  });

  it("rounds a fractional count down", () => {
    const catalogue = [
      place("a", { centerX: 0.1 }),
      place("b", { centerX: 0.2 }),
      place("c", { centerX: 0.3 }),
    ];

    expect(suggest(VIEW, catalogue, 2.9)).toHaveLength(2);
  });

  it("returns nothing from an empty catalogue", () => {
    expect(suggest(VIEW, [], 5)).toEqual([]);
  });

  it("still ranks the places for a view far from every one of them", () => {
    const far: PlaceView = { ...VIEW, centerX: 1000, centerY: -1000 };
    const catalogue = [
      place("far", { centerX: -5, centerY: 5, zoom: 40 }),
      place("nearer", { centerX: 5, centerY: -5, zoom: 40 }),
    ];

    expect(ids(suggest(far, catalogue, 5))).toEqual(["nearer", "far"]);
  });

  it("considers only places of the view's own fractal", () => {
    const catalogue = [
      place("mandelbrot-place", { centerX: 0.5 }),
      place("ship-place", { fractal: "burning-ship", centerX: 0.01, zoom: 40 }),
      place("julia-place", {
        fractal: "julia",
        variant: "Classic",
        centerX: 0.01,
        zoom: 40,
      }),
    ];

    expect(ids(suggest(VIEW, catalogue, 5))).toEqual(["mandelbrot-place"]);
    expect(
      ids(suggest({ ...VIEW, fractal: "burning-ship" }, catalogue, 5)),
    ).toEqual(["ship-place"]);
    expect(ids(suggest({ ...VIEW, fractal: "koch" }, catalogue, 5))).toEqual(
      [],
    );
  });

  it("never returns the place that is the view", () => {
    const catalogue = [place("here"), place("elsewhere", { centerX: 1 })];

    expect(ids(suggest(VIEW, catalogue, 5))).toEqual(["elsewhere"]);
  });

  it("treats a place within 1% of the span and the zoom as the view", () => {
    // Span 0.4, so 1% is 0.004 of the centre; 1% of the zoom is 10.1.
    const catalogue = [
      place("jitter", { centerX: 0.0039, centerY: -0.0039, zoom: 10.09 }),
    ];

    expect(suggest(VIEW, catalogue, 5)).toEqual([]);
  });

  it("keeps a place that is past 1% on any one measure", () => {
    const catalogue = [
      place("off-x", { centerX: 0.0045 }),
      place("off-y", { centerY: -0.0045 }),
      place("off-zoom", { zoom: 10.2 }),
    ];

    expect(ids(suggest(VIEW, catalogue, 5)).sort()).toEqual([
      "off-x",
      "off-y",
      "off-zoom",
    ]);
  });

  it("scales the 1% to the view's span", () => {
    // A 0.003 offset is inside 1% of a span of 0.4, and several spans of 0.004.
    expect(suggest(VIEW, [place("near", { centerX: 0.003 })], 5)).toEqual([]);
    expect(
      ids(
        suggest(
          { ...VIEW, zoom: 1000 },
          [place("near", { centerX: 0.003, zoom: 1000 })],
          5,
        ),
      ),
    ).toEqual(["near"]);
  });

  it("returns nothing for a view it cannot measure", () => {
    const catalogue = [place("a", { centerX: 0.1 })];

    expect(suggest({ ...VIEW, zoom: Number.NaN }, catalogue, 5)).toEqual([]);
    expect(suggest({ ...VIEW, zoom: 0 }, catalogue, 5)).toEqual([]);
    expect(suggest({ ...VIEW, zoom: -2 }, catalogue, 5)).toEqual([]);
    expect(suggest({ ...VIEW, centerX: Infinity }, catalogue, 5)).toEqual([]);
    expect(suggest({ ...VIEW, centerY: Number.NaN }, catalogue, 5)).toEqual([]);
  });
});

describe("suggest on a Julia view", () => {
  const JULIA_VIEW: PlaceView = {
    fractal: "julia",
    variant: "Classic",
    centerX: 0,
    centerY: 0,
    zoom: 10,
  };

  function julia(id: string, constant: string, overrides: Partial<Place> = {}) {
    return place(id, {
      fractal: "julia",
      variant: constant,
      ...overrides,
    });
  }

  it("lists the places of the view's constant before any other constant's", () => {
    // The rabbit place is nearer and exactly the right depth; the Classic one
    // is far away and still comes first.
    const catalogue = [
      julia("rabbit-near", "Douady rabbit", { centerX: 0.1, zoom: 40 }),
      julia("classic-far", "Classic", { centerX: 3, zoom: 40 }),
    ];

    expect(ids(suggest(JULIA_VIEW, catalogue, 5))).toEqual([
      "classic-far",
      "rabbit-near",
    ]);
  });

  it("ranks each group on its own distances", () => {
    const catalogue = [
      julia("other-b", "Dendrite", { centerX: 0.2, zoom: 40 }),
      julia("same-b", "Classic", { centerX: 0.2, zoom: 40 }),
      julia("other-a", "Dendrite", { centerX: 0.1, zoom: 40 }),
      julia("same-a", "Classic", { centerX: 0.1, zoom: 40 }),
    ];

    expect(ids(suggest(JULIA_VIEW, catalogue, 4))).toEqual([
      "same-a",
      "same-b",
      "other-a",
      "other-b",
    ]);
  });

  it("does not exclude another constant's place at the view's own centre and zoom", () => {
    const catalogue = [
      julia("same", "Classic", { zoom: 10 }),
      julia("other", "Dendrite", { zoom: 10 }),
    ];

    expect(ids(suggest(JULIA_VIEW, catalogue, 5))).toEqual(["other"]);
  });

  it("recognises one constant under two spellings", () => {
    const view = { ...JULIA_VIEW, variant: "custom:0.50,0.500" };
    const catalogue = [
      julia("other", "Classic", { centerX: 0.1, zoom: 40 }),
      julia("same", "custom:0.5,0.5", { centerX: 3, zoom: 40 }),
    ];

    expect(ids(suggest(view, catalogue, 5))).toEqual(["same", "other"]);
  });

  it("lists every place after the first group when the view has no constant", () => {
    const view: PlaceView = { ...JULIA_VIEW, variant: undefined };
    const catalogue = [
      julia("b", "Classic", { centerX: 0.2, zoom: 40 }),
      julia("a", "Dendrite", { centerX: 0.1, zoom: 40 }),
    ];

    expect(ids(suggest(view, catalogue, 5))).toEqual(["a", "b"]);
  });

  it("ignores the constant for a fractal that has none", () => {
    const view: PlaceView = { ...VIEW, variant: "Classic" };
    const catalogue = [
      place("a", { centerX: 0.1, zoom: 40 }),
      place("b", { centerX: 0.2, zoom: 40, variant: "Dendrite" }),
    ];

    expect(ids(suggest(view, catalogue, 5))).toEqual(["a", "b"]);
  });

  it("lists a Multibrot view's own power first, then the others, each group by distance", () => {
    const view: PlaceView = {
      fractal: "multibrot",
      variant: "3",
      centerX: 0,
      centerY: 0,
      zoom: 10,
    };
    const multibrot = (id: string, variant: string, overrides = {}) =>
      place(id, { fractal: "multibrot", variant, ...overrides });
    const catalogue = [
      multibrot("four-near", "4", { centerX: 0.1, zoom: 40 }),
      multibrot("three-far", "3", { centerX: 0.5, zoom: 40 }),
      multibrot("three-near", "3", { centerX: 0.2, zoom: 40 }),
      multibrot("five-near", "5", { centerX: 0.15, zoom: 40 }),
    ];

    expect(ids(suggest(view, catalogue, 5))).toEqual([
      "three-near",
      "three-far",
      "four-near",
      "five-near",
    ]);
  });

  it("does not take another power's place at the view's own centre and zoom for the view", () => {
    const view: PlaceView = {
      fractal: "multibrot",
      variant: "3",
      centerX: 0,
      centerY: 0,
      zoom: 10,
    };
    const catalogue = [
      place("same", { fractal: "multibrot", variant: "3" }),
      place("other", { fractal: "multibrot", variant: "4" }),
    ];

    expect(ids(suggest(view, catalogue, 5))).toEqual(["other"]);
  });
});

/** Which fractal's places the catalogue must hold, and how many. */
const EXPECTED_COUNTS: Record<string, [number, number]> = {
  mandelbrot: [15, 20],
  julia: [8, 10],
  "burning-ship": [8, 10],
  tricorn: [8, 10],
  multibrot: [10, 12],
  newton: [8, 10],
  celtic: [4, 6],
  "perpendicular-ship": [4, 6],
  magnet: [4, 6],
};

describe("PLACES", () => {
  it("has the number of places each fractal is meant to have", () => {
    for (const [fractal, [least, most]] of Object.entries(EXPECTED_COUNTS)) {
      const count = placesForFractal(fractal).length;
      expect(count, fractal).toBeGreaterThanOrEqual(least);
      expect(count, fractal).toBeLessThanOrEqual(most);
    }
  });

  it("has places for the fractals the picker offers and no others", () => {
    const offered = FRACTAL_TYPES.map((type) => type.id).sort();

    expect(Object.keys(EXPECTED_COUNTS).sort()).toEqual(offered);
    expect(new Set(PLACES.map((entry) => entry.fractal))).toEqual(
      new Set(offered),
    );
  });

  it("gives every place a unique id and a name", () => {
    expect(new Set(ids(PLACES)).size).toBe(PLACES.length);
    expect(new Set(PLACES.map((entry) => entry.name)).size).toBe(PLACES.length);

    for (const entry of PLACES) {
      expect(entry.id.trim(), entry.id).not.toBe("");
      expect(entry.name.trim(), entry.id).not.toBe("");
    }
  });

  it("spreads the Julia places over the four named constants and at least two custom ones", () => {
    const constants = placesForFractal("julia").map((entry) => entry.variant);

    for (const { name } of JULIA_CONSTANTS) {
      expect(constants, name).toContain(name);
    }

    const custom = new Set(
      constants.filter((name) => name?.startsWith("custom:")),
    );
    expect(custom.size).toBeGreaterThanOrEqual(2);
  });

  it("names a variant for a place of a fractal that takes one and for no other", () => {
    for (const entry of PLACES) {
      if (fractalVariants(entry.fractal) !== null) {
        expect(entry.variant, entry.id).toBeTypeOf("string");
        expect(isVariantValue(entry.fractal, entry.variant), entry.id).toBe(
          true,
        );
      } else {
        expect(entry.variant, entry.id).toBeUndefined();
      }
    }
  });

  it("spreads the Multibrot places over all three powers, each with its own whole set", () => {
    const places = placesForFractal("multibrot");

    for (const power of ["3", "4", "5"]) {
      const ofPower = places.filter((entry) => entry.variant === power);

      expect(ofPower.length, power).toBeGreaterThanOrEqual(3);
      // The chip's destination: the power's whole set at the default view.
      expect(wholeSetPlaceFor(power, "multibrot")?.id, power).toBe(
        `multibrot-${power}-whole`,
      );
    }
  });

  it("spreads the Magnet places over both types, each with its own whole set", () => {
    const places = placesForFractal("magnet");

    for (const type of ["1", "2"]) {
      const ofType = places.filter((entry) => entry.variant === type);

      expect(ofType.length, type).toBeGreaterThanOrEqual(2);
      // The chip's destination: the type's whole set at the default view.
      expect(wholeSetPlaceFor(type, "magnet")?.id, type).toBe(
        `magnet-${type}-whole`,
      );
    }
  });

  it("shows at least two Newton basins in every Newton place, since one basin is a flat field", () => {
    const grid = 40;

    for (const entry of placesForFractal("newton")) {
      const cap = autoIterations(entry.zoom);
      const bounds = calculateZoomBounds(
        entry.centerX,
        entry.centerY,
        entry.zoom,
      );
      const kind = resolveFractalKind("newton", "");
      const share = [0, 0, 0];

      for (let row = 0; row < grid; row++) {
        for (let column = 0; column < grid; column++) {
          const value = kind.iterations(
            {
              real:
                bounds.minReal +
                ((bounds.maxReal - bounds.minReal) * (column + 0.5)) / grid,
              imaginary:
                bounds.minImaginary +
                ((bounds.maxImaginary - bounds.minImaginary) * (row + 0.5)) /
                  grid,
            },
            cap,
            false,
          );
          if (value < cap) share[Math.floor(value / (cap * NEWTON_BAND))] += 1;
        }
      }

      const shown = share.filter((count) => count / (grid * grid) >= 0.05);
      expect(
        shown.length,
        `${entry.id}: ${share.join(", ")}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("opens each fractal on a place, so a visitor who has not moved is at one", () => {
    for (const { id } of FRACTAL_TYPES) {
      const opening = defaultViewFor(id);
      const here = placesForFractal(id).filter(
        (entry) =>
          entry.centerX === opening.centerX &&
          entry.centerY === opening.centerY &&
          entry.zoom === opening.zoom,
      );

      expect(here.length, id).toBeGreaterThanOrEqual(1);
    }
  });

  it("shows every place in the scheme a click on it sets, whatever the page is in", () => {
    // The tile is drawn in `placeColorScheme(place, current)` and the click
    // applies the same call, so the catalogue guard is that the call is a
    // function of the place alone when the place names a scheme, and of the
    // page's when it does not.
    for (const entry of PLACES) {
      for (const current of SCHEMES) {
        const expected = entry.colorScheme ?? current;

        expect(
          placeColorScheme(entry, current),
          `${entry.id} in ${current}`,
        ).toBe(expected);
      }
    }
  });

  describe("placeColorScheme", () => {
    it("is the place's own scheme when it names one", () => {
      const fire = place("fire", { colorScheme: "fire" });

      expect(placeColorScheme(fire, "classic")).toBe("fire");
      expect(placeColorScheme(fire, "ocean")).toBe("fire");
    });

    it("is the page's scheme for a place that names none, and follows it", () => {
      const plain = place("plain");

      expect(placeColorScheme(plain, "classic")).toBe("classic");
      expect(placeColorScheme(plain, "rainbow")).toBe("rainbow");
    });

    it("does not treat a scheme named like the page's as absent", () => {
      const classic = place("classic", { colorScheme: "classic" });

      expect(placeColorScheme(classic, "fire")).toBe("classic");
    });
  });

  it("lists placesForFractal in catalogue order", () => {
    for (const { id } of FRACTAL_TYPES) {
      expect(placesForFractal(id)).toEqual(
        PLACES.filter((entry) => entry.fractal === id),
      );
    }
    expect(placesForFractal("koch")).toEqual([]);
  });

  describe.each(PLACES.map((entry) => [entry.id, entry] as const))(
    "%s",
    (_id, entry) => {
      it("resolves to the kind of its fractal, with a constant the build reads", () => {
        const kind = resolveFractalKind(entry.fractal, entry.variant ?? "");

        expect(kind.id).toBe(entry.fractal);

        if (entry.fractal === "julia") {
          expect(parseJuliaConstant(entry.variant)).not.toBeNull();
        }
      });

      it("has a finite centre and a zoom inside the explorer's range", () => {
        expect(Number.isFinite(entry.centerX)).toBe(true);
        expect(Number.isFinite(entry.centerY)).toBe(true);
        expect(entry.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(entry.zoom).toBeLessThanOrEqual(MAX_ZOOM);
      });

      it("keeps its centre and zoom through a link", () => {
        const link = encodeView({
          fractalType: entry.fractal,
          variant: entry.variant,
          centerX: entry.centerX,
          centerY: entry.centerY,
          zoomLevel: entry.zoom,
          colorScheme: entry.colorScheme ?? "classic",
          autoIterationsOn: true,
          canvasWidth: 800,
          canvasHeight: 600,
        });
        const decoded = decodeView(link);

        expect(decoded.fractalType).toBe(entry.fractal);
        expect(decoded.centerX).toBe(entry.centerX);
        expect(decoded.centerY).toBe(entry.centerY);
        expect(decoded.zoomLevel).toBe(entry.zoom);
        expect(decoded.variant).toBe(entry.variant);
      });

      it("renders a picture, not a blank", async () => {
        const { element, pixels } = createFakeCanvas(WIDTH, HEIGHT);
        const renderer = new FractalRenderer(
          element,
          resolveFractalKind(entry.fractal, entry.variant ?? ""),
        );

        await renderer.renderFractal(
          {
            bounds: calculateZoomBounds(
              entry.centerX,
              entry.centerY,
              entry.zoom,
            ),
            // What Auto draws it at, which is how the page will.
            maxIterations: autoIterations(entry.zoom),
            width: WIDTH,
            height: HEIGHT,
            colorScheme: entry.colorScheme ?? "classic",
          },
          undefined,
          false,
        );

        expect(
          differingFromCorner(pixels(), WIDTH, HEIGHT),
        ).toBeGreaterThanOrEqual(BLANK_SHARE);
      });
    },
  );
});

describe("featuredPlace", () => {
  it("names one place for each fractal the picker offers, and no other", () => {
    expect(Object.keys(FEATURED_PLACE_IDS).sort()).toEqual(
      FRACTAL_TYPES.map((type) => type.id).sort(),
    );
  });

  describe.each(FRACTAL_TYPES.map((type) => type.id))("%s", (fractal) => {
    it("is a place in the catalogue, of that fractal", () => {
      const featured = featuredPlace(fractal);

      expect(PLACES).toContain(featured);
      expect(featured.id).toBe(FEATURED_PLACE_IDS[fractal]);
      expect(featured.fractal).toBe(fractal);
    });

    it("is not the opening view, so a switch goes somewhere", () => {
      if (FEATURED_IS_OPENING_VIEW.has(fractal)) return;
      const featured = featuredPlace(fractal);
      const opening = defaultViewFor(fractal);

      expect(
        featured.centerX === opening.centerX &&
          featured.centerY === opening.centerY &&
          featured.zoom === opening.zoom,
      ).toBe(false);
    });

    it("names its colours, so the landing looks the way it was picked", () => {
      expect(featuredPlace(fractal).colorScheme).toBeDefined();
    });

    it("is not zoomed in on the real axis where that axis is the Mandelbrot set's", () => {
      if (REAL_AXIS_MATCHES_MANDELBROT[fractal] !== true) return;
      const featured = featuredPlace(fractal);

      expect(
        zoomedInOnRealAxis(featured),
        `${featured.id} is zoomed in (${featured.zoom}x) on the real axis, where ${fractal} draws the Mandelbrot set`,
      ).toBe(false);
    });

    it("is not blank, at the count Auto draws it at", async () => {
      const featured = featuredPlace(fractal);
      const { element, pixels } = createFakeCanvas(WIDTH, HEIGHT);
      const renderer = new FractalRenderer(
        element,
        resolveFractalKind(featured.fractal, featured.variant ?? ""),
      );

      await renderer.renderFractal(
        {
          bounds: calculateZoomBounds(
            featured.centerX,
            featured.centerY,
            featured.zoom,
          ),
          maxIterations: autoIterations(featured.zoom),
          width: WIDTH,
          height: HEIGHT,
          colorScheme: featured.colorScheme ?? "classic",
        },
        undefined,
        false,
      );

      expect(isBlankImage(pixels(), WIDTH, HEIGHT)).toBe(false);
      // Past "not one colour": a featured place should be full of detail.
      expect(
        differingFromCorner(pixels(), WIDTH, HEIGHT),
      ).toBeGreaterThanOrEqual(FEATURED_DETAIL_SHARE);
      // And not a flat field: the one colour may hold at most 60% of it, so a
      // gradient or a thin shape in an empty field fails by place id.
      expect(
        nearUniformShare(pixels(), WIDTH, HEIGHT),
        `${featured.id} is ${Math.round(nearUniformShare(pixels(), WIDTH, HEIGHT) * 100)}% one colour`,
      ).toBeLessThanOrEqual(FEATURED_MAX_UNIFORM_SHARE);
    });
  });

  it("falls back to the Mandelbrot set's for an id it does not know", () => {
    expect(featuredPlace("no-such-fractal")).toBe(featuredPlace("mandelbrot"));
  });
});

describe("the real-axis guard", () => {
  it("lists only fractals the picker offers, and the Tricorn", () => {
    const listed = Object.keys(REAL_AXIS_MATCHES_MANDELBROT);

    expect(listed).toContain("tricorn");
    for (const id of listed) {
      expect(FRACTAL_TYPES.map((type) => type.id)).toContain(id);
    }
  });

  it("refuses a deep view on the axis: the left-arm needle the Tricorn button once landed on", () => {
    const along = PLACES.find((place) => place.id === "tricorn-along-the-arm");

    expect(along).toBeDefined();
    expect((along as Place).zoom).toBeGreaterThan(REAL_AXIS_GUARD_MIN_ZOOM);
    expect(zoomedInOnRealAxis(along as Place)).toBe(true);
  });

  it("accepts the whole set on the axis: its three arms are the picture", () => {
    const whole = PLACES.find((place) => place.id === "tricorn-whole") as Place;

    expect(offRealAxis(whole)).toBe(false);
    expect(zoomedInOnRealAxis(whole)).toBe(false);
    // The limit is exclusive: a view at the zoom itself is still a wide view.
    expect(
      zoomedInOnRealAxis({ ...whole, zoom: REAL_AXIS_GUARD_MIN_ZOOM }),
    ).toBe(false);
    expect(
      zoomedInOnRealAxis({ ...whole, zoom: REAL_AXIS_GUARD_MIN_ZOOM + 0.01 }),
    ).toBe(true);
  });

  it("accepts a deep view off the axis", () => {
    const star = PLACES.find((place) => place.id === "tricorn-star") as Place;

    expect(star.zoom).toBeGreaterThan(REAL_AXIS_GUARD_MIN_ZOOM);
    expect(zoomedInOnRealAxis(star)).toBe(false);
    expect(zoomedInOnRealAxis({ ...star, centerY: 0 })).toBe(true);
  });

  it("accepts a view whose centre is a share of its height off the axis", () => {
    const place = PLACES.find((p) => p.id === "tricorn-star") as Place;

    expect(offRealAxis(place)).toBe(true);
    expect(offRealAxis({ ...place, centerY: 0 })).toBe(false);
    // The bound is inclusive: exactly 5% of the view's height clears it.
    const edge = (OFF_AXIS_VIEW_HEIGHTS * BASE_HEIGHT) / place.zoom;
    expect(offRealAxis({ ...place, centerY: edge })).toBe(true);
    expect(offRealAxis({ ...place, centerY: -edge })).toBe(true);
    expect(offRealAxis({ ...place, centerY: edge * 0.99 })).toBe(false);
  });

  it("really is the Mandelbrot set on the axis for each fractal it lists", () => {
    // The flag's claim, not just its use: the orbit of a real c is the same.
    for (const id of Object.keys(REAL_AXIS_MATCHES_MANDELBROT)) {
      const kind = resolveFractalKind(id, "");
      const mandelbrot = resolveFractalKind("mandelbrot", "");
      for (let re = -2; re <= 0.5; re += 0.05) {
        const point = { real: re, imaginary: 0 };
        expect(kind.iterations(point, 200, false)).toBe(
          mandelbrot.iterations(point, 200, false),
        );
      }
    }
  });
});

describe("wholeSetPlaceFor", () => {
  it("finds the whole-set place of each named constant, at the Julia opening view", () => {
    const opening = defaultViewFor("julia");

    for (const constant of JULIA_CONSTANTS) {
      const found = wholeSetPlaceFor(constant.name);

      expect(found).not.toBeNull();
      expect(found?.fractal).toBe("julia");
      expect(found?.variant).toBe(constant.name);
      expect(found?.centerX).toBe(opening.centerX);
      expect(found?.centerY).toBe(opening.centerY);
      expect(found?.zoom).toBe(opening.zoom);
    }
  });

  it("finds the whole-set place of each Multibrot power, at the Multibrot opening view", () => {
    const opening = defaultViewFor("multibrot");

    for (const power of ["3", "4", "5"]) {
      const found = wholeSetPlaceFor(power, "multibrot");

      expect(found?.fractal, power).toBe("multibrot");
      expect(found?.variant, power).toBe(power);
      expect(found?.centerX, power).toBe(opening.centerX);
      expect(found?.centerY, power).toBe(opening.centerY);
      expect(found?.zoom, power).toBe(opening.zoom);
    }
  });

  it("keeps a power and a constant apart: neither finds the other's place", () => {
    expect(wholeSetPlaceFor("3")).toBeNull();
    expect(wholeSetPlaceFor("Classic", "multibrot")).toBeNull();
    expect(wholeSetPlaceFor("6", "multibrot")).toBeNull();
  });

  it("is never a deeper place of the constant", () => {
    expect(wholeSetPlaceFor("Classic")?.id).toBe("julia-classic-whole");
  });

  it("finds a place by the point, whatever spelling names it", () => {
    expect(wholeSetPlaceFor("custom:-1,0")?.id).toBe("julia-basilica");
    expect(wholeSetPlaceFor("custom:-1.000,0.0")?.id).toBe("julia-basilica");
    expect(wholeSetPlaceFor("custom:-0.8,0.156")?.id).toBe(
      "julia-classic-whole",
    );
  });

  it("is null for a point the catalogue has no whole set of, and for a name it cannot read", () => {
    expect(wholeSetPlaceFor("custom:0.123,0.456")).toBeNull();
    expect(wholeSetPlaceFor("custom:9,9")).toBeNull();
    expect(wholeSetPlaceFor("")).toBeNull();
    expect(wholeSetPlaceFor("Nonsense")).toBeNull();
  });
});

const WIDTH = 64;
const HEIGHT = 48;

/** A featured place has to beat the blank guard by a clear margin. */
const FEATURED_DETAIL_SHARE = 0.2;

/** A picture is blank when fewer than this share of it differs from its corner. */
const BLANK_SHARE = 0.05;

/** How far a centre must be from the real axis, in heights of its view. */
const OFF_AXIS_VIEW_HEIGHTS = 0.05;

/** Whether a place's centre is clear of the real axis by a share of its view. */
function offRealAxis(place: Place): boolean {
  const viewHeight = BASE_HEIGHT / place.zoom;

  return Math.abs(place.centerY) >= OFF_AXIS_VIEW_HEIGHTS * viewHeight;
}

/** Whether a place is a zoomed-in view that fills with the real axis. */
function zoomedInOnRealAxis(place: Place): boolean {
  return place.zoom > REAL_AXIS_GUARD_MIN_ZOOM && !offRealAxis(place);
}

/**
 * Fractals whose switcher button may land on the view the Fractal select opens
 * them on. The rule that a switch should go somewhere protects a page opening
 * on a view and a button repeating it; the Tricorn's whole set is the picture
 * that shows it best (fr-hbe), and nothing opens on it but a switch. The
 * Celtic set and the Perpendicular Ship are the same: their whole sets are the
 * views that say what each one is, and the Fractal select opens on them too.
 */
const FEATURED_IS_OPENING_VIEW = new Set([
  "tricorn",
  "celtic",
  "perpendicular-ship",
]);

/**
 * The smallest stand-in for a 2D canvas that FractalRenderer touches, with the
 * painted pixels readable: the renderer needs only createImageData and
 * putImageData, and the Node suite has no canvas.
 */
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
    width,
    height,
    getContext: () => context,
  };

  return {
    element: canvas as unknown as HTMLCanvasElement,
    pixels: () => state.pixels,
  };
}

/** The share of pixels whose colour differs from the top-left pixel's. */
function differingFromCorner(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  let differing = 0;

  for (let index = 1; index < width * height; index++) {
    for (let channel = 0; channel < 3; channel++) {
      if (pixels[index * 4 + channel] !== pixels[channel]) {
        differing++;
        break;
      }
    }
  }

  return differing / (width * height);
}
