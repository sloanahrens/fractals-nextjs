import { describe, expect, it } from "vitest";

import {
  EXPORT_FAILED_MESSAGE,
  EXPORT_MAX_PIXELS,
  EXPORT_PROGRESS_INTERVAL_MS,
  appendToFileName,
  exportFileName,
  exportProgressDue,
  exportSizes,
} from "../exportSize";
import { downloadFileName } from "../download";

/** The scales of a list of options, which is the shape most of these assertions are about. */
function scales(canvasWidth: number, canvasHeight: number): number[] {
  return exportSizes(canvasWidth, canvasHeight).map((size) => size.scale);
}

/** The pixel count of one option. */
function pixelsOf(size: { width: number; height: number }): number {
  return size.width * size.height;
}

describe("exportSizes", () => {
  it("offers the screen size, 2x and 4x for the default canvas", () => {
    const sizes = exportSizes(800, 600);

    expect(sizes.map((size) => size.scale)).toEqual([1, 2, 4]);
    expect(sizes[0]).toEqual({
      label: "Screen size (800 x 600)",
      scale: 1,
      width: 800,
      height: 600,
    });
    expect(sizes[1]).toEqual({
      label: "2x (1600 x 1200)",
      scale: 2,
      width: 1600,
      height: 1200,
    });
    expect(sizes[2]).toEqual({
      label: "4x (3200 x 2400)",
      scale: 4,
      width: 3200,
      height: 2400,
    });
  });

  it("offers 3x where a 1200 x 900 canvas cannot afford 4x", () => {
    // 4x is 4800 x 3600, 17.3 MP, over the budget; 3x is 3600 x 2700, 9.7 MP,
    // and is offered in its place rather than the list stopping at 2x.
    expect(scales(1200, 900)).toEqual([1, 2, 3]);
    expect(exportSizes(1200, 900)[2]).toEqual({
      label: "3x (3600 x 2700)",
      scale: 3,
      width: 3600,
      height: 2700,
    });
  });

  it("stops at 4x for a 400 x 300 canvas, though 8x would fit", () => {
    // 8x is 3200 x 2400, 7.7 MP, and inside the budget. It is not offered
    // anyway: the list offers the sizes this feature names — the screen size,
    // 2x and 4x — and a size the budget rules out is the only reason a fourth
    // one ever appears. Nothing here is over the cap, so 4x is the largest.
    const sizes = exportSizes(400, 300);

    expect(sizes.map((size) => size.scale)).toEqual([1, 2, 4]);
    expect(sizes.every((size) => pixelsOf(size) <= EXPORT_MAX_PIXELS)).toBe(
      true,
    );
  });

  it("never offers a size over the pixel budget", () => {
    const canvases: [number, number][] = [
      [800, 600],
      [1200, 900],
      [400, 300],
      [1920, 1080],
      [2000, 2000],
      [640, 480],
      [333, 777],
    ];

    for (const [width, height] of canvases) {
      for (const size of exportSizes(width, height)) {
        if (size.scale === 1) continue;
        expect(pixelsOf(size)).toBeLessThanOrEqual(EXPORT_MAX_PIXELS);
      }
    }
  });

  it("always offers the screen size, whatever the canvas", () => {
    // The screen size is the canvas itself and is what Download PNG has always
    // saved; the budget is about the larger options.
    for (const [width, height] of [
      [800, 600],
      [2000, 2000],
      [4000, 3000],
    ]) {
      expect(exportSizes(width, height)[0]).toMatchObject({
        scale: 1,
        width,
        height,
      });
    }
  });

  it("treats the budget as a ceiling, not a strict bound", () => {
    // 1000 x 750 at 4x is 4000 x 3000: exactly 12,000,000 pixels. The cap says
    // a size larger than the budget is not offered, so a size that lands on it
    // is offered as it is.
    expect(scales(1000, 750)).toEqual([1, 2, 4]);

    // One pixel taller and the same 4x is 12,016,000, over the budget, so 3x
    // takes its place.
    expect(scales(1000, 751)).toEqual([1, 2, 3]);
  });

  it("offers the screen size alone when nothing larger fits", () => {
    // A 3000 x 2250 canvas is 6.75 MP: 2x is 27 MP, over the budget, and no
    // whole multiple between 1 and 2 exists to take its place.
    expect(scales(3000, 2250)).toEqual([1]);

    // A canvas already at the budget is the same case from the other side.
    expect(scales(4000, 3000)).toEqual([1]);
  });

  it("offers whole multiples only, in ascending order", () => {
    for (const [width, height] of [
      [800, 600],
      [1200, 900],
      [400, 300],
      [1234, 567],
    ]) {
      const sizes = exportSizes(width, height);
      const scaleList = sizes.map((size) => size.scale);

      expect(scaleList.every((scale) => Number.isInteger(scale))).toBe(true);
      expect(scaleList).toEqual([...scaleList].sort((a, b) => a - b));
      expect(new Set(scaleList).size).toBe(scaleList.length);

      // The number on the label is the pixels the option actually draws.
      for (const size of sizes) {
        expect(size.label).toContain(`${size.width} x ${size.height}`);
      }
    }
  });

  it("takes its budget as an argument", () => {
    // The tests above run against the default; the helper takes the budget so
    // a caller can say what its own canvas can afford.
    expect(exportSizes(100, 100, 40_000).map((size) => size.scale)).toEqual([
      1, 2,
    ]);
    expect(scales(100, 100)).toEqual([1, 2, 4]);
  });
});

describe("exportFileName", () => {
  it("leaves the screen size's name exactly as it was", () => {
    const name = downloadFileName(-0.75, 0.1, 1);

    expect(name).toBe("mandelbrot_-0.75_0.1_1x.png");
    expect(exportFileName(name, 1)).toBe(name);
  });

  it("marks a larger size before the extension", () => {
    const name = downloadFileName(-0.75, 0, 1);

    expect(exportFileName(name, 2)).toBe("mandelbrot_-0.75_0_1x_2x.png");
    expect(exportFileName(name, 4)).toBe("mandelbrot_-0.75_0_1x_4x.png");
  });

  it("keeps the fractal's own prefix", () => {
    expect(exportFileName(downloadFileName(0, 0, 1, "julia"), 2)).toBe(
      "julia_0_0_1x_2x.png",
    );
  });

  it("names a name with no extension without inventing one", () => {
    expect(exportFileName("mandelbrot_0_0_1x", 2)).toBe("mandelbrot_0_0_1x_2x");
  });

  it("keeps every name a filesystem has to accept", () => {
    const view = downloadFileName(-0.743643887037151, 0.13182590420533, 1);

    for (const scale of [1, 2, 3, 4]) {
      expect(exportFileName(view, scale)).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  });
});

describe("appendToFileName", () => {
  it("puts the part in front of the extension", () => {
    expect(appendToFileName("mandelbrot_0_0_1x.png", "16x9_3840x2160")).toBe(
      "mandelbrot_0_0_1x_16x9_3840x2160.png",
    );
  });

  it("appends to a name with no extension rather than inventing one", () => {
    expect(appendToFileName("mandelbrot_0_0_1x", "2x")).toBe(
      "mandelbrot_0_0_1x_2x",
    );
  });

  it("marks the last dot, so a dotted stem keeps its dots", () => {
    expect(appendToFileName("view.one.png", "2x")).toBe("view.one_2x.png");
  });
});

describe("exportProgressDue", () => {
  it("reports the first progress it is given", () => {
    expect(exportProgressDue(1000, 0)).toBe(true);
  });

  it("holds a report back inside the interval", () => {
    expect(exportProgressDue(1200, 1000)).toBe(false);
    expect(exportProgressDue(1249, 1000)).toBe(false);
    expect(exportProgressDue(1250, 1000)).toBe(true);
    expect(exportProgressDue(1400, 1000)).toBe(true);
  });

  it("takes the interval as an argument", () => {
    expect(exportProgressDue(1010, 1000, 10)).toBe(true);
    expect(exportProgressDue(1009, 1000, 10)).toBe(false);
    expect(EXPORT_PROGRESS_INTERVAL_MS).toBe(250);
  });
});

describe("the message an export failure shows", () => {
  it("says what could not be done, in a sentence", () => {
    expect(EXPORT_FAILED_MESSAGE).toBe("Could not create that size");
  });
});
