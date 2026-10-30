import { describe, expect, it } from "vitest";

import type { ColorScheme } from "../../types/fractal";
import {
  BLANK_SAMPLE_COLUMNS,
  BLANK_SAMPLE_ROWS,
  canvasIsBlank,
  isBlankImage,
  nearUniformShare,
} from "../blankView";
import {
  FRACTAL_TYPES,
  defaultViewFor,
  resolveFractalKind,
} from "../fractalTypes";
import { autoIterations, calculateZoomBounds } from "../mandelbrot";
import { NEWTON_POLYNOMIALS } from "../newton";
import type { Place } from "../places";
import { colourRgbaRows, countRgbaRows } from "../renderRgba";

const WIDTH = 64;
const HEIGHT = 48;

function filled(r: number, g: number, b: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

  for (let at = 0; at < pixels.length; at += 4) {
    pixels[at] = r;
    pixels[at + 1] = g;
    pixels[at + 2] = b;
    pixels[at + 3] = 255;
  }

  return pixels;
}

/** The pixel index `isBlankImage` samples for grid cell (column, row) of a 64x48 picture. */
function sampledPixel(column: number, row: number): number {
  const x = Math.floor(((column + 0.5) * WIDTH) / BLANK_SAMPLE_COLUMNS);
  const y = Math.floor(((row + 0.5) * HEIGHT) / BLANK_SAMPLE_ROWS);

  return y * WIDTH + x;
}

/** Paints the first `count` sampled cells a colour far from the rest. */
function withSpecks(base: Uint8ClampedArray, count: number): Uint8ClampedArray {
  const pixels = base.slice();

  for (let n = 0; n < count; n++) {
    const at = sampledPixel(n % BLANK_SAMPLE_COLUMNS, Math.floor(n / 32)) * 4;
    pixels[at] = 255;
    pixels[at + 1] = 255;
    pixels[at + 2] = 255;
  }

  return pixels;
}

describe("nearUniformShare", () => {
  it("is 1 for one colour and 0 for a picture with no pixels", () => {
    expect(nearUniformShare(filled(20, 120, 40), WIDTH, HEIGHT)).toBe(1);
    expect(nearUniformShare(new Uint8ClampedArray(0), WIDTH, HEIGHT)).toBe(0);
  });

  it("counts the samples off the common colour: 384 of 768 is one half", () => {
    const base = filled(20, 120, 40);

    expect(nearUniformShare(withSpecks(base, 384), WIDTH, HEIGHT)).toBe(0.5);
  });

  it("agrees with isBlankImage at the 98% line", () => {
    const base = filled(20, 120, 40);

    expect(
      nearUniformShare(withSpecks(base, 15), WIDTH, HEIGHT),
    ).toBeGreaterThanOrEqual(0.98);
    expect(nearUniformShare(withSpecks(base, 16), WIDTH, HEIGHT)).toBeLessThan(
      0.98,
    );
  });
});

describe("isBlankImage", () => {
  it("is true for one colour", () => {
    expect(isBlankImage(filled(20, 120, 40), WIDTH, HEIGHT)).toBe(true);
  });

  it("is true for all black, as deep inside the set", () => {
    expect(isBlankImage(filled(0, 0, 0), WIDTH, HEIGHT)).toBe(true);
  });

  it("holds the 98% line: 15 of 768 samples off is blank, 16 is not", () => {
    // 768 samples; 98% is 752.64, so 753 alike is the least.
    const base = filled(20, 120, 40);

    expect(isBlankImage(withSpecks(base, 15), WIDTH, HEIGHT)).toBe(true);
    expect(isBlankImage(withSpecks(base, 16), WIDTH, HEIGHT)).toBe(false);
  });

  it("ignores pixels the grid does not sample", () => {
    const pixels = filled(20, 120, 40);
    const sampled = new Set<number>();

    for (let row = 0; row < BLANK_SAMPLE_ROWS; row++) {
      for (let column = 0; column < BLANK_SAMPLE_COLUMNS; column++) {
        sampled.add(sampledPixel(column, row));
      }
    }

    for (let index = 0; index < WIDTH * HEIGHT; index++) {
      if (!sampled.has(index)) pixels[index * 4] = 255;
    }

    expect(isBlankImage(pixels, WIDTH, HEIGHT)).toBe(true);
  });

  it("counts a small colour difference as the same colour and a larger one as not", () => {
    const near = filled(100, 100, 100);
    const far = filled(100, 100, 100);

    for (let index = 0; index < WIDTH * HEIGHT; index++) {
      // Half the picture 24 away in total (blank), half 25 away (not).
      const half = index % WIDTH < WIDTH / 2;
      near[index * 4] = half ? 108 : 100;
      near[index * 4 + 1] = half ? 108 : 100;
      near[index * 4 + 2] = half ? 108 : 100;
      far[index * 4] = half ? 109 : 100;
      far[index * 4 + 1] = half ? 108 : 100;
      far[index * 4 + 2] = half ? 108 : 100;
    }

    expect(isBlankImage(near, WIDTH, HEIGHT)).toBe(true);
    expect(isBlankImage(far, WIDTH, HEIGHT)).toBe(false);
  });

  it("is false for a banded gradient", () => {
    const pixels = filled(0, 0, 0);

    for (let index = 0; index < WIDTH * HEIGHT; index++) {
      const band = Math.floor((index % WIDTH) / 4) * 16;
      pixels[index * 4] = band;
      pixels[index * 4 + 1] = band;
      pixels[index * 4 + 2] = band;
    }

    expect(isBlankImage(pixels, WIDTH, HEIGHT)).toBe(false);
  });

  it("is false for a picture too small to hold its own size, or of no size", () => {
    expect(isBlankImage(new Uint8ClampedArray(0), WIDTH, HEIGHT)).toBe(false);
    expect(isBlankImage(filled(0, 0, 0), 0, HEIGHT)).toBe(false);
    expect(isBlankImage(filled(0, 0, 0), WIDTH, Number.NaN)).toBe(false);
  });

  it("samples a picture smaller than the grid without reading past its end", () => {
    expect(isBlankImage(new Uint8ClampedArray(4 * 4).fill(7), 2, 2)).toBe(true);
  });
});

describe("canvasIsBlank", () => {
  it("is null for a canvas that cannot be read", () => {
    const canvas = { width: 0, height: 0 } as unknown as HTMLCanvasElement;

    expect(canvasIsBlank(canvas)).toBeNull();
  });
});

/** A view's iteration counts, and the cap they were counted with. */
interface CountedView {
  counts: Float64Array;
  maxIterations: number;
}

/**
 * The counts of a place's thumbnail view: the first half of every render, at
 * the size and count the page draws a thumbnail with -- the bounds its zoom
 * level gives, the count Auto picks, unsmoothed, exactly as
 * `createCanvasThumbnailRender` asks the renderer. A picture is those counts
 * coloured, so they are kept: colouring them in another scheme draws that
 * scheme's picture with no orbit walked a second time (the whole of what a
 * renderer's repaint does).
 *
 * A pure function of the place, memoised on the view it draws, so the five
 * schemes of one fractal share one walk of the orbit rather than five and two
 * places that draw different pictures never share counts.
 */
const countedViews = new Map<string, CountedView>();

function countsOf(candidate: Place): CountedView {
  const key = [
    candidate.fractal,
    candidate.variant ?? "",
    candidate.centerX,
    candidate.centerY,
    candidate.zoom,
  ].join("|");

  const kept = countedViews.get(key);
  if (kept !== undefined) return kept;

  const maxIterations = autoIterations(candidate.zoom);
  const counts = new Float64Array(WIDTH * HEIGHT);

  countRgbaRows(
    counts,
    0,
    HEIGHT,
    calculateZoomBounds(candidate.centerX, candidate.centerY, candidate.zoom),
    WIDTH,
    HEIGHT,
    maxIterations,
    resolveFractalKind(candidate.fractal, candidate.variant ?? ""),
    false,
  );

  const view = { counts, maxIterations };
  countedViews.set(key, view);
  return view;
}

/**
 * Those counts coloured in a scheme: the second half of a render, and the
 * picture a colour change repaints. It is byte for byte the picture a full
 * render draws in that scheme -- `fractalRenderer.test.ts` holds the two
 * halves of the pipeline to it for every kind.
 */
function pictureIn(view: CountedView, scheme: ColorScheme): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

  colourRgbaRows(
    pixels,
    view.counts,
    0,
    HEIGHT,
    WIDTH,
    view.maxIterations,
    scheme,
  );

  return pixels;
}

/** A fractal's opening frame, as the page makes it: Julia's first named constant. */
function openingPlace(id: string): Place {
  return {
    id: `default-${id}`,
    name: id,
    fractal: id,
    ...(id === "julia" ? { variant: "Classic" } : {}),
    ...defaultViewFor(id),
  };
}

describe("what the detector says of real pictures", () => {
  // The catalogue's own blank guard lives in places.test.ts, which draws every
  // place at 64x48 with the count Auto picks, in the place's own scheme, and
  // refuses a flat field (a share of pixels differing from the corner below
  // 0.05). This file drew those same pictures through
  // `createCanvasThumbnailRender` and checked the same pictures with
  // `isBlankImage`, so its copy proved that guard twice; the place guard is
  // kept in places.test.ts (fr-etlv), so every place is still drawn and
  // checked. What stays here is the detector's own real pictures: two blank
  // views, Newton's whole set and one basin, and every fractal's opening frame
  // in every scheme.
  it("calls a view inside the cardioid blank", () => {
    const inside: Place = {
      id: "inside",
      name: "inside",
      fractal: "mandelbrot",
      centerX: -0.1,
      centerY: 0,
      zoom: 20,
    };
    const picture = pictureIn(countsOf(inside), "classic");

    expect(isBlankImage(picture, WIDTH, HEIGHT)).toBe(true);
  });

  it("calls a view in the field outside the set blank", () => {
    const outside: Place = {
      id: "outside",
      name: "outside",
      fractal: "mandelbrot",
      centerX: 1.9,
      centerY: 1.9,
      zoom: 127,
    };
    const picture = pictureIn(countsOf(outside), "classic");

    expect(isBlankImage(picture, WIDTH, HEIGHT)).toBe(true);
  });

  const schemes: ColorScheme[] = [
    "classic",
    "fire",
    "ocean",
    "grayscale",
    "rainbow",
  ];

  // The Newton fractal has no inside and no outside: every point is in a
  // basin, so the whole-basins view is large flat fields. It is not blank
  // because three of them show, each a different colour family, so the
  // commonest colour is a share of the picture and not nearly all of it. Every
  // scheme is drawn, because the scheme decides whether two of those fields
  // read as one colour.
  it.each(schemes)(
    "the Newton whole-basins view is not blank in %s, and no one colour holds most of it",
    (scheme) => {
      const whole: Place = {
        id: "newton-whole-check",
        name: "newton",
        fractal: "newton",
        ...defaultViewFor("newton"),
      };
      const picture = pictureIn(countsOf(whole), scheme);
      const share = nearUniformShare(picture, WIDTH, HEIGHT);

      expect(isBlankImage(picture, WIDTH, HEIGHT)).toBe(false);
      expect(share, `${scheme}: ${share}`).toBeLessThan(0.6);
    },
    30000,
  );

  it("calls a deep view inside one Newton basin blank, since one basin is one colour family", () => {
    // Zoom 40 around a point of the basin of the root 1, far from any
    // boundary: no second basin in the frame, just the shading of one.
    const inside: Place = {
      id: "newton-inside",
      name: "newton",
      fractal: "newton",
      centerX: 1.6,
      centerY: 0.05,
      zoom: 40,
    };
    const picture = pictureIn(countsOf(inside), "grayscale");

    expect(isBlankImage(picture, WIDTH, HEIGHT)).toBe(true);
  });

  // Every fractal's opening frame in all five schemes -- the full grid the
  // file drew before, and not a rotation of it, so a view that flattens in one
  // scheme fails in that scheme. What is saved is the orbit, not the check: a
  // picture is counts coloured, so each fractal's counts are drawn once and
  // coloured five times, which is twelve walks for the sixty pictures rather
  // than sixty. The Mandelbrot overview -- the picture a visitor opens on -- is
  // the first case, in classic, which is what the page opens with.
  //
  // Julia's default is drawn with the first named constant, as the page does.
  it.each(
    FRACTAL_TYPES.flatMap((type) =>
      schemes.map((scheme) => [type.id, scheme] as const),
    ),
  )(
    "the default %s view is not blank in %s",
    (id, scheme) => {
      const picture = pictureIn(countsOf(openingPlace(id)), scheme);

      expect(isBlankImage(picture, WIDTH, HEIGHT)).toBe(false);
    },
    30000,
  );

  // Newton's polynomials share one opening frame, and a chip goes to the whole
  // of the one it names, so every one of them is a picture a visitor can land
  // on rather than only the first. (Every other fractal's opening view is the
  // one above; the variants of a fractal that takes one are not all promised
  // to be busy — a Julia Dendrite drawn in ocean at 64x48 is one colour, which
  // is what the hint is for.)
  //
  // Each polynomial's opening frame is drawn in every scheme too, from its own
  // one walk of the orbit. (The title takes the scheme, so a failure names the
  // colouring that was drawn: the title substitutes its `%s` in argument
  // order, and it used to name the variant id where the scheme goes.)
  it.each(
    NEWTON_POLYNOMIALS.flatMap((polynomial) =>
      schemes.map(
        (scheme) => [polynomial.label, scheme, polynomial.id] as const,
      ),
    ),
  )(
    "the Newton fractal's %s view is not blank in %s",
    (_label, scheme, variant) => {
      const opening: Place = {
        id: `default-newton-${variant}`,
        name: "newton",
        fractal: "newton",
        variant,
        ...defaultViewFor("newton"),
      };
      const picture = pictureIn(countsOf(opening), scheme);

      expect(isBlankImage(picture, WIDTH, HEIGHT)).toBe(false);
    },
    30000,
  );
});
