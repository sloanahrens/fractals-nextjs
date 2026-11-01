import { describe, expect, it } from "vitest";

import {
  FRACTAL_TYPES,
  defaultVariant,
  defaultViewFor,
  resolveFractalKind,
} from "../fractalTypes";
import { calculateZoomBounds } from "../mandelbrot";

/**
 * A fixed grid over each fractal's opening frame, and the cap its points are
 * counted at. The grid has the canvas's 4:3 shape, so its points are spread
 * over the frame the way a picture's pixels are, and every kind is counted on
 * the same grid whatever its opening view.
 */
const GRID_COLUMNS = 48;
const GRID_ROWS = 36;
const CAP = 200;

/**
 * The most iteration steps a fractal's opening frame may cost, counted by
 * `workFor` at the grid above and the cap above.
 *
 * A ceiling is the work it was measured at, rounded up by a quarter, and it is
 * a ceiling and not a measurement: a kind may get cheaper and pass, and a
 * change that makes one much heavier fails here. The comment on `workFor`
 * below says what a step count leaves out.
 */
const STEP_CEILINGS: Readonly<Record<string, number>> = {
  mandelbrot: 61373,
  julia: 34328,
  "burning-ship": 71245,
  tricorn: 32630,
  multibrot: 67365,
  newton: 201629,
  celtic: 63304,
  "perpendicular-ship": 72687,
  magnet: 307093,
  phoenix: 28798,
  nova: 86290,
  sine: 220570,
  cosine: 192202,
  "sin-z-squared": 149145,
  "sine-plus-z": 256285,
};

/**
 * The work one fractal's opening frame costs: the iteration counts its kind
 * returns at the grid's points, summed.
 *
 * The frame is the one the explorer opens on, `defaultViewFor` for the kind's
 * default variant, and the points are the centres of the grid's cells, so the
 * count is a sample of the frame rather than a sample of its edge.
 *
 * What this number does not judge: a sin or cos step costs more than a plain
 * Mandelbrot step, so two kinds with equal counts can take different wall
 * time, and no wall clock is read anywhere here. It is also only the opening
 * frame; a deep zoom shows a different region at a different cap, and is not
 * what this guard measures.
 * @param typeId - Id of the fractal to count, as the picker spells it
 * @returns Iteration steps summed over the opening frame's grid
 */
function workFor(typeId: string): number {
  const kind = resolveFractalKind(typeId, defaultVariant(typeId));
  const view = defaultViewFor(typeId);
  const bounds = calculateZoomBounds(view.centerX, view.centerY, view.zoom);
  const cellWidth = (bounds.maxReal - bounds.minReal) / GRID_COLUMNS;
  const cellHeight = (bounds.maxImaginary - bounds.minImaginary) / GRID_ROWS;

  let total = 0;
  for (let column = 0; column < GRID_COLUMNS; column++) {
    const real = bounds.minReal + (column + 0.5) * cellWidth;
    for (let row = 0; row < GRID_ROWS; row++) {
      const imaginary = bounds.minImaginary + (row + 0.5) * cellHeight;
      total += kind.iterations({ real, imaginary }, CAP, false);
    }
  }

  return total;
}

describe("render work", () => {
  it("has a ceiling for every fractal the picker offers", () => {
    const ceilings = Object.keys(STEP_CEILINGS);
    for (const type of FRACTAL_TYPES) {
      expect(ceilings, `${type.id} has no ceiling`).toContain(type.id);
    }
  });

  it("has no ceiling for an id the picker no longer offers", () => {
    const offered = FRACTAL_TYPES.map((type) => type.id);
    for (const id of Object.keys(STEP_CEILINGS)) {
      expect(
        offered,
        `${id} has a ceiling but is not in FRACTAL_TYPES`,
      ).toContain(id);
    }
  });

  for (const type of FRACTAL_TYPES) {
    it(`keeps ${type.id}'s opening frame under its committed step ceiling`, () => {
      const ceiling = STEP_CEILINGS[type.id];
      if (ceiling === undefined) {
        expect.fail(`${type.id} has no committed ceiling`);
      }

      const work = workFor(type.id);
      expect(
        work,
        `${type.id} does ${work} steps in its opening frame, over its ceiling of ${ceiling}`,
      ).toBeLessThanOrEqual(ceiling);
    });
  }
});
