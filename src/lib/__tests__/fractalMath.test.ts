/**
 * The Math card's descriptors
 *
 * A descriptor is data, so what can go wrong is data: a fractal in the picker
 * with no maths, a blurb left empty, a paragraph that describes the Normal
 * colours while an orbit trap is drawing the picture, a formula whose spoken
 * reading says something other than what is drawn. The guard walks
 * `FRACTAL_TYPES` so a fractal added later cannot skip its descriptor, and each
 * descriptor's rule is read back through `toPlainText` and compared with the
 * words a listener should hear.
 */
import { describe, expect, it } from "vitest";

import {
  FRACTAL_MATH,
  TRAP_BLURB_SENTENCE,
  blurbFor,
  complexExpr,
  describeFractalMath,
  describeTrapColouring,
  describeTrapShape,
  formatComplex,
  toPlainText,
  type MathExpr,
} from "../fractalMath";
import {
  FRACTAL_TYPES,
  defaultVariant,
  fractalVariants,
} from "../fractalTypes";
import { JULIA_CONSTANTS } from "../julia";
import { MULTIBROT_POWERS } from "../multibrot";
import {
  TRAP_CIRCLE_CENTRE,
  TRAP_CIRCLE_RADIUS,
  TRAP_LINE_REAL,
  TRAP_POINT,
  TRAP_SHAPES,
} from "../orbitTrap";
import { formatCoordinate } from "../zoomScale";

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

/**
 * Every way the eleven descriptions say the colours come from the orbit's own
 * end — how fast it ran away, which root it reached, how many steps that took —
 * or name a black a trap picture has not got (a trap holds every pixel inside
 * `TRAP_POSITION_MIN`..`TRAP_POSITION_MAX` of the palette, so none is black; see
 * `orbitTrap.ts`). Each phrase is quoted from the description named beside it,
 * and the sentence carrying it is the one its descriptor marks `colouring`.
 */
const COUNT_ONLY_PHRASES: readonly string[] = [
  "how quickly it runs away sets its colour", // Mandelbrot
  "the black body", // Mandelbrot, Tricorn, Celtic, Phoenix, Multibrot
  "the black ship", // Burning Ship
  "dark hull", // Perpendicular Ship
  "coloured by how fast", // Burning Ship and the other escape-time kinds
  "colours each starting point", // Newton
  "shaded by how few steps", // Newton
  "caught in the loop black", // Newton, the cycle polynomial
  "the flat black of the picture", // Magnet
  "the colours draw", // Magnet
];

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
        expect(blurbFor(math.blurb, null).trim()).not.toBe("");
      });

      it("has a blurb of two or three sentences", () => {
        expect(math.blurb.length).toBeGreaterThanOrEqual(2);
        expect(math.blurb.length).toBeLessThanOrEqual(3);
        expect(sentences(blurbFor(math.blurb, null)).length).toBe(
          math.blurb.length,
        );
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
        const words = [
          math.title,
          blurbFor(math.blurb, null),
          ...TRAP_SHAPES.map((trap) => blurbFor(math.blurb, trap)),
          math.escape,
        ];
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
      "z becomes open bracket the fraction z squared plus c minus 1 over 2 times z plus c minus 2 end fraction close bracket squared",
    );
  });

  it("reads the Phoenix rule, with the point before the last in it", () => {
    for (const name of ["Classic", "Spirals", "Hourglass"]) {
      expect(rule("phoenix", name), name).toBe(
        "z sub n plus 1 equals z sub n squared plus c plus p times z sub n minus 1",
      );
    }
  });

  it("reads Nova's rule: Newton's step for z cubed minus 1 with c added", () => {
    expect(rule("nova")).toBe(
      "z becomes z minus the fraction z cubed minus 1 over 3 times z squared end fraction plus c",
    );
  });

  it("reads the second magnetic type's rule", () => {
    expect(rule("magnet", "2")).toBe(
      "z becomes open bracket the fraction z cubed plus 3 times open bracket c minus 1 close bracket times z plus open bracket c minus 1 close bracket times open bracket c minus 2 close bracket over 3 times z squared plus 3 times open bracket c minus 2 close bracket times z plus open bracket c minus 1 close bracket times open bracket c minus 2 close bracket plus 1 end fraction close bracket squared",
    );
  });
});

describe("no power is ambiguous about what it raises", () => {
  /** Whether a row is wrapped in one pair of brackets from its first item to its last. */
  function bracketed(expr: MathExpr): boolean {
    if (expr.kind !== "row" || expr.items.length < 3) return false;
    const first = expr.items[0];
    const last = expr.items[expr.items.length - 1];

    return (
      first.kind === "operator" &&
      first.symbol === "(" &&
      last.kind === "operator" &&
      last.symbol === ")"
    );
  }

  // Every fractal with every variant it offers.
  const cases: [string, string][] = FRACTAL_TYPES.flatMap((type) => {
    const variants = fractalVariants(type.id)?.options.map(
      (option) => option.value,
    ) ?? [""];

    return variants.map((variant): [string, string] => [type.id, variant]);
  });

  it.each(cases)(
    "%s %s: a fraction or a sum is bracketed before it is raised",
    (id, variant) => {
      const math = describeFractalMath(id, variant);
      const exprs = [
        math.rule,
        math.start,
        ...(math.setting ? [math.setting.value] : []),
      ];

      for (const expr of exprs) {
        for (const node of nodes(expr)) {
          if (node.kind !== "superscript" && node.kind !== "subscript")
            continue;
          const base = node.base;

          expect(base.kind, `${id}: a fraction is a base`).not.toBe("fraction");
          // A row of several terms must carry its own brackets.
          if (base.kind === "row" && base.items.length > 1)
            expect(bracketed(base), `${id}: an unbracketed row is a base`).toBe(
              true,
            );
        }
      }
    },
  );

  it("brackets the whole Magnet fraction and squares outside the bracket", () => {
    for (const type of ["1", "2"]) {
      const rule = describeFractalMath("magnet", type).rule;

      if (rule.kind !== "row") throw new Error("the rule is a row");
      expect(rule.items).toHaveLength(3);
      const squared = rule.items[2];

      if (squared.kind !== "superscript")
        throw new Error("the step is a power");
      expect(bracketed(squared.base)).toBe(true);
      if (squared.base.kind !== "row") throw new Error("bracketed is a row");
      expect(squared.base.items).toHaveLength(3);
      expect(squared.base.items[1].kind).toBe("fraction");
      expect(squared.exponent).toEqual({ kind: "number", value: "2" });
    }
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

  it("starts Nova at 1, a root of z cubed minus 1, with c the pixel's point", () => {
    expect(start("nova")).toBe("z sub 0 equals 1, c equals the pixel's point");
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
      "nova",
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
    expect(polynomial("cycle")).toBe("z cubed minus 2 times z plus 2 equals 0");
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

    expect(blurbFor(blurb, null)).toMatch(/number from the step before/);
    expect(escape).toMatch(/orbit plot/);
  });

  it("says in plain words how Nova is judged and what its orbit plot shows", () => {
    const { title, blurb, escape } = describeFractalMath("nova", "");

    expect(title).toBe("Nova fractal");
    expect(blurbFor(blurb, null)).toMatch(/Newton's method for z cubed = 1/);
    expect(escape).toMatch(/less than 0\.000001/);
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

describe("what the card says with an orbit trap on", () => {
  const ids = FRACTAL_TYPES.map((type) => type.id);

  it("says which shape the trap is and where, from orbitTrap's own numbers", () => {
    expect(describeTrapShape("point")).toBe(
      `a point at ${formatComplex(TRAP_POINT.real, TRAP_POINT.imaginary)}`,
    );
    expect(describeTrapShape("line")).toContain("imaginary axis");
    expect(describeTrapShape("line")).toContain(
      formatCoordinate(TRAP_LINE_REAL),
    );
    expect(describeTrapShape("circle")).toBe(
      `the circle of radius ${formatCoordinate(TRAP_CIRCLE_RADIUS)} about the origin`,
    );
    expect(
      TRAP_CIRCLE_CENTRE.real === 0 && TRAP_CIRCLE_CENTRE.imaginary === 0,
    ).toBe(true);
  });

  it.each(TRAP_SHAPES)(
    "describes the %s trap in the same words for every fractal",
    (trap) => {
      for (const id of ids) {
        const text = describeTrapColouring(id, trap);

        expect(text, id).toContain("An orbit trap is a fixed shape");
        expect(text, id).toContain(describeTrapShape(trap));
        expect(text, id).toContain("Each point's orbit is the path it follows");
        expect(text, id).toContain(
          "the closest is one end of the palette and the farthest the other",
        );
        expect(text, id).toContain(
          "Shift, Reverse and the colour scheme still choose the colours",
        );
        expect(text, id).toContain(
          "The orbit plot draws the path the point took and not the trap",
        );
        // The trap colours by a distance, so the count's sentence would be
        // false here and must not have been kept.
        expect(text, id).not.toContain("step on which");
      }
    },
  );

  it("says what the trap shows instead, in the fractal's own terms", () => {
    for (const id of ids) {
      const text = describeTrapColouring(id, "point");

      // A kind whose orbits settle never "escapes", so it names its own
      // colouring; every escape-time kind, Phoenix included, keeps the
      // escape wording because escaping is what its colour was made of.
      if (["newton", "nova", "magnet"].includes(id)) {
        expect(text, id).not.toContain("how quickly the orbit escapes");
      } else {
        expect(text, id).toContain(
          "rather than how quickly the orbit escapes",
        );
      }
    }

    expect(describeTrapColouring("newton", "point")).toContain(
      "rather than which root the orbit settles on, and how quickly",
    );
    expect(describeTrapColouring("nova", "point")).toContain(
      "rather than how many steps the orbit took to settle or to run away",
    );
    expect(describeTrapColouring("magnet", "point")).toContain(
      "rather than whether the orbit settles on the fixed point or runs off to infinity",
    );
    expect(describeTrapColouring("phoenix", "circle")).toContain(
      "rather than how quickly the orbit escapes",
    );
  });

  it("gives an id this build does not know the escape wording", () => {
    for (const id of ["lyapunov", "constructor", ""]) {
      expect(describeTrapColouring(id, "line"), id).toContain(
        "how quickly the orbit escapes",
      );
    }
  });

  it("changes with the trap and with the fractal", () => {
    const texts = TRAP_SHAPES.map((trap) =>
      describeTrapColouring("mandelbrot", trap),
    );

    expect(new Set(texts).size).toBe(3);
    expect(describeTrapColouring("mandelbrot", "point")).not.toBe(
      describeTrapColouring("newton", "point"),
    );
  });

  it("carries no markup", () => {
    for (const id of ids) {
      for (const trap of TRAP_SHAPES) {
        expect(describeTrapColouring(id, trap), id).not.toMatch(/[<>]|&\w+;/);
      }
    }
  });
});

describe("the paragraph under the rows", () => {
  const ids = FRACTAL_TYPES.map((type) => type.id);

  /** Every value the picker can put on the page for a fractal. */
  function drawnVariants(id: string): string[] {
    return fractalVariants(id)?.options.map((option) => option.value) ?? [""];
  }

  const blurbOf = (id: string, variant = defaultVariant(id)) =>
    describeFractalMath(id, variant).blurb;

  it("reads exactly as it read before a Look could change it", () => {
    // The eleven default paragraphs, word for word as they stood before this
    // bead. Nothing here may drift: a trap changes the paragraph by leaving
    // sentences out, never by rewording one.
    const expected: Record<string, string> = {
      mandelbrot:
        "Pick a point on the plane and call it c. Start at zero and keep squaring the number and adding c. If the numbers stay small forever the point is in the set, the black body of the picture; if they run away, it is outside, and how quickly it runs away sets its colour.",
      julia:
        "Every point of the picture is a starting value, and the same fixed number c is added at every step. Points whose numbers stay small forever form the Julia set, and the rest run away, coloured by how fast. Each choice of c gives a different picture, and the Mandelbrot set is the map of which choices give a connected one.",
      "burning-ship":
        "The same game as the Mandelbrot set, with one twist: before squaring, each step flips both parts of the number to be positive. That fold breaks the set's mirror symmetry and gives it a jagged, ship-like outline. Numbers that stay small are the black ship; the rest are coloured by how fast they run away.",
      tricorn:
        "The same game as the Mandelbrot set, with one twist: before squaring, each number is flipped to its mirror image across the real axis, its conjugate. That turns the one-lobed set into a three-armed one that a turn of 120 degrees maps onto itself. Numbers that stay small are the black body; the rest are coloured by how fast they run away.",
      "perpendicular-ship":
        "The same game as the Mandelbrot set, with one twist: the two halves of the number are not treated alike. The real part squares as it is, while the imaginary part is taken against the size of the real part, so the sign of the real part is thrown away in one half of the step and kept in the other. That fold leaves a flat-backed dark hull with rows of masts along its edge, and the rest is coloured by how fast a point runs away.",
      celtic:
        "The same game as the Mandelbrot set, with one twist: after squaring, the real part of the result is flipped to be positive. That fold gives the set a flat left edge and lacy, knotted loops. Numbers that stay small are the black body; the rest are coloured by how fast they run away.",
      multibrot:
        "The same game as the Mandelbrot set, but each step raises the number to a higher power d instead of squaring it. A higher power gives the set more lobes, d - 1 of them, so d = 3 has two, d = 4 has three and d = 5 has four. Numbers that stay small are the black body; the rest are coloured by how fast they run away.",
      newton:
        "Newton's method hunts for a solution of z cubed = 1 by improving a guess again and again. The equation has three solutions, the cube roots of 1, and every pixel is a first guess. The picture colours each starting point by the solution it ends up at, shaded by how few steps that took; the borders between the three colours are endlessly tangled.",
      magnet:
        "Each step forms a fraction out of z and c, squares it, and starts again from there. Almost every c has an orbit that settles on the fixed point z = 1, and that settled set is the flat black of the picture; the colours draw the small island of c whose orbit runs off to infinity instead. The two magnetic types are the same question asked of two different fractions.",
      phoenix:
        "This is a Julia set with a memory: every step squares the number and adds c, and also adds p times the number from the step before. That extra term feeds the past back into each new point, which feathers the picture into flame-like shapes that a plain Julia set never makes. Points whose numbers stay small are the black body and the rest are coloured by how fast they run away.",
      nova: "Nova is Newton's method for z cubed = 1 with a constant added after every step. Pick a point on the plane and call it c, start at 1 and keep improving the guess and adding c. Instead of three tidy basins the picture is a Mandelbrot-like set with spirals and bulbs in it, where the Newton basins are folded into the shapes.",
    };

    expect(Object.keys(expected).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(blurbFor(blurbOf(id), null), id).toBe(expected[id]);
    }
  });

  it("keeps the sentences about the set and says where the colours come from instead", () => {
    for (const id of ids) {
      const blurb = blurbOf(id);
      const dropped = blurb.filter((sentence) => sentence.colouring === true);

      for (const trap of TRAP_SHAPES) {
        const text = blurbFor(blurb, trap);
        const kept = sentences(text);

        // The set's own sentences survive, so the paragraph never becomes a
        // stub; the trap's pointer goes last, where the reader meets it after
        // the maths.
        expect(kept.length, id).toBe(blurb.length - dropped.length + 1);
        expect(text, id).toContain(blurb[0].text);
        expect(text.endsWith(TRAP_BLURB_SENTENCE), id).toBe(true);
        for (const sentence of dropped) {
          expect(text, `${id}: ${sentence.text}`).not.toContain(sentence.text);
        }
      }
    }
  });

  it("says nothing only a count picture could show, for every setting and trap", () => {
    for (const id of ids) {
      for (const variant of drawnVariants(id)) {
        const blurb = blurbOf(id, variant);

        for (const trap of TRAP_SHAPES) {
          const text = blurbFor(blurb, trap);

          for (const phrase of COUNT_ONLY_PHRASES) {
            expect(text, `${id} ${variant} / ${trap}`).not.toContain(phrase);
          }
        }
      }
    }
  });

  it("names the Look only when one is on", () => {
    for (const id of ids) {
      const blurb = blurbOf(id);

      expect(blurbFor(blurb, null), id).not.toContain(TRAP_BLURB_SENTENCE);
      expect(blurbFor(blurb, null), id).not.toBe(blurbFor(blurb, "point"));
      expect(blurbFor(blurb, "point"), id).toContain("Each point");
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
