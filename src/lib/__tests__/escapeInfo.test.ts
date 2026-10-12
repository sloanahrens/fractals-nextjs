/**
 * `escapeInfo`, every kind's answer to "what did this point's orbit do?".
 *
 * The Math card's probe asks each kind this and prints what it says
 * (`src/lib/mathProbe.ts`), so what is held here is that the answer agrees with
 * the count the renderer paints: the same steps, and escaped exactly when the
 * count came in under the cap. Newton is the one kind whose count is not a step
 * count at all — it packs a root and a speed into the number — so for it the
 * agreement is that a point which never settled is the point the renderer
 * paints black.
 */
import { describe, expect, it } from "vitest";

import { burningShipKind } from "../burningShip";
import { createJuliaKind } from "../julia";
import { mandelbrotKind } from "../mandelbrot";
import { MULTIBROT_POWERS, createMultibrotKind } from "../multibrot";
import { NEWTON_ROOTS, newtonKind } from "../newton";
import { celticKind } from "../celtic";
import { MAGNET_TYPES, createMagnetKind } from "../magnet";
import { perpendicularShipKind } from "../perpendicularShip";
import { tricornKind } from "../tricorn";
import type { ComplexNumber, FractalKind } from "../../types/fractal";

const CAP = 200;

/** The point the set is built around: in it, or unsettled, for every kind here. */
const ORIGIN: ComplexNumber = { real: 0, imaginary: 0 };

interface KindCase {
  name: string;
  kind: FractalKind;
  /** A point that runs the whole cap. */
  neverEnds: ComplexNumber;
  /** A point whose orbit ends at a step worked out by hand. */
  endsAt: { point: ComplexNumber; steps: number };
  /**
   * Whether the kind's count packs more than a step count (Newton's root and
   * speed). False means the count is the step count itself.
   */
  packsOutcomes: boolean;
  /**
   * Where the 9x9 agreement grid starts, and how wide it is, for a kind whose
   * picture is not around the origin. Defaults to the Mandelbrot set's own
   * corner: x -1.6..0 by y -1..0.6, which holds both endings for most kinds.
   */
  grid?: { real: number; imaginary: number; span: number };
}

/** The grid every kind uses unless its case says otherwise. */
const DEFAULT_GRID = { real: -1.6, imaginary: -1, span: 1.6 };

const CASES: KindCase[] = [
  {
    name: "mandelbrot",
    kind: mandelbrotKind,
    // The origin is inside the main cardioid, which the kind answers in closed
    // form: the cap, and no escape.
    neverEnds: ORIGIN,
    // c = 2 leaves the radius of 2 on the second step, counted as step 1.
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    packsOutcomes: false,
  },
  {
    name: "julia",
    // The Dendrite's constant, c = i: 0 is in that Julia set, so the orbit
    // started there stays.
    kind: createJuliaKind({ real: 0, imaginary: 1 }),
    neverEnds: ORIGIN,
    // A point already outside the radius is away on its first step, counted as
    // step 0.
    endsAt: { point: { real: 3, imaginary: 0 }, steps: 0 },
    packsOutcomes: false,
  },
  {
    name: "burning-ship",
    kind: burningShipKind,
    // The ship is the folded orbit of c, and the orbit of c = 0 is 0 forever.
    neverEnds: ORIGIN,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    packsOutcomes: false,
  },
  {
    name: "tricorn",
    kind: tricornKind,
    neverEnds: ORIGIN,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    packsOutcomes: false,
  },
  {
    name: "celtic",
    kind: celticKind,
    neverEnds: ORIGIN,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    packsOutcomes: false,
  },
  {
    name: "perpendicular-ship",
    kind: perpendicularShipKind,
    neverEnds: ORIGIN,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    packsOutcomes: false,
  },
  {
    name: "multibrot 3",
    kind: createMultibrotKind(3),
    neverEnds: ORIGIN,
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 1 },
    packsOutcomes: false,
  },
  {
    name: "magnet type 1",
    kind: createMagnetKind(1),
    // The magnet set is the c whose orbit settles on 1, and the orbit of c = 0
    // reaches it too slowly to count as settled within the cap, so it runs the
    // whole cap without escaping: the renderer paints it black.
    neverEnds: ORIGIN,
    // c = 2 is the map's pole at the orbit's own start: 2z + c - 2 is zero
    // there, so there is no first step and the orbit is gone on step 0.
    endsAt: { point: { real: 2, imaginary: 0 }, steps: 0 },
    packsOutcomes: false,
    // The magnet set is not around the origin: its island runs from about
    // -0.46 to 3.07, so the grid is the part of it with settled black above and
    // below.
    grid: { real: 0.6, imaginary: -1.2, span: 2.4 },
  },
  {
    name: "magnet type 2",
    kind: createMagnetKind(2),
    neverEnds: ORIGIN,
    // The first step of c = 1.45 + 0.85i is about 116.6 across, past the
    // bailout of 100, so the orbit leaves on step 0.
    endsAt: { point: { real: 1.45, imaginary: 0.85 }, steps: 0 },
    packsOutcomes: false,
    // Type II's island is smaller and sits a little left of Type I's, spanning
    // x -0.20..2.30 by y -1.53..1.53.
    grid: { real: 0.6, imaginary: -1.2, span: 2.4 },
  },
  {
    name: "newton",
    kind: newtonKind,
    // z = 0 has no step (the derivative vanishes) and never settles.
    neverEnds: ORIGIN,
    // -0.5 is sent to the root 1 in one step; 1 is already there, in none.
    endsAt: { point: { real: -0.5, imaginary: 0 }, steps: 1 },
    packsOutcomes: true,
  },
];

describe.each(CASES)(
  "$name",
  ({ kind, neverEnds, endsAt, packsOutcomes, grid = DEFAULT_GRID }) => {
  it("reports the whole cap for a point that never ends", () => {
    const info = kind.escapeInfo!(neverEnds, CAP);

    expect(info.steps).toBe(CAP);
    expect(info.escaped).toBe(false);
    expect(info.root).toBeUndefined();
  });

  it("reports the step a point's orbit ended on", () => {
    const info = kind.escapeInfo!(endsAt.point, CAP);

    expect(info.steps).toBe(endsAt.steps);
    expect(info.escaped).toBe(true);
  });

  it("agrees with iterations(point, max, false) across a grid", () => {
    let ended = 0;
    let stayed = 0;

    for (let row = 0; row < 9; row++) {
      for (let column = 0; column < 9; column++) {
        const point = {
          real: grid.real + (column * grid.span) / 8,
          imaginary: grid.imaginary + (row * grid.span) / 8,
        };
        const count = kind.iterations(point, CAP, false);
        const info = kind.escapeInfo!(point, CAP);

        // The count is always inside 0..cap, and the step count is the count
        // for every kind whose count is made of steps.
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(CAP);
        expect(info.steps).toBeGreaterThanOrEqual(0);
        expect(info.steps).toBeLessThanOrEqual(CAP);
        // A point the cap never ends is a point the renderer paints with the
        // cap: black for every kind here.
        expect(info.escaped).toBe(info.steps < CAP);
        expect(info.escaped).toBe(count < CAP);
        // A root is a settled point's alone, and only a kind that packs
        // several outcomes into its count has one to name.
        if (packsOutcomes && info.escaped) expect(info.root).toBeDefined();
        else expect(info.root).toBeUndefined();

        if (!packsOutcomes) expect(info.steps).toBe(count);
        if (info.escaped) ended++;
        else stayed++;
      }
    }

    // A grid with both kinds of point in it, so the loop above said something.
    expect(ended).toBeGreaterThan(0);
    expect(stayed).toBeGreaterThan(0);
  });
  },
);

describe("newtonKind's escapeInfo", () => {
  it("names the root the point settled on, 0-based as the kind numbers them", () => {
    // Each root settles on itself in no steps.
    NEWTON_ROOTS.forEach((root, index) => {
      const info = newtonKind.escapeInfo!(root, CAP);

      expect(info.escaped).toBe(true);
      expect(info.steps).toBe(0);
      expect(info.root).toBe(index);
    });
  });

  it("numbers the roots from 0, whatever the card says", () => {
    // The card adds 1 when it prints them (mathProbe.test.ts); the kind's own
    // numbering is the order NEWTON_ROOTS gives.
    expect(newtonKind.escapeInfo!({ real: 1, imaginary: 0 }, CAP).root).toBe(0);
    expect(
      newtonKind.escapeInfo!({ real: -0.5, imaginary: Math.sqrt(3) / 2 }, CAP)
        .root,
    ).toBe(1);
    expect(
      newtonKind.escapeInfo!({ real: -0.5, imaginary: -Math.sqrt(3) / 2 }, CAP)
        .root,
    ).toBe(2);
  });

  it("calls a point the cap cannot settle unsettled, not escaped", () => {
    // The boundary dust and the points with no step: the renderer paints them
    // the cap, which is black.
    for (const point of [
      ORIGIN,
      { real: Number.NaN, imaginary: 0 },
      { real: Infinity, imaginary: 0 },
    ]) {
      const info = newtonKind.escapeInfo!(point, CAP);

      expect(info.steps).toBe(CAP);
      expect(info.escaped).toBe(false);
      expect(newtonKind.iterations(point, CAP, false)).toBe(CAP);
    }
  });

  it("settles a point at a root the count paints short of the cap", () => {
    const point = { real: -0.5, imaginary: 0 };
    const info = newtonKind.escapeInfo!(point, CAP);

    expect(newtonKind.iterations(point, CAP, false)).toBeLessThan(CAP);
    expect(info.steps).toBe(1);
  });
});

describe("every kind this app ships", () => {
  it("answers for itself rather than falling back to its count", () => {
    const kinds: FractalKind[] = [
      mandelbrotKind,
      createJuliaKind({ real: -0.8, imaginary: 0.156 }),
      burningShipKind,
      tricornKind,
      celticKind,
      perpendicularShipKind,
      ...MULTIBROT_POWERS.map(createMultibrotKind),
      ...MAGNET_TYPES.map(createMagnetKind),
      newtonKind,
    ];

    for (const kind of kinds) {
      expect(typeof kind.escapeInfo).toBe("function");
    }
  });
});
