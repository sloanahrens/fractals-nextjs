import { describe, expect, it } from "vitest";

import type { ComplexNumber } from "../../types/fractal";
import { burningShipKind } from "../burningShip";
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
import { createMultibrotKind } from "../multibrot";
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
  it("offers the five fractals in order, each once", () => {
    // The first entry is the one the explorer opens on, so the order is part
    // of the contract and not just how the list happens to read.
    expect(FRACTAL_TYPES).toEqual([
      { id: "mandelbrot", label: "Mandelbrot" },
      { id: "julia", label: "Julia" },
      { id: "burning-ship", label: "Burning Ship" },
      { id: "tricorn", label: "Tricorn" },
      { id: "multibrot", label: "Multibrot" },
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

  it("falls back to the Mandelbrot set for an unknown id", () => {
    // A picker choice from a version that knows a fractal this build does not
    // renders the familiar set rather than a blank canvas.
    expect(resolveFractalKind("newton", "Dendrite")).toBe(mandelbrotKind);
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

  it("frames the Multibrot about the origin at zoom 1, holding all three powers", () => {
    expect(defaultViewFor("multibrot")).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 1,
    });
  });

  it("falls back to the Mandelbrot view for an unknown id", () => {
    expect(defaultViewFor("newton")).toEqual({
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

  it("gives the Mandelbrot set, the Burning Ship, the Tricorn and an unknown id no row", () => {
    expect(fractalVariants("mandelbrot")).toBeNull();
    expect(fractalVariants("burning-ship")).toBeNull();
    expect(fractalVariants("tricorn")).toBeNull();
    expect(fractalVariants("newton")).toBeNull();
  });

  it("describes only Julia and the Multibrot among the picker's fractals", () => {
    expect(
      FRACTAL_TYPES.filter((type) => fractalVariants(type.id) !== null).map(
        (type) => type.id,
      ),
    ).toEqual(["julia", "multibrot"]);
  });
});

describe("defaultVariant", () => {
  it("is Julia's first named constant and empty for a fractal with no variant", () => {
    expect(defaultVariant("julia")).toBe(JULIA_CONSTANTS[0].name);
    expect(defaultVariant("mandelbrot")).toBe("");
    expect(defaultVariant("burning-ship")).toBe("");
    expect(defaultVariant("tricorn")).toBe("");
    expect(defaultVariant("newton")).toBe("");
  });

  it("is power 3 for the Multibrot", () => {
    expect(defaultVariant("multibrot")).toBe("3");
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

  it("refuses an unreadable value, and every value of a fractal with no variant", () => {
    expect(isVariantValue("julia", "Newton")).toBe(false);
    expect(isVariantValue("julia", "custom:9,9")).toBe(false);
    expect(isVariantValue("julia", undefined)).toBe(false);
    expect(isVariantValue("mandelbrot", "Classic")).toBe(false);
    expect(isVariantValue("burning-ship", "")).toBe(false);
    expect(isVariantValue("tricorn", "Classic")).toBe(false);
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
    expect(isCustomVariant("multibrot", "custom:-0.8,0.156")).toBe(false);
  });
});

describe("variantOn", () => {
  it("keeps a value the fractal can be drawn with", () => {
    expect(variantOn("julia", "Dendrite")).toBe("Dendrite");
    expect(variantOn("julia", "custom:-0.8,0.156")).toBe("custom:-0.8,0.156");
    expect(variantOn("multibrot", "5")).toBe("5");
  });

  it("gives a fractal that takes a variant its own default for another fractal's value", () => {
    // Julia -> Multibrot must not leave a constant's name where a power goes,
    // nor Multibrot -> Julia a power where a constant goes.
    expect(variantOn("multibrot", "Dendrite")).toBe("3");
    expect(variantOn("julia", "4")).toBe(JULIA_CONSTANTS[0].name);
    expect(variantOn("multibrot", "")).toBe("3");
  });

  it("leaves the value alone for a fractal that takes none, so Julia -> Mandelbrot -> Julia keeps the constant", () => {
    for (const id of ["mandelbrot", "burning-ship", "tricorn", "newton"]) {
      expect(variantOn(id, "Dendrite"), id).toBe("Dendrite");
      expect(variantOn(id, "4"), id).toBe("4");
    }
  });
});
