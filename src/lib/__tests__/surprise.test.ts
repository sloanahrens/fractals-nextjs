import { describe, expect, it } from "vitest";

import { PLACES, suggest, type Place } from "../places";
import { SURPRISE_CANDIDATES, surpriseTarget } from "../surprise";

function place(id: string, centerX: number, zoom = 4): Place {
  return { id, name: id, fractal: "mandelbrot", centerX, centerY: 0, zoom };
}

const VIEW = { fractal: "mandelbrot", centerX: 0, centerY: 0, zoom: 1 };

// Ten places at increasing distance, so suggest() ranks them a..j.
const CATALOGUE: Place[] = "abcdefghij"
  .split("")
  .map((id, index) => place(id, (index + 1) * 0.5));

describe("surpriseTarget", () => {
  it("returns null for an empty catalogue", () => {
    expect(surpriseTarget(VIEW, [], () => 0)).toBeNull();
  });

  it("returns null when the only places are of another fractal", () => {
    const julia = { ...place("j", 0.5), fractal: "julia" };

    expect(surpriseTarget(VIEW, [julia], () => 0)).toBeNull();
  });

  it("returns null for a view that cannot be measured", () => {
    expect(
      surpriseTarget({ ...VIEW, zoom: Number.NaN }, CATALOGUE, () => 0),
    ).toBeNull();
  });

  it("chooses among the places suggest offers, by the pick", () => {
    const offered = suggest(VIEW, CATALOGUE, SURPRISE_CANDIDATES);

    expect(offered).toHaveLength(SURPRISE_CANDIDATES);
    expect(surpriseTarget(VIEW, CATALOGUE, () => 0)).toBe(offered[0]);
    expect(surpriseTarget(VIEW, CATALOGUE, () => 0.5)).toBe(offered[3]);
    expect(surpriseTarget(VIEW, CATALOGUE, () => 0.999999)).toBe(offered[5]);
  });

  it("never chooses beyond the nearest few", () => {
    const farthest = CATALOGUE[CATALOGUE.length - 1];

    for (let step = 0; step < 100; step++) {
      expect(surpriseTarget(VIEW, CATALOGUE, () => step / 100)).not.toBe(
        farthest,
      );
    }
  });

  it("never chooses the place the view already is", () => {
    // The view sits on "a": centre and zoom match it.
    const onA = { fractal: "mandelbrot", centerX: 0.5, centerY: 0, zoom: 4 };

    for (let step = 0; step < 100; step++) {
      const target = surpriseTarget(onA, CATALOGUE, () => step / 100);

      expect(target).not.toBeNull();
      expect(target?.id).not.toBe("a");
    }
  });

  it("returns the one place there is, whatever the pick", () => {
    const only = place("only", 0.5);

    expect(surpriseTarget(VIEW, [only], () => 0)).toBe(only);
    expect(surpriseTarget(VIEW, [only], () => 0.99)).toBe(only);
  });

  it("holds a pick outside [0, 1) to the list", () => {
    const offered = suggest(VIEW, CATALOGUE, SURPRISE_CANDIDATES);

    expect(surpriseTarget(VIEW, CATALOGUE, () => 1)).toBe(offered[5]);
    expect(surpriseTarget(VIEW, CATALOGUE, () => 7)).toBe(offered[5]);
    expect(surpriseTarget(VIEW, CATALOGUE, () => -3)).toBe(offered[0]);
    expect(surpriseTarget(VIEW, CATALOGUE, () => Number.NaN)).toBe(offered[0]);
  });

  it("defaults to Math.random and finds a place in the real catalogue", () => {
    const target = surpriseTarget(VIEW, PLACES);

    expect(target).not.toBeNull();
    expect(target?.fractal).toBe("mandelbrot");
  });
});
