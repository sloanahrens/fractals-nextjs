import { describe, expect, it } from "vitest";

import { downloadFileName } from "../download";

// Every filename a filesystem has to accept: letters, digits, dot, dash and
// underscore, and nothing else.
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

describe("downloadFileName", () => {
  it("names the file from the view it shows", () => {
    expect(downloadFileName(-0.75, 0.1, 175)).toBe(
      "mandelbrot_-0.75_0.1_175x.png",
    );
  });

  it("names the file after the fractal that was drawn", () => {
    // The default prefix is the one this app has always used, so a Mandelbrot
    // save keeps the name it had before the picker existed.
    expect(downloadFileName(0, 0, 1)).toBe("mandelbrot_0_0_1x.png");
    expect(downloadFileName(0, 0, 1, "julia")).toBe("julia_0_0_1x.png");
    expect(downloadFileName(-0.45, -0.5, 1, "burning-ship")).toBe(
      "burning-ship_-0.45_-0.5_1x.png",
    );
  });

  it("keeps the sign of a negative coordinate", () => {
    expect(downloadFileName(-1.25, -0.0001, 1)).toBe(
      "mandelbrot_-1.25_-0.0001_1x.png",
    );
  });

  it("writes the zoom as the plain number the canvas label gives", () => {
    // A download name is read next to the canvas label, which says 10000x, so
    // the Zoom Level readout's abbreviation (10.0Kx) stays out of it.
    expect(downloadFileName(-0.769, -0.01, 10000)).toBe(
      "mandelbrot_-0.769_-0.01_10000x.png",
    );
    expect(downloadFileName(0, 0, 175)).toContain("_175x.png");
    expect(downloadFileName(0, 0, 1)).toContain("_1x.png");
  });

  it("keeps a decimal place or two below 100 and drops the zeros", () => {
    expect(downloadFileName(0, 0, 1.5)).toContain("_1.5x.png");
    expect(downloadFileName(0, 0, 2.59)).toContain("_2.59x.png");
    // A gesture can leave the zoom at full double precision; two decimals are
    // enough to tell two nearby views apart and short enough to read.
    expect(downloadFileName(0, 0, 2.5938471)).toContain("_2.59x.png");
  });

  it("shortens coordinates to six significant digits", () => {
    // A pan can leave the center at full double precision; six digits are
    // enough to tell one view from the next and short enough to read.
    expect(downloadFileName(-0.743643887037151, 0.13182590420533, 2000)).toBe(
      "mandelbrot_-0.743644_0.131826_2000x.png",
    );
  });

  it("never names a file with a space or a slash", () => {
    const views: [number, number, number][] = [
      [-0.75, 0.1, 175],
      [-2.5, -1.5, 1],
      [0, 0, 1],
      [-0.743643887037151, 0.13182590420533, 2_000_000],
      [1e-7, -1e-9, 1000],
    ];

    for (const [x, y, zoom] of views) {
      expect(downloadFileName(x, y, zoom)).toMatch(SAFE_FILENAME);
    }
  });
});
