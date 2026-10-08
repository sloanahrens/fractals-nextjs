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

  it("keeps the sign of a negative coordinate", () => {
    expect(downloadFileName(-1.25, -0.0001, 1)).toBe(
      "mandelbrot_-1.25_-0.0001_1x.png",
    );
  });

  it("rounds the zoom to a readable number", () => {
    expect(downloadFileName(0, 0, 1.5)).toContain("_1.5x.png");
    expect(downloadFileName(0, 0, 175)).toContain("_175x.png");
    expect(downloadFileName(0, 0, 1)).toContain("_1x.png");
  });

  it("shortens coordinates to six significant digits", () => {
    // A pan can leave the center at full double precision; six digits are
    // enough to tell one view from the next and short enough to read.
    expect(downloadFileName(-0.743643887037151, 0.13182590420533, 2000)).toBe(
      "mandelbrot_-0.743644_0.131826_2.0Kx.png",
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
