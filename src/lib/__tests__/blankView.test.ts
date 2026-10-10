import { describe, expect, it } from "vitest";

import type { ColorScheme } from "../../types/fractal";
import {
  BLANK_SAMPLE_COLUMNS,
  BLANK_SAMPLE_ROWS,
  canvasIsBlank,
  isBlankImage,
} from "../blankView";
import { defaultViewFor, FRACTAL_TYPES } from "../fractalTypes";
import { createCanvasThumbnailRender } from "../placeThumbnails";
import { PLACES, type Place } from "../places";

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

/** The Node stand-in for a 2D canvas the thumbnail tests use. */
function createFakeCanvas(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const context = {
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData: (picture: { data: Uint8ClampedArray }) => {
      pixels.set(picture.data);
    },
    getImageData: () => ({ data: pixels.slice() }),
  };

  return {
    width,
    height,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
}

async function pictureOf(candidate: Place, scheme: ColorScheme) {
  const render = createCanvasThumbnailRender(createFakeCanvas);

  return render({
    place: candidate,
    scheme,
    width: WIDTH,
    height: HEIGHT,
    signal: new AbortController().signal,
  });
}

describe("what the detector says of real pictures", () => {
  it("does not call the Mandelbrot overview blank", async () => {
    const overview: Place = {
      id: "overview",
      name: "overview",
      fractal: "mandelbrot",
      ...defaultViewFor("mandelbrot"),
    };
    const picture = await pictureOf(overview, "classic");

    expect(isBlankImage(picture.data, WIDTH, HEIGHT)).toBe(false);
  }, 30000);

  it("calls a view inside the cardioid blank", async () => {
    const inside: Place = {
      id: "inside",
      name: "inside",
      fractal: "mandelbrot",
      centerX: -0.1,
      centerY: 0,
      zoom: 20,
    };
    const picture = await pictureOf(inside, "classic");

    expect(isBlankImage(picture.data, WIDTH, HEIGHT)).toBe(true);
  }, 30000);

  it("calls a view in the field outside the set blank", async () => {
    const outside: Place = {
      id: "outside",
      name: "outside",
      fractal: "mandelbrot",
      centerX: 1.9,
      centerY: 1.9,
      zoom: 127,
    };
    const picture = await pictureOf(outside, "classic");

    expect(isBlankImage(picture.data, WIDTH, HEIGHT)).toBe(true);
  }, 30000);

  const schemes: ColorScheme[] = [
    "classic",
    "fire",
    "ocean",
    "grayscale",
    "rainbow",
  ];

  // Julia's default is drawn with the first named constant, as the page does.
  it.each(
    FRACTAL_TYPES.flatMap((type) =>
      schemes.map((scheme) => [type.id, scheme] as const),
    ),
  )(
    "the default %s view is not blank in %s",
    async (id, scheme) => {
      const opening: Place = {
        id: `default-${id}`,
        name: id,
        fractal: id,
        ...(id === "julia" ? { juliaConstant: "Classic" } : {}),
        ...defaultViewFor(id),
      };
      const picture = await pictureOf(opening, scheme);

      expect(isBlankImage(picture.data, WIDTH, HEIGHT)).toBe(false);
    },
    30000,
  );

  it.each(PLACES.map((candidate) => [candidate.id, candidate] as const))(
    "%s is not blank",
    async (_id, candidate) => {
      const picture = await pictureOf(
        candidate,
        candidate.colorScheme ?? "classic",
      );

      expect(isBlankImage(picture.data, WIDTH, HEIGHT)).toBe(false);
    },
    30000,
  );
});
