import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import { burningShipKind } from "../burningShip";
import { celticKind } from "../celtic";
import { perpendicularShipKind } from "../perpendicularShip";
import { tricornKind } from "../tricorn";
import {
  FRACTAL_TYPES,
  defaultVariant,
  defaultViewFor,
  fractalVariants,
  isCustomVariant,
  isVariantValue,
  resolveFractalKind,
  variantOn,
} from "../fractalTypes";
import { createMagnetKind } from "../magnet";
import { createMultibrotKind } from "../multibrot";
import { createNewtonKind, newtonKind } from "../newton";
import { PHOENIX_CONSTANTS, createPhoenixKind } from "../phoenix";
import { JULIA_CONSTANTS, createJuliaKind } from "../julia";
import { mandelbrotKind } from "../mandelbrot";

const CAP = 200;

/** A 10 x 10 spread of points reaching both inside and outside the set. */
function sampledPoints(): ComplexNumber[] {
  const points: ComplexNumber[] = [];
  for (let column = 0; column < 10; column++) {
    for (let row = 0; row < 10; row++) {
      points.push({
        real: -2 + (3 * column) / 9,
        imaginary: -1.2 + (2.4 * row) / 9,
      });
    }
  }
  return points;
}

describe("FRACTAL_TYPES", () => {
  it("offers the ten fractals in order, each once", () => {
    // The first entry is the one the explorer opens on, so the order is part
    // of the contract and not just how the list happens to read.
    expect(FRACTAL_TYPES).toEqual([
      { id: "mandelbrot", label: "Mandelbrot" },
      { id: "julia", label: "Julia" },
      { id: "burning-ship", label: "Burning Ship" },
      { id: "tricorn", label: "Tricorn" },
      { id: "multibrot", label: "Multibrot" },
      { id: "newton", label: "Newton" },
      { id: "celtic", label: "Celtic" },
      { id: "perpendicular-ship", label: "Perp. Ship" },
      { id: "magnet", label: "Magnet" },
      { id: "phoenix", label: "Phoenix" },
    ]);

    const ids = FRACTAL_TYPES.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("resolveFractalKind", () => {
  it("draws the named constant as its own Julia kind", () => {
    const resolved = resolveFractalKind("julia", "Dendrite");
    const expected = createJuliaKind({ real: 0, imaginary: 1 });
    const points = sampledPoints();

    for (const point of points) {
      expect(resolved.iterations(point, CAP, true)).toBe(
        expected.iterations(point, CAP, true),
      );
    }
  });

  it("draws the Newton fractal of the polynomial the variant names, and of z^3 - 1 for a value it cannot read", () => {
    // z^3 - 1 is the picture the app has always drawn, so it is the one a
    // value from outside falls back to rather than a blank canvas.
    expect(resolveFractalKind("newton", "Dendrite")).toBe(newtonKind);
    expect(resolveFractalKind("newton", "")).toBe(newtonKind);
    expect(resolveFractalKind("newton", "3")).toBe(newtonKind);

    const fourth = resolveFractalKind("newton", "4");
    expect(fourth).toBe(createNewtonKind("4"));
    expect(fourth).not.toBe(newtonKind);
    // A point arrives at a different root's band under each polynomial, which
    // is what the picture is made of.
    expect(fourth.iterations({ real: 0.5, imaginary: 0.5 }, CAP, false)).not.toBe(
      newtonKind.iterations({ real: 0.5, imaginary: 0.5 }, CAP, false),
    );
  });

  it("draws the Mandelbrot set for its own id", () => {
    expect(resolveFractalKind("mandelbrot", "Dendrite")).toBe(mandelbrotKind);
  });

  it("draws the ship for its own id, whatever constant is beside it", () => {
    // The ship takes no constant, so a Julia constant left over in the picker
    // state does not reach its formula.
    expect(resolveFractalKind("burning-ship", "Dendrite")).toBe(
      burningShipKind,
    );
    expect(resolveFractalKind("burning-ship", "")).toBe(burningShipKind);
  });

  it("draws the Celtic set for its own id, whatever variant is beside it", () => {
    expect(resolveFractalKind("celtic", "Dendrite")).toBe(celticKind);
    expect(resolveFractalKind("celtic", "")).toBe(celticKind);
  });

  it("draws the Perpendicular Ship for its own id, whatever variant is beside it", () => {
    // It takes no setting, so a Julia constant or a Multibrot power left over
    // in the picker state does not reach its formula.
    expect(resolveFractalKind("perpendicular-ship", "Dendrite")).toBe(
      perpendicularShipKind,
    );
    expect(resolveFractalKind("perpendicular-ship", "")).toBe(
      perpendicularShipKind,
    );
  });

  it("draws the Tricorn for its own id, whatever constant is beside it", () => {
    expect(resolveFractalKind("tricorn", "Dendrite")).toBe(tricornKind);
    expect(resolveFractalKind("tricorn", "")).toBe(tricornKind);
  });

  it("draws the Multibrot of the power beside it", () => {
    const points = sampledPoints();

    for (const power of [3, 4, 5]) {
      const resolved = resolveFractalKind("multibrot", String(power));
      const expected = createMultibrotKind(power);

      for (const point of points) {
        expect(resolved.iterations(point, CAP, true), String(power)).toBe(
          expected.iterations(point, CAP, true),
        );
      }
    }
  });

  it("falls back to power 3 for a power it cannot read, as an unknown Julia name falls back to the first constant", () => {
    const expected = createMultibrotKind(3);
    const points = sampledPoints();

    for (const variant of ["", "6", "2", "3.0", "Classic", "custom:0,0"]) {
      const resolved = resolveFractalKind("multibrot", variant);

      expect(resolved.id, variant).toBe("multibrot");
      for (const point of points) {
        expect(resolved.iterations(point, CAP, true), variant).toBe(
          expected.iterations(point, CAP, true),
        );
      }
    }
  });

  it("draws the Phoenix set of the constant beside it", () => {
    const points = sampledPoints();

    for (const entry of PHOENIX_CONSTANTS) {
      const resolved = resolveFractalKind("phoenix", entry.name);
      const expected = createPhoenixKind(entry.constant);

      expect(resolved.id).toBe("phoenix");
      for (const point of points) {
        expect(resolved.iterations(point, CAP, true), entry.name).toBe(
          expected.iterations(point, CAP, true),
        );
      }
    }
  });

  it("falls back to the Classic Phoenix for a name it cannot read", () => {
    const expected = createPhoenixKind(PHOENIX_CONSTANTS[0].constant);
    const points = sampledPoints();

    for (const variant of ["", "classic", "3", "Dendrite", "custom:0,0"]) {
      const resolved = resolveFractalKind("phoenix", variant);

      expect(resolved.id, variant).toBe("phoenix");
      for (const point of points) {
        expect(resolved.iterations(point, CAP, true), variant).toBe(
          expected.iterations(point, CAP, true),
        );
      }
    }
  });

  it("draws the Magnet of the type beside it", () => {
    const points = sampledPoints();

    for (const type of [1, 2]) {
      const resolved = resolveFractalKind("magnet", String(type));
      const expected = createMagnetKind(type);

      for (const point of points) {
        expect(resolved.iterations(point, CAP, true), String(type)).toBe(
          expected.iterations(point, CAP, true),
        );
      }
    }
  });

  it("falls back to Type I for a magnetic type it cannot read", () => {
    const expected = createMagnetKind(1);
    const points = sampledPoints();

    for (const variant of ["", "0", "3", "1.0", "Classic", "custom:0,0"]) {
      const resolved = resolveFractalKind("magnet", variant);

      expect(resolved.id, variant).toBe("magnet");
      for (const point of points) {
        expect(resolved.iterations(point, CAP, true), variant).toBe(
          expected.iterations(point, CAP, true),
        );
      }
    }
  });

  it("falls back to the Mandelbrot set for an unknown id", () => {
    // A picker choice from a version that knows a fractal this build does not
    // renders the familiar set rather than a blank canvas.
    expect(resolveFractalKind("lyapunov", "Dendrite")).toBe(mandelbrotKind);
    expect(resolveFractalKind("", "")).toBe(mandelbrotKind);
  });

  it("falls back to the first constant for an unknown name", () => {
    const resolved = resolveFractalKind("julia", "Not a constant");
    const expected = createJuliaKind(JULIA_CONSTANTS[0].constant);
    const points = sampledPoints();

    for (const point of points) {
      expect(resolved.iterations(point, CAP, true)).toBe(
        expected.iterations(point, CAP, true),
      );
    }
  });

  it("draws a custom constant as the point it names", () => {
    // The custom spelling of the Classic constant beside the named one: the
    // same picture twice, which is what says the name is read as its numbers
    // rather than matched as a label. Judged on the counts, so the kind is
    // compared on what it draws and not on how it was built.
    const custom = resolveFractalKind("julia", "custom:-0.8,0.156");
    const named = resolveFractalKind("julia", JULIA_CONSTANTS[0].name);
    const points = sampledPoints();

    for (const point of points) {
      expect(custom.iterations(point, CAP, true)).toBe(
        named.iterations(point, CAP, true),
      );
      expect(custom.iterations(point, CAP, false)).toBe(
        named.iterations(point, CAP, false),
      );
    }
  });

  it("draws a custom constant that is no named one at all", () => {
    // A point none of the four constants is, so a fallback would show up as
    // different counts rather than as the same picture by coincidence.
    const custom = resolveFractalKind("julia", "custom:0.285,0.01");
    const expected = createJuliaKind({ real: 0.285, imaginary: 0.01 });
    const points = sampledPoints();

    for (const point of points) {
      expect(custom.iterations(point, CAP, true)).toBe(
        expected.iterations(point, CAP, true),
      );
    }
  });

  it("falls back to the first constant for a custom name it cannot read", () => {
    // A name written in a way that is not a point is no more readable than a
    // name this build has never heard of: both leave the canvas showing the
    // first constant rather than a blank one.
    const expected = createJuliaKind(JULIA_CONSTANTS[0].constant);
    const points = sampledPoints();

    for (const name of [
      "custom:0.5,0.5x",
      "custom:9,9",
      "custom:",
      "Custom:0,0",
    ]) {
      const resolved = resolveFractalKind("julia", name);

      for (const point of points) {
        expect(resolved.iterations(point, CAP, true), name).toBe(
          expected.iterations(point, CAP, true),
        );
      }
    }
  });
});

describe("defaultViewFor", () => {
  it("frames the Mandelbrot set where the whole of it sits", () => {
    expect(defaultViewFor("mandelbrot")).toEqual({
      centerX: -0.75,
      centerY: 0,
      zoom: 1,
    });
  });

  it("frames a Julia set about the origin", () => {
    // A Julia set is symmetric about the origin whatever its constant, so
    // centring it anywhere else shows a corner of it.
    expect(defaultViewFor("julia")).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 1,
    });
  });

  it("frames the ship where the whole of it sits", () => {
    // The ship lies below and to the left of the origin. At zoom 1 the base
    // view is 4 x 3, so this centre spans -2.45..1.55 by -2..1, which holds
    // the hull and the masts without the axis being turned over.
    expect(defaultViewFor("burning-ship")).toEqual({
      centerX: -0.45,
      centerY: -0.5,
      zoom: 1,
    });
  });

  it("frames the Tricorn about the origin, which its three arms turn about", () => {
    expect(defaultViewFor("tricorn")).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 1,
    });
  });

  it("frames the Celtic set about the middle of its real extent, spike and nose both inside", () => {
    expect(defaultViewFor("celtic")).toEqual({
      centerX: -0.8,
      centerY: 0,
      zoom: 1,
    });
  });

  it("frames the Perpendicular Ship about the middle of its real extent, spike and nose both inside", () => {
    // The set spans x -1.78..0.68 by y -1.09..1.09, so -0.55 is the middle of
    // its real extent and zoom 1 (x -2.55..1.45, y -1.5..1.5) holds the whole
    // of it with 0.4 or more clear on every side.
    expect(defaultViewFor("perpendicular-ship")).toEqual({
      centerX: -0.55,
      centerY: 0,
      zoom: 1,
    });
  });

  it("frames the Multibrot about the origin at zoom 1, holding all three powers", () => {
    expect(defaultViewFor("multibrot")).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 1,
    });
  });

  it("frames the Newton fractal about the origin at zoom 1, holding all three roots", () => {
    expect(defaultViewFor("newton")).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 1,
    });
  });

  it("frames the Magnet on the middle of Type I's island, at the widest view there is", () => {
    // The island the picture is made of spans x -0.46..3.07 by y -2.16..2.16
    // for Type I and x -0.20..2.30 by y -1.53..1.53 for Type II: zoom 1 (4 by
    // 3) is the widest view the explorer has, so it is the only frame that can
    // hold either across, and 1.3 is the middle of Type I's real extent.
    expect(defaultViewFor("magnet")).toEqual({
      centerX: 1.3,
      centerY: 0,
      zoom: 1,
    });
  });

  it("frames Phoenix on the origin at the widest view, which holds every named constant's set", () => {
    // Measured spans, with a 0.01 grid at a cap of 300: Classic x -0.67..0.75 by
    // y +-1.27, Spirals x -0.88..0.72 by y +-1.13 and Hourglass x -0.65..0.75 by
    // y +-1.28, all inside zoom 1's x -2..2 by y -1.5..1.5 (phoenix.test.ts
    // checks the frame's border).
    expect(defaultViewFor("phoenix")).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 1,
    });
  });

  it("falls back to the Mandelbrot view for an unknown id", () => {
    expect(defaultViewFor("lyapunov")).toEqual({
      centerX: -0.75,
      centerY: 0,
      zoom: 1,
    });
  });
});

describe("fractalVariants", () => {
  it("gives Julia the captioned row of its four named constants and a Custom choice", () => {
    const variants = fractalVariants("julia");

    expect(variants?.label).toBe("Julia constant");
    expect(variants?.allowsCustom).toBe(true);
    expect(variants?.options).toEqual(
      JULIA_CONSTANTS.map((constant) => ({
        value: constant.name,
        label: constant.name,
      })),
    );
  });

  it("gives the Multibrot a captioned Power row of 3, 4 and 5 labelled z^3, z^4 and z^5, with no Custom choice", () => {
    const variants = fractalVariants("multibrot");

    expect(variants?.label).toBe("Power");
    expect(variants?.allowsCustom).toBe(false);
    expect(variants?.options).toEqual([
      { value: "3", label: "z^3" },
      { value: "4", label: "z^4" },
      { value: "5", label: "z^5" },
    ]);
  });

  it("gives the Newton fractal a captioned Polynomial row of the four equations, with no Custom choice", () => {
    const variants = fractalVariants("newton");

    expect(variants?.label).toBe("Polynomial");
    expect(variants?.allowsCustom).toBe(false);
    expect(variants?.options).toEqual([
      { value: "3", label: "z^3 - 1" },
      { value: "4", label: "z^4 - 1" },
      { value: "5", label: "z^5 - 1" },
      { value: "cycle", label: "z^3 - 2z + 2" },
    ]);
  });

  it("gives Phoenix a captioned row of its three named constants, with no Custom choice", () => {
    const variants = fractalVariants("phoenix");

    expect(variants?.label).toBe("Phoenix constant");
    expect(variants?.allowsCustom).toBe(false);
    expect(variants?.options).toEqual([
      { value: "Classic", label: "Classic" },
      { value: "Spirals", label: "Spirals" },
      { value: "Hourglass", label: "Hourglass" },
    ]);
  });

  it("gives the Mandelbrot set, the Burning Ship, the Perpendicular Ship, the Tricorn, the Celtic set and an unknown id no row", () => {
    expect(fractalVariants("mandelbrot")).toBeNull();
    expect(fractalVariants("burning-ship")).toBeNull();
    expect(fractalVariants("perpendicular-ship")).toBeNull();
    expect(fractalVariants("tricorn")).toBeNull();
    expect(fractalVariants("celtic")).toBeNull();
    expect(fractalVariants("lyapunov")).toBeNull();
  });

  it("describes only Julia, the Multibrot, the Newton fractal, the Magnet and the Phoenix among the picker's fractals", () => {
    expect(
      FRACTAL_TYPES.filter((type) => fractalVariants(type.id) !== null).map(
        (type) => type.id,
      ),
    ).toEqual(["julia", "multibrot", "newton", "magnet", "phoenix"]);
  });
});

describe("defaultVariant", () => {
  it("is Julia's first named constant and empty for a fractal with no variant", () => {
    expect(defaultVariant("julia")).toBe(JULIA_CONSTANTS[0].name);
    expect(defaultVariant("mandelbrot")).toBe("");
    expect(defaultVariant("burning-ship")).toBe("");
    expect(defaultVariant("tricorn")).toBe("");
    expect(defaultVariant("celtic")).toBe("");
    expect(defaultVariant("perpendicular-ship")).toBe("");
    expect(defaultVariant("lyapunov")).toBe("");
  });

  it("is the first named choice for a fractal that takes one, so Newton opens on z^3 - 1", () => {
    expect(defaultVariant("multibrot")).toBe("3");
    expect(defaultVariant("newton")).toBe("3");
    expect(defaultVariant("magnet")).toBe("1");
  });

  it("is power 3 for the Multibrot", () => {
    expect(defaultVariant("multibrot")).toBe("3");
  });

  it("is Type I for the Magnet", () => {
    expect(defaultVariant("magnet")).toBe("1");
  });

  it("is the Classic constant for the Phoenix", () => {
    expect(defaultVariant("phoenix")).toBe("Classic");
  });

  it("is always one of the fractal's own options", () => {
    for (const id of ["julia", "multibrot"]) {
      const values = fractalVariants(id)?.options.map((o) => o.value);

      expect(values, id).toContain(defaultVariant(id));
    }
  });
});

describe("isVariantValue", () => {
  it("accepts a named constant and a readable custom one for Julia", () => {
    expect(isVariantValue("julia", "Dendrite")).toBe(true);
    expect(isVariantValue("julia", "custom:-0.8,0.156")).toBe(true);
  });

  it("accepts exactly the plain spellings of 3, 4 and 5 for the Multibrot", () => {
    for (const power of ["3", "4", "5"]) {
      expect(isVariantValue("multibrot", power), power).toBe(true);
    }
    for (const value of ["2", "6", "03", "3.0", " 4", "4 ", "Classic", ""]) {
      expect(isVariantValue("multibrot", value), value).toBe(false);
    }
    expect(isVariantValue("multibrot", undefined)).toBe(false);
    expect(isVariantValue("multibrot", null)).toBe(false);
  });

  it("keeps a power out of Julia and a constant out of the Multibrot", () => {
    expect(isVariantValue("julia", "3")).toBe(false);
    expect(isVariantValue("multibrot", "Classic")).toBe(false);
    expect(isVariantValue("multibrot", "custom:-0.8,0.156")).toBe(false);
  });

  it("accepts the powers, and the cycle name, for the Newton fractal", () => {
    for (const polynomial of ["3", "4", "5", "cycle"]) {
      expect(isVariantValue("newton", polynomial), polynomial).toBe(true);
    }
    for (const value of ["2", "6", "03", "3.0", " 4", "Cycle", "z^3 - 1", ""]) {
      expect(isVariantValue("newton", value), value).toBe(false);
    }
    expect(isVariantValue("newton", undefined)).toBe(false);
    expect(isVariantValue("newton", null)).toBe(false);
    // The cycle is a polynomial of this fractal alone: a power it shares with
    // the Multibrot is a value of both, and each judges it for itself.
    expect(isVariantValue("multibrot", "cycle")).toBe(false);
  });

  it("accepts exactly the plain spellings of 1 and 2 for the Magnet", () => {
    for (const type of ["1", "2"]) {
      expect(isVariantValue("magnet", type), type).toBe(true);
    }
    for (const value of ["0", "3", "01", "1.0", " 1", "1 ", "Classic", ""]) {
      expect(isVariantValue("magnet", value), value).toBe(false);
    }
    expect(isVariantValue("magnet", undefined)).toBe(false);
    expect(isVariantValue("magnet", null)).toBe(false);
  });

  it("keeps a magnetic type out of the other families and their values out of the Magnet", () => {
    expect(isVariantValue("julia", "1")).toBe(false);
    expect(isVariantValue("multibrot", "1")).toBe(false);
    expect(isVariantValue("magnet", "Classic")).toBe(false);
    expect(isVariantValue("magnet", "4")).toBe(false);
    expect(isVariantValue("magnet", "custom:-0.8,0.156")).toBe(false);
  });

  it("accepts exactly the three constant names for Phoenix, and no custom one", () => {
    for (const name of ["Classic", "Spirals", "Hourglass"]) {
      expect(isVariantValue("phoenix", name), name).toBe(true);
    }
    for (const value of ["classic", "Dendrite", "3", "", "custom:0.5,0.5"]) {
      expect(isVariantValue("phoenix", value), value).toBe(false);
    }
    expect(isVariantValue("phoenix", undefined)).toBe(false);
    expect(isVariantValue("phoenix", null)).toBe(false);
    // And the names are Phoenix's alone, "Classic" aside, which Julia also has.
    expect(isVariantValue("julia", "Spirals")).toBe(false);
    expect(isVariantValue("multibrot", "Hourglass")).toBe(false);
    expect(isVariantValue("magnet", "Spirals")).toBe(false);
  });

  it("refuses an unreadable value, and every value of a fractal with no variant", () => {
    expect(isVariantValue("julia", "Newton")).toBe(false);
    expect(isVariantValue("julia", "custom:9,9")).toBe(false);
    expect(isVariantValue("julia", undefined)).toBe(false);
    expect(isVariantValue("mandelbrot", "Classic")).toBe(false);
    expect(isVariantValue("burning-ship", "")).toBe(false);
    expect(isVariantValue("tricorn", "Classic")).toBe(false);
    expect(isVariantValue("celtic", "Classic")).toBe(false);
    expect(isVariantValue("perpendicular-ship", "4")).toBe(false);
  });
});

describe("isCustomVariant", () => {
  it("is true only for a readable value that is not a named option", () => {
    expect(isCustomVariant("julia", "custom:-0.8,0.156")).toBe(true);
    expect(isCustomVariant("julia", "Classic")).toBe(false);
    expect(isCustomVariant("julia", "garbage")).toBe(false);
  });

  it("is false for a fractal that allows no custom value, whatever the page holds", () => {
    expect(isCustomVariant("mandelbrot", "custom:-0.8,0.156")).toBe(false);
    expect(isCustomVariant("burning-ship", "custom:-0.8,0.156")).toBe(false);
    expect(isCustomVariant("tricorn", "custom:-0.8,0.156")).toBe(false);
    expect(isCustomVariant("celtic", "custom:-0.8,0.156")).toBe(false);
    expect(isCustomVariant("perpendicular-ship", "custom:-0.8,0.156")).toBe(
      false,
    );
    expect(isCustomVariant("multibrot", "custom:-0.8,0.156")).toBe(false);
    expect(isCustomVariant("magnet", "custom:-0.8,0.156")).toBe(false);
    expect(isCustomVariant("magnet", "1")).toBe(false);
    expect(isCustomVariant("phoenix", "custom:-0.8,0.156")).toBe(false);
  });
});

describe("variantOn", () => {
  it("keeps a value the fractal can be drawn with", () => {
    expect(variantOn("julia", "Dendrite")).toBe("Dendrite");
    expect(variantOn("julia", "custom:-0.8,0.156")).toBe("custom:-0.8,0.156");
    expect(variantOn("multibrot", "5")).toBe("5");
    expect(variantOn("newton", "cycle")).toBe("cycle");
    expect(variantOn("magnet", "2")).toBe("2");
    expect(variantOn("phoenix", "Hourglass")).toBe("Hourglass");
  });

  it("gives Phoenix its first constant for a value it cannot draw, and Julia and the rest theirs for a Phoenix name", () => {
    expect(variantOn("phoenix", "Dendrite")).toBe("Classic");
    expect(variantOn("phoenix", "4")).toBe("Classic");
    expect(variantOn("phoenix", "")).toBe("Classic");
    expect(variantOn("julia", "Hourglass")).toBe(JULIA_CONSTANTS[0].name);
    expect(variantOn("multibrot", "Spirals")).toBe("3");
    expect(variantOn("magnet", "Spirals")).toBe("1");
  });

  it("gives a fractal that takes a variant its own default for another fractal's value", () => {
    // Julia -> Multibrot must not leave a constant's name where a power goes,
    // nor Multibrot -> Julia a power where a constant goes.
    expect(variantOn("multibrot", "Dendrite")).toBe("3");
    expect(variantOn("julia", "4")).toBe(JULIA_CONSTANTS[0].name);
    expect(variantOn("multibrot", "")).toBe("3");
    // And a power is not a magnetic type, so the Magnet falls back to Type I.
    expect(variantOn("magnet", "4")).toBe("1");
    expect(variantOn("magnet", "Dendrite")).toBe("1");
    expect(variantOn("magnet", "")).toBe("1");
    // A magnetic type is a value neither of the others can use.
    expect(variantOn("multibrot", "2")).toBe("3");
    // Newton shares the digits with the Multibrot's powers and has a fourth
    // value of its own, so each direction has to be judged by what the fractal
    // it is going to can draw: "4" is a power and a polynomial alike, "cycle"
    // belongs to Newton and to nothing else.
    expect(variantOn("newton", "Dendrite")).toBe("3");
    expect(variantOn("newton", "4")).toBe("4");
    expect(variantOn("newton", "")).toBe("3");
    expect(variantOn("multibrot", "cycle")).toBe("3");
    expect(variantOn("julia", "cycle")).toBe(JULIA_CONSTANTS[0].name);
  });

  it("leaves the value alone for a fractal that takes none, so Julia -> Mandelbrot -> Julia keeps the constant", () => {
    for (const id of [
      "mandelbrot",
      "burning-ship",
      "perpendicular-ship",
      "tricorn",
      "celtic",
    ]) {
      expect(variantOn(id, "Dendrite"), id).toBe("Dendrite");
      expect(variantOn(id, "4"), id).toBe("4");
    }
  });
});
