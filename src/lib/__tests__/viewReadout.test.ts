import { describe, expect, it } from "vitest";

import { defaultViewFor } from "../fractalTypes";
import { calculateZoomBounds } from "../mandelbrot";
import { describeView } from "../viewReadout";

function line(centerX: number, centerY: number, zoom: number): string {
  return describeView(calculateZoomBounds(centerX, centerY, zoom));
}

describe("describeView", () => {
  it("reads the Mandelbrot opening view", () => {
    const view = defaultViewFor("mandelbrot");

    expect(line(view.centerX, view.centerY, view.zoom)).toBe(
      "Zoom 1x at -0.75, 0",
    );
  });

  it("reads the Julia opening view, centred on the origin", () => {
    const view = defaultViewFor("julia");

    expect(line(view.centerX, view.centerY, view.zoom)).toBe("Zoom 1x at 0, 0");
  });

  it("reads a deep zoom, shortening the zoom and the centre", () => {
    expect(line(-0.7453, 0.1127, 400)).toBe("Zoom 400x at -0.7453, 0.1127");
    expect(line(-1.7499, 0.00001, 10000)).toBe(
      "Zoom 10.0Kx at -1.7499, 0.00001",
    );
  });

  it("keeps the sign of a negative centre on both axes", () => {
    expect(line(-0.1, -0.65, 2.5)).toBe("Zoom 2.5x at -0.1, -0.65");
  });

  it("drops the float noise a long coordinate carries past six digits", () => {
    expect(line(-1.8965650826446265, 0.0123456789, 12.3456)).toBe(
      "Zoom 12.3x at -1.89657, 0.0123457",
    );
  });
});
