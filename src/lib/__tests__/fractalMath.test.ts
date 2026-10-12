/**
 * The Math card's descriptors
 *
 * A descriptor is data, so what can go wrong is data: a fractal in the picker
 * with no maths, a blurb left empty, a formula whose spoken reading says
 * something other than what is drawn. The guard walks `FRACTAL_TYPES` so a
 * fractal added later cannot skip its descriptor, and each descriptor's rule is
 * read back through `toPlainText` and compared with the words a listener should
 * hear.
 */
import { describe, expect, it } from "vitest";

import {
  FRACTAL_MATH,
  complexExpr,
  describeFractalMath,
  formatComplex,
  toPlainText,
  type MathExpr,
} from "../fractalMath";
import { FRACTAL_TYPES, defaultVariant } from "../fractalTypes";
import { JULIA_CONSTANTS } from "../julia";
import { MULTIBROT_POWERS } from "../multibrot";

const KINDS = new Set([
  "number",
  "identifier",
  "operator",
  "text",
  "superscript",
  "subscript",
  "fraction",
  "row",
  "conjugate",
  "abs",
]);

/** Every node of a tree, for checks that look at all of it. */
function nodes(expr: MathExpr): MathExpr[] {
  switch (expr.kind) {
    case "row":
      return [expr, ...expr.items.flatMap(nodes)];
    case "superscript":
      return [expr, ...nodes(expr.base), ...nodes(expr.exponent)];
    case "subscript":
      return [expr, ...nodes(expr.base), ...nodes(expr.subscript)];
    case "fraction":
      return [expr, ...nodes(expr.numerator), ...nodes(expr.denominator)];
    case "conjugate":
    case "abs":
      return [expr, ...nodes(expr.of)];
    default:
      return [expr];
  }
}

function sentences(blurb: string): string[] {
  return blurb.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== "");
}

describe("every fractal the picker offers has its maths", () => {
  it("has a descriptor for each FRACTAL_TYPES id, and for nothing else", () => {
    const ids = FRACTAL_TYPES.map((type) => type.id).sort();

    expect(Object.keys(FRACTAL_MATH).sort()).toEqual(ids);
  });

  for (const type of FRACTAL_TYPES) {
    describe(type.id, () => {
      const math = describeFractalMath(type.id, defaultVariant(type.id));

      it("names itself, its escape rule and its blurb", () => {
        expect(math.title.trim()).not.toBe("");
        expect(math.escape.trim()).not.toBe("");
        expect(math.blurb.trim()).not.toBe("");
      });

      it("has a blurb of two or three sentences", () => {
        expect(sentences(math.blurb).length).toBeGreaterThanOrEqual(2);
        expect(sentences(math.blurb).length).toBeLessThanOrEqual(3);
      });

      it("builds its formulas from the nine kinds of node and a rule that reads aloud", () => {
        for (const expr of [
          math.rule,
          math.start,
          ...(math.setting ? [math.setting.value] : []),
        ]) {
          for (const node of nodes(expr))
            expect(KINDS.has(node.kind)).toBe(true);
          expect(toPlainText(expr)).not.toBe("");
        }
      });

      it("carries no markup in any of its text", () => {
        const words = [math.title, math.blurb, math.escape];
        if (math.setting) words.push(math.setting.label);
        for (const expr of [math.rule, math.start]) {
          for (const node of nodes(expr)) {
            if (node.kind === "text" || node.kind === "number") {
              words.push(node.value);
            }
          }
        }

        for (const word of words) expect(word).not.toMatch(/[<>]|&\w+;/);
      });
    });
  }

  it("gives an id this build does not know the Mandelbrot set's maths", () => {
    expect(describeFractalMath("lyapunov", "")).toEqual(
      describeFractalMath("mandelbrot", ""),
    );
    expect(describeFractalMath("constructor", "").title).toBe("Mandelbrot set");
  });
});

describe("the rule, read aloud", () => {
  const rule = (id: string, variant = defaultVariant(id)) =>
    toPlainText(describeFractalMath(id, variant).rule);

  it("reads the Mandelbrot rule", () => {
    expect(rule("mandelbrot")).toBe("z becomes z squared plus c");
  });

  it("reads the Julia rule", () => {
    expect(rule("julia")).toBe("z becomes z squared plus c");
  });

  it("reads the Burning Ship rule", () => {
    expect(rule("burning-ship")).toBe(
      "z becomes open bracket the absolute value of the real part of z, plus i times the absolute value of the imaginary part of z, close bracket squared plus c",
    );
  });

  it("reads the Tricorn rule", () => {
    expect(rule("tricorn")).toBe("z becomes z bar squared plus c");
  });

  it("reads the Perpendicular Ship rule", () => {
    expect(rule("perpendicular-ship")).toBe(
      "z becomes open bracket the absolute value of the real part of z, minus i times the imaginary part of z close bracket squared plus c",
    );
  });

  it("reads the Celtic rule", () => {
    expect(rule("celtic")).toBe(
      "z becomes open bracket the absolute value of the real part of open bracket z squared close bracket, plus i times the imaginary part of open bracket z squared close bracket close bracket plus c",
    );
  });

  it("reads the Multibrot rule with its power as d", () => {
    for (const power of MULTIBROT_POWERS) {
      expect(rule("multibrot", String(power))).toBe(
        "z becomes z to the power d plus c",
      );
    }
  });

  it("reads Newton's rule, with the polynomial's own p(z) and p'(z) in it", () => {
    expect(rule("newton")).toBe(
      "z becomes z minus the fraction z cubed minus 1 over 3 times z squared end fraction",
    );
    expect(toPlainText(describeFractalMath("newton", "4").rule)).toBe(
      "z becomes z minus the fraction z to the power 4 minus 1 over 4 times z cubed end fraction",
    );
    expect(toPlainText(describeFractalMath("newton", "5").rule)).toBe(
      "z becomes z minus the fraction z to the power 5 minus 1 over 5 times z to the power 4 end fraction",
    );
    expect(toPlainText(describeFractalMath("newton", "cycle").rule)).toBe(
      "z becomes z minus the fraction z cubed minus 2 times z plus 2 over 3 times z squared minus 2 end fraction",
    );
    // A value this build cannot read is drawn as z^3 - 1 and read as it.
    expect(toPlainText(describeFractalMath("newton", "garbage").rule)).toBe(
      rule("newton"),
    );
  });

  it("reads the first magnetic type's rule", () => {
    expect(rule("magnet", "1")).toBe(
      "z becomes the fraction z squared plus c minus 1 over 2 times z plus c minus 2 end fraction squared",
    );
  });

  it("reads the Phoenix rule, with the point before the last in it", () => {
    for (const name of ["Classic", "Spirals", "Hourglass"]) {
      expect(rule("phoenix", name), name).toBe(
        "z sub n plus 1 equals z sub n squared plus c plus p times z sub n minus 1",
      );
    }
  });

  it("reads the second magnetic type's rule", () => {
    expect(rule("magnet", "2")).toBe(
      "z becomes the fraction z cubed plus 3 times open bracket c minus 1 close bracket times z plus open bracket c minus 1 close bracket times open bracket c minus 2 close bracket over 3 times z squared plus 3 times open bracket c minus 2 close bracket times z plus open bracket c minus 1 close bracket times open bracket c minus 2 close bracket plus 1 end fraction squared",
    );
  });
});

describe("where each point starts", () => {
  const start = (id: string) =>
    toPlainText(describeFractalMath(id, defaultVariant(id)).start);

  it("starts the Mandelbrot-style sets at zero with c the pixel's point", () => {
    for (const id of [
      "mandelbrot",
      "burning-ship",
      "tricorn",
      "multibrot",
      "celtic",
      "perpendicular-ship",
      "magnet",
    ]) {
      expect(start(id)).toBe("z sub 0 equals 0, c equals the pixel's point");
    }
  });

  it("starts Phoenix at the pixel's point with nothing before it", () => {
    expect(start("phoenix")).toBe(
      "z sub 0 equals the pixel's point, z sub minus 1 equals 0",
    );
  });

  it("starts Julia and Newton at the pixel's point", () => {
    expect(start("julia")).toBe("z sub 0 equals the pixel's point");
    expect(start("newton")).toBe("z sub 0 equals the pixel's point");
  });
});

describe("the setting", () => {
  it("is null for a fractal that takes none", () => {
    for (const id of [
      "mandelbrot",
      "burning-ship",
      "tricorn",
      "celtic",
      "perpendicular-ship",
    ]) {
      expect(describeFractalMath(id, "").setting).toBeNull();
    }
  });

  it("shows the Newton fractal's polynomial as the equation it solves", () => {
    const polynomial = (variant: string) =>
      toPlainText(describeFractalMath("newton", variant).setting!.value);

    expect(describeFractalMath("newton", "3").setting!.label).toBe(
      "Polynomial, the equation whose solutions it hunts for",
    );
    expect(polynomial("3")).toBe("z cubed minus 1 equals 0");
    expect(polynomial("4")).toBe("z to the power 4 minus 1 equals 0");
    expect(polynomial("5")).toBe("z to the power 5 minus 1 equals 0");
    expect(polynomial("cycle")).toBe(
      "z cubed minus 2 times z plus 2 equals 0",
    );
    // The fallback is the polynomial that is drawn, so the card and the canvas
    // cannot describe different pictures.
    expect(polynomial("garbage")).toBe(polynomial("3"));
  });

  it("shows each named Julia constant with its real value", () => {
    const expected: Record<string, string> = {
      Classic: "c equals minus 0.8 plus 0.156 i",
      Dendrite: "c equals i",
      "Douady rabbit": "c equals minus 0.123 plus 0.745 i",
      "Siegel disk": "c equals minus 0.391 minus 0.587 i",
    };

    for (const constant of JULIA_CONSTANTS) {
      const setting = describeFractalMath("julia", constant.name).setting;

      expect(setting).not.toBeNull();
      expect(toPlainText(setting!.value)).toBe(expected[constant.name]);
      expect(setting!.label).toContain(constant.name);
    }
  });

  it("shows a custom Julia constant by its point, unlabelled by any name", () => {
    const setting = describeFractalMath("julia", "custom:0.25,-0.5").setting;

    expect(toPlainText(setting!.value)).toBe("c equals 0.25 minus 0.5 i");
    expect(setting!.label).not.toContain('"');
  });

  it("shows the constant that is drawn when the name cannot be read", () => {
    const fallback = describeFractalMath("julia", "not a constant").setting;

    expect(toPlainText(fallback!.value)).toBe(
      "c equals minus 0.8 plus 0.156 i",
    );
  });

  it("shows the Multibrot's power as d", () => {
    for (const power of MULTIBROT_POWERS) {
      const setting = describeFractalMath("multibrot", String(power)).setting;

      expect(toPlainText(setting!.value)).toBe(`d equals ${power}`);
    }
  });

  it("shows the power that is drawn when the variant is not a power", () => {
    // A Julia constant's name can still be on the page when it switches to the
    // Multibrot for one render; the renderer draws power 3 and so does the card.
    const setting = describeFractalMath("multibrot", "Classic").setting;

    expect(toPlainText(setting!.value)).toBe("d equals 3");
  });

  it("shows each named Phoenix constant as c and p, with the real values", () => {
    const expected: Record<string, string> = {
      Classic: "c equals 0.5667, p equals minus 0.5",
      Spirals: "c equals 0.3, p equals 0.5",
      Hourglass: "c equals 0.5667, p equals minus 0.55",
    };

    for (const [name, reading] of Object.entries(expected)) {
      const setting = describeFractalMath("phoenix", name).setting;

      expect(setting).not.toBeNull();
      expect(toPlainText(setting!.value), name).toBe(reading);
      expect(setting!.label).toContain(name);
    }
  });

  it("shows the constant that is drawn when the variant is not a Phoenix constant", () => {
    // A Julia constant can still be on the page when it switches to Phoenix
    // for one render; the renderer draws Classic and so does the card.
    for (const variant of ["Dendrite", "4", ""]) {
      const setting = describeFractalMath("phoenix", variant).setting;

      expect(toPlainText(setting!.value), variant).toBe(
        "c equals 0.5667, p equals minus 0.5",
      );
    }
  });

  it("says in a sentence what the extra term does", () => {
    const { blurb, escape } = describeFractalMath("phoenix", "Classic");

    expect(blurb).toMatch(/number from the step before/);
    expect(escape).toMatch(/orbit plot/);
  });

  it("shows the Magnet's magnetic type", () => {
    for (const [type, label] of [
      ["1", "Type I"],
      ["2", "Type II"],
    ]) {
      const setting = describeFractalMath("magnet", type).setting;

      expect(toPlainText(setting!.value), type).toBe(label);
    }
  });

  it("shows the type that is drawn when the variant is not a magnetic type", () => {
    // A Multibrot power can still be on the page when it switches to the
    // Magnet for one render; the renderer draws Type I and so does the card.
    for (const variant of ["4", "Classic", ""]) {
      const setting = describeFractalMath("magnet", variant).setting;

      expect(toPlainText(setting!.value), variant).toBe("Type I");
    }
  });
});

describe("a complex number", () => {
  it("is written a + bi, with the sign of each part", () => {
    expect(formatComplex(-0.7453, 0.1127)).toBe("-0.7453 + 0.1127i");
    expect(formatComplex(0.5, -0.25)).toBe("0.5 - 0.25i");
    expect(formatComplex(-2, -1.5)).toBe("-2 - 1.5i");
  });

  it("drops a part that is zero, but never writes nothing", () => {
    expect(formatComplex(0.5, 0)).toBe("0.5");
    expect(formatComplex(0, 0.5)).toBe("0.5i");
    expect(formatComplex(0, -0.5)).toBe("-0.5i");
    expect(formatComplex(0, 0)).toBe("0");
    expect(formatComplex(-0, 0)).toBe("0");
  });

  it("writes an imaginary part of 1 as i", () => {
    expect(formatComplex(0, 1)).toBe("i");
    expect(formatComplex(0, -1)).toBe("-i");
    expect(formatComplex(2, 1)).toBe("2 + i");
  });

  it("rounds to six significant digits, as every other number the app prints", () => {
    expect(formatComplex(-0.123456789, 0.987654321)).toBe(
      "-0.123457 + 0.987654i",
    );
  });

  it("reads aloud the same number its text form prints", () => {
    expect(toPlainText(complexExpr(-0.7453, 0.1127))).toBe(
      "minus 0.7453 plus 0.1127 i",
    );
    expect(toPlainText(complexExpr(0, 0))).toBe("0");
  });
});

describe("toPlainText", () => {
  const z: MathExpr = { kind: "identifier", name: "z" };
  const num = (value: string): MathExpr => ({ kind: "number", value });

  it("says squared and cubed, and any other power in words", () => {
    const power = (n: string): MathExpr => ({
      kind: "superscript",
      base: z,
      exponent: num(n),
    });

    expect(toPlainText(power("2"))).toBe("z squared");
    expect(toPlainText(power("3"))).toBe("z cubed");
    expect(toPlainText(power("7"))).toBe("z to the power 7");
  });

  it("says a conjugate of a letter as bar, and of anything longer in words", () => {
    expect(toPlainText({ kind: "conjugate", of: z })).toBe("z bar");
    expect(
      toPlainText({
        kind: "conjugate",
        of: {
          kind: "row",
          items: [z, { kind: "operator", symbol: "+" }, num("1")],
        },
      }),
    ).toBe("the conjugate of z plus 1");
  });

  it("uses an identifier's spoken form when it has one", () => {
    expect(
      toPlainText({
        kind: "identifier",
        name: "Re",
        spoken: "the real part of",
      }),
    ).toBe("the real part of");
  });

  it("says a subscript, and passes unknown operators through", () => {
    expect(
      toPlainText({ kind: "subscript", base: z, subscript: num("0") }),
    ).toBe("z sub 0");
    expect(toPlainText({ kind: "operator", symbol: "%" })).toBe("%");
  });

  it("collapses the spaces it would leave before a comma", () => {
    const expr: MathExpr = {
      kind: "row",
      items: [z, { kind: "operator", symbol: "," }, z],
    };

    expect(toPlainText(expr)).toBe("z, z");
  });
});
