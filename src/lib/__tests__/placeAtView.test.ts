/**
 * Which catalogue place a view is on
 *
 * The Math card names the place when the view is within 1% of a place's centre
 * (of the view's span) and zoom, the same tolerance `suggest` uses to leave the
 * place you are on out of its list, and it counts the variant for a fractal
 * that takes one.
 */
import { describe, expect, it } from "vitest";

import { BASE_WIDTH } from "../mandelbrot";
import { PLACES, placeAtView, suggest, type Place } from "../places";

function place(id: string): Place {
  const found = PLACES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no place ${id}`);

  return found;
}

const SPIRALS = place("julia-classic-spirals");

/** A view of a place, nudged. */
function viewOf(target: Place, nudge: Partial<Place> = {}) {
  return {
    fractal: target.fractal,
    variant: target.variant,
    centerX: target.centerX,
    centerY: target.centerY,
    zoom: target.zoom,
    ...nudge,
  };
}

describe("placeAtView", () => {
  it("finds every catalogue place from its own numbers", () => {
    for (const target of PLACES) {
      expect(placeAtView(viewOf(target), PLACES)?.id, target.id).toBe(
        target.id,
      );
    }
  });

  it("agrees with suggest: the place it finds is the one suggest leaves out", () => {
    for (const target of PLACES) {
      const view = viewOf(target);
      const suggested = suggest(view, PLACES, PLACES.length).map((p) => p.id);

      expect(suggested, target.id).not.toContain(placeAtView(view, PLACES)?.id);
    }
  });

  it("still names the place for a view panned a hair off it", () => {
    const span = BASE_WIDTH / SPIRALS.zoom;
    const nudged = viewOf(SPIRALS, {
      centerX: SPIRALS.centerX + 0.005 * span,
      zoom: SPIRALS.zoom * 1.005,
    });

    expect(placeAtView(nudged, PLACES)?.id).toBe(SPIRALS.id);
  });

  it("names nothing once the centre is more than 1% of the span away", () => {
    const span = BASE_WIDTH / SPIRALS.zoom;

    expect(
      placeAtView(
        viewOf(SPIRALS, { centerX: SPIRALS.centerX + 0.02 * span }),
        PLACES,
      ),
    ).toBeNull();
  });

  it("names nothing once the zoom is more than 1% off", () => {
    expect(
      placeAtView(viewOf(SPIRALS, { zoom: SPIRALS.zoom * 1.05 }), PLACES),
    ).toBeNull();
  });

  it("does not name a place of another fractal at the same numbers", () => {
    expect(
      placeAtView(viewOf(SPIRALS, { fractal: "mandelbrot" }), PLACES),
    ).toBeNull();
  });

  it("does not name a Julia place for another constant at the same numbers", () => {
    expect(
      placeAtView(viewOf(SPIRALS, { variant: "Dendrite" }), PLACES),
    ).toBeNull();
  });

  it("compares Julia constants as points, so a custom spelling of the same one counts", () => {
    expect(
      placeAtView(viewOf(SPIRALS, { variant: "custom:-0.8,0.156" }), PLACES)
        ?.id,
    ).toBe(SPIRALS.id);
  });

  it("does not name a Multibrot place for another power", () => {
    const copy = place("multibrot-3-small-copy");

    expect(placeAtView(viewOf(copy), PLACES)?.id).toBe(copy.id);
    expect(placeAtView(viewOf(copy, { variant: "4" }), PLACES)).toBeNull();
  });

  it("names nothing for a view that cannot be measured", () => {
    for (const nudge of [
      { zoom: 0 },
      { zoom: -1 },
      { zoom: Number.NaN },
      { centerX: Number.NaN },
      { centerY: Number.POSITIVE_INFINITY },
    ]) {
      expect(placeAtView(viewOf(SPIRALS, nudge), PLACES)).toBeNull();
    }
  });

  it("names nothing from an empty catalogue", () => {
    expect(placeAtView(viewOf(SPIRALS), [])).toBeNull();
  });
});
