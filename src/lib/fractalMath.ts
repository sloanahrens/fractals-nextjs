/**
 * The mathematics of each fractal, as data: the rule it iterates, where each
 * point starts, the one setting it takes, and a few plain sentences.
 *
 * Every fractal here is one small formula plus a handful of numbers, so the
 * Math card (`src/components/ui/MathCard.tsx`) is drawn from a descriptor per
 * fractal and from the same state the renderer uses. A formula is a typed tree
 * ({@link MathExpr}), never a string of markup: `MathView` turns it into MathML
 * and {@link toPlainText} reads it aloud, so the picture of the formula and its
 * spoken reading come from one place and cannot disagree.
 *
 * Adding a fractal to `FRACTAL_TYPES` means adding its descriptor here;
 * `fractalMath.test.ts` fails a fractal that has none or an empty blurb.
 */

import { formatCoordinate } from "./zoomScale";
import { JULIA_CONSTANTS, parseJuliaConstant } from "./julia";
import { MULTIBROT_POWERS, parseMultibrotPower } from "./multibrot";
import { MAGNET_BAILOUT, MAGNET_TOLERANCE, MAGNET_TYPES, MAGNET_TYPE_LABELS, parseMagnetType } from "./magnet";
import { newtonPolynomialFor } from "./newton";
import { PHOENIX_CONSTANTS } from "./phoenix";

/**
 * A formula, as a small tree. Nine kinds of node, enough for every rule here:
 * the leaves are numbers, identifiers (`z`, `c`, `Re`) and operators (`+`, `→`,
 * brackets); the rest build a bigger expression out of smaller ones. `text` is
 * for the few words a formula carries ("the pixel's point").
 */
export type MathExpr =
  | { kind: "number"; value: string }
  | {
      kind: "identifier";
      name: string;
      /** How a listener hears it when the name alone would not do ("Re"). */
      spoken?: string;
    }
  | { kind: "operator"; symbol: string }
  | { kind: "text"; value: string }
  | { kind: "superscript"; base: MathExpr; exponent: MathExpr }
  | { kind: "subscript"; base: MathExpr; subscript: MathExpr }
  | { kind: "fraction"; numerator: MathExpr; denominator: MathExpr }
  | { kind: "row"; items: MathExpr[] }
  | { kind: "conjugate"; of: MathExpr }
  | { kind: "abs"; of: MathExpr };

/** What the Math card shows about one fractal. */
export interface FractalMath {
  /** The fractal's name as the card's heading says it ("Mandelbrot set"). */
  title: string;
  /** The step repeated for every point, "z → z² + c". */
  rule: MathExpr;
  /** Where each point's orbit begins, and what c is when the rule has one. */
  start: MathExpr;
  /**
   * The fractal's one setting with its real value, or null for a fractal that
   * takes none. `label` says what the setting means, in a phrase.
   */
  setting: { label: string; value: MathExpr } | null;
  /** Two or three plain sentences, the idea before any jargon. */
  blurb: string;
  /** How a point is judged and coloured, in the fractal's own words. */
  escape: string;
}

const number = (value: string | number): MathExpr => ({
  kind: "number",
  value: String(value),
});
const identifier = (name: string, spoken?: string): MathExpr =>
  spoken === undefined
    ? { kind: "identifier", name }
    : { kind: "identifier", name, spoken };
const operator = (symbol: string): MathExpr => ({ kind: "operator", symbol });
const text = (value: string): MathExpr => ({ kind: "text", value });
const superscript = (base: MathExpr, exponent: MathExpr): MathExpr => ({
  kind: "superscript",
  base,
  exponent,
});
const subscript = (base: MathExpr, sub: MathExpr): MathExpr => ({
  kind: "subscript",
  base,
  subscript: sub,
});
const fraction = (numerator: MathExpr, denominator: MathExpr): MathExpr => ({
  kind: "fraction",
  numerator,
  denominator,
});
const row = (...items: MathExpr[]): MathExpr => ({ kind: "row", items });
const conjugate = (of: MathExpr): MathExpr => ({ kind: "conjugate", of });
const abs = (of: MathExpr): MathExpr => ({ kind: "abs", of });

/** Minus sign for the typeset formulas; plain text uses the ASCII hyphen. */
const MINUS = "−";
/** MathML's invisible times: how `3 z²` is written without a visible sign. */
const INVISIBLE_TIMES = "⁢";

const z = identifier("z");
const c = identifier("c");
const PLUS = operator("+");
const EQUALS = operator("=");
const ARROW = operator("→");
const OPEN = operator("(");
const CLOSE = operator(")");

/** One term of a complex number: its sign, its size as text, and whether it is the i part. */
interface ComplexTerm {
  negative: boolean;
  magnitude: string;
  imaginary: boolean;
}

/**
 * The terms of a + bi as the card writes them: the real part unless it is zero
 * beside a nonzero imaginary part, then the imaginary part unless it is zero.
 * An imaginary part of exactly 1 is written `i`, not `1i`. Numbers go through
 * {@link formatCoordinate}, six significant digits, as every other number the
 * app prints for the user does.
 */
function complexTerms(real: number, imaginary: number): ComplexTerm[] {
  const terms: ComplexTerm[] = [];

  if (real !== 0 || imaginary === 0) {
    terms.push({
      negative: real < 0,
      magnitude: formatCoordinate(Math.abs(real)),
      imaginary: false,
    });
  }
  if (imaginary !== 0) {
    const magnitude = formatCoordinate(Math.abs(imaginary));
    terms.push({
      negative: imaginary < 0,
      magnitude: magnitude === "1" ? "" : magnitude,
      imaginary: true,
    });
  }

  return terms;
}

/**
 * A complex number a + bi as a formula.
 * @param real - The real part
 * @param imaginary - The imaginary part
 * @returns A row such as `−0.8 + 0.156 i`
 */
export function complexExpr(real: number, imaginary: number): MathExpr {
  const items: MathExpr[] = [];

  complexTerms(real, imaginary).forEach((term, index) => {
    if (index > 0) items.push(term.negative ? operator(MINUS) : PLUS);
    else if (term.negative) items.push(operator(MINUS));

    if (term.magnitude !== "") items.push(number(term.magnitude));
    if (term.imaginary) items.push(identifier("i"));
  });

  return row(...items);
}

/**
 * A complex number a + bi as short text, "-0.7453 + 0.1127i", the way the
 * Math card prints a centre.
 * @param real - The real part
 * @param imaginary - The imaginary part
 * @returns The text, with an ASCII hyphen for a minus so it can be copied
 */
export function formatComplex(real: number, imaginary: number): string {
  return complexTerms(real, imaginary)
    .map((term, index) => {
      const sign =
        index === 0
          ? term.negative
            ? "-"
            : ""
          : term.negative
            ? " - "
            : " + ";

      return `${sign}${term.magnitude}${term.imaginary ? "i" : ""}`;
    })
    .join("");
}

const SPOKEN_OPERATORS: Readonly<Record<string, string>> = {
  "+": "plus",
  [MINUS]: "minus",
  "-": "minus",
  "=": "equals",
  "→": "becomes",
  "(": "open bracket",
  ")": "close bracket",
  [INVISIBLE_TIMES]: "times",
  "·": "times",
  ",": ",",
};

const SPOKEN_POWERS: Readonly<Record<string, string>> = {
  "2": "squared",
  "3": "cubed",
};

/**
 * A formula read as plain words, for the `aria-label` on its typeset form:
 * `z → z² + c` is "z becomes z squared plus c". A pure walk of the same tree
 * the MathML is drawn from.
 * @param expr - The formula
 * @returns The reading, single-spaced
 */
export function toPlainText(expr: MathExpr): string {
  return speak(expr).replace(/\s+/g, " ").replace(/ ,/g, ",").trim();
}

function speak(expr: MathExpr): string {
  switch (expr.kind) {
    case "number":
    case "text":
      return expr.value;
    case "identifier":
      return expr.spoken ?? expr.name;
    case "operator":
      return SPOKEN_OPERATORS[expr.symbol] ?? expr.symbol;
    case "row":
      return expr.items.map(speak).join(" ");
    case "superscript": {
      const power =
        expr.exponent.kind === "number"
          ? SPOKEN_POWERS[expr.exponent.value]
          : undefined;

      return `${speak(expr.base)} ${power ?? `to the power ${speak(expr.exponent)}`}`;
    }
    case "subscript":
      return `${speak(expr.base)} sub ${speak(expr.subscript)}`;
    case "fraction":
      return `the fraction ${speak(expr.numerator)} over ${speak(expr.denominator)} end fraction`;
    case "conjugate":
      return expr.of.kind === "identifier"
        ? `${speak(expr.of)} bar`
        : `the conjugate of ${speak(expr.of)}`;
    case "abs":
      return `the absolute value of ${speak(expr.of)},`;
  }
}

const PIXELS_POINT = text("the pixel's point");

/** z₀ = 0, c = the pixel's point: the escape-time sets that start at the origin. */
const START_AT_ZERO = row(
  subscript(z, number(0)),
  EQUALS,
  number(0),
  operator(","),
  c,
  EQUALS,
  PIXELS_POINT,
);

/** z₀ = the pixel's point: Julia and Newton start where the pixel is. */
const START_AT_PIXEL = row(subscript(z, number(0)), EQUALS, PIXELS_POINT);

const ESCAPE_RADIUS_2 =
  "A point escapes when |z| passes 2. The colour is the step on which that happens; a point that never escapes within the iteration cap is painted black.";

/** The rule z → X + c, X being the part that varies between the Mandelbrot-like sets. */
const rule = (square: MathExpr): MathExpr => row(z, ARROW, square, PLUS, c);

const MANDELBROT: FractalMath = {
  title: "Mandelbrot set",
  rule: rule(superscript(z, number(2))),
  start: START_AT_ZERO,
  setting: null,
  blurb:
    "Pick a point on the plane and call it c. Start at zero and keep squaring the number and adding c. If the numbers stay small forever the point is in the set, the black body of the picture; if they run away, it is outside, and how quickly it runs away sets its colour.",
  escape: ESCAPE_RADIUS_2,
};

const BURNING_SHIP: FractalMath = {
  title: "Burning Ship",
  rule: rule(
    superscript(
      row(
        OPEN,
        abs(row(identifier("Re", "the real part of"), z)),
        PLUS,
        identifier("i"),
        operator(INVISIBLE_TIMES),
        abs(row(identifier("Im", "the imaginary part of"), z)),
        CLOSE,
      ),
      number(2),
    ),
  ),
  start: START_AT_ZERO,
  setting: null,
  blurb:
    "The same game as the Mandelbrot set, with one twist: before squaring, each step flips both parts of the number to be positive. That fold breaks the set's mirror symmetry and gives it a jagged, ship-like outline. Numbers that stay small are the black ship; the rest are coloured by how fast they run away.",
  escape: ESCAPE_RADIUS_2,
};

const TRICORN: FractalMath = {
  title: "Tricorn",
  rule: rule(superscript(conjugate(z), number(2))),
  start: START_AT_ZERO,
  setting: null,
  blurb:
    "The same game as the Mandelbrot set, with one twist: before squaring, each number is flipped to its mirror image across the real axis, its conjugate. That turns the one-lobed set into a three-armed one that a turn of 120 degrees maps onto itself. Numbers that stay small are the black body; the rest are coloured by how fast they run away.",
  escape: ESCAPE_RADIUS_2,
};

const PERPENDICULAR_SHIP: FractalMath = {
  title: "Perpendicular Ship",
  rule: rule(
    superscript(
      row(
        OPEN,
        abs(row(identifier("Re", "the real part of"), z)),
        operator(MINUS),
        identifier("i"),
        operator(INVISIBLE_TIMES),
        identifier("Im", "the imaginary part of"),
        z,
        CLOSE,
      ),
      number(2),
    ),
  ),
  start: START_AT_ZERO,
  setting: null,
  blurb:
    "The same game as the Mandelbrot set, with one twist: the two halves of the number are not treated alike. The real part squares as it is, while the imaginary part is taken against the size of the real part, so the sign of the real part is thrown away in one half of the step and kept in the other. That fold leaves a flat-backed dark hull with rows of masts along its edge, and the rest is coloured by how fast a point runs away.",
  escape: `${ESCAPE_RADIUS_2} In the orbit plot the fold shows as a path that does not care which side of the imaginary axis it is on: a step squares the real part and takes the imaginary part against the size of the real part, so a point and its reflection in that axis go to the very same next point.`,
};

/** z squared in brackets, the thing Celtic's Re and Im are read off. */
const SQUARE_OF_Z = row(OPEN, superscript(z, number(2)), CLOSE);

const CELTIC: FractalMath = {
  title: "Celtic Mandelbrot set",
  rule: rule(
    row(
      OPEN,
      abs(row(identifier("Re", "the real part of"), SQUARE_OF_Z)),
      PLUS,
      identifier("i"),
      operator(INVISIBLE_TIMES),
      identifier("Im", "the imaginary part of"),
      SQUARE_OF_Z,
      CLOSE,
    ),
  ),
  start: START_AT_ZERO,
  setting: null,
  blurb:
    "The same game as the Mandelbrot set, with one twist: after squaring, the real part of the result is flipped to be positive. That fold gives the set a flat left edge and lacy, knotted loops. Numbers that stay small are the black body; the rest are coloured by how fast they run away.",
  escape: `${ESCAPE_RADIUS_2} In the orbit plot the fold shows as a path that never lands left of c: each step's real part is at least c's, so only c itself pulls the path to the left.`,
};

/**
 * The polynomial p(z) Newton's method is hunting the roots of, per variant, as
 * the rule's numerator and as the setting's value.
 */
const NEWTON_POLYNOMIALS: Readonly<Record<string, MathExpr>> = {
  "3": row(superscript(z, number(3)), operator(MINUS), number(1)),
  "4": row(superscript(z, number(4)), operator(MINUS), number(1)),
  "5": row(superscript(z, number(5)), operator(MINUS), number(1)),
  cycle: row(
    superscript(z, number(3)),
    operator(MINUS),
    number(2),
    operator(INVISIBLE_TIMES),
    z,
    PLUS,
    number(2),
  ),
};

/** p'(z), the derivative the step divides by, per variant. */
const NEWTON_DERIVATIVES: Readonly<Record<string, MathExpr>> = {
  "3": row(number(3), operator(INVISIBLE_TIMES), superscript(z, number(2))),
  "4": row(number(4), operator(INVISIBLE_TIMES), superscript(z, number(3))),
  "5": row(number(5), operator(INVISIBLE_TIMES), superscript(z, number(4))),
  cycle: row(
    number(3),
    operator(INVISIBLE_TIMES),
    superscript(z, number(2)),
    operator(MINUS),
    number(2),
  ),
};

/** The plain sentences the card says about each polynomial. */
const NEWTON_BLURBS: Readonly<Record<string, string>> = {
  "3": "Newton's method hunts for a solution of z cubed = 1 by improving a guess again and again. The equation has three solutions, the cube roots of 1, and every pixel is a first guess. The picture colours each starting point by the solution it ends up at, shaded by how few steps that took; the borders between the three colours are endlessly tangled.",
  "4": "Newton's method hunts for a solution of z to the fourth = 1 by improving a guess again and again. The equation has four solutions, the fourth roots of 1, and every pixel is a first guess. The picture colours each starting point by the solution it ends up at, shaded by how few steps that took, so four colour families meet along the same endlessly tangled borders.",
  "5": "Newton's method hunts for a solution of z to the fifth = 1 by improving a guess again and again. The equation has five solutions, the fifth roots of 1, and every pixel is a first guess. The picture colours each starting point by the solution it ends up at, shaded by how few steps that took, and five colour families meet along the borders between them.",
  cycle:
    "Newton's method hunts for a solution of z cubed minus 2z plus 2 by improving a guess again and again. The equation has three solutions, but beside the origin the method is caught in a loop instead: nought is sent to 1 and 1 straight back to nought, so those points never settle. The picture colours each starting point by the solution it ends up at, shaded by how few steps that took, and paints the ones caught in the loop black.",
};

/** How the card says a point is judged, per polynomial. */
const NEWTON_ESCAPES: Readonly<Record<string, string>> = {
  "3": "A point is done when z cubed is within 0.000001 of 1, which means it has settled on one of the three roots. The colour family is the root it reached and the shade is how many steps that took; a point that has not settled within the iteration cap is painted black.",
  "4": "A point is done when z to the fourth is within 0.000001 of 1, which means it has settled on one of the four roots. The colour family is the root it reached and the shade is how many steps that took; a point that has not settled within the iteration cap is painted black.",
  "5": "A point is done when z to the fifth is within 0.000001 of 1, which means it has settled on one of the five roots. The colour family is the root it reached and the shade is how many steps that took; a point that has not settled within the iteration cap is painted black.",
  cycle:
    "A point is done when z cubed minus 2z plus 2 is within 0.000001 of nought, which means it has settled on one of the three roots. The colour family is the root it reached and the shade is how many steps that took; a point caught in the loop beside the origin, or not settled within the iteration cap, is painted black and the orbit plot draws it circling rather than arriving.",
};

/**
 * The Newton fractal's maths: the method's own rule with the polynomial's
 * p(z) and p'(z) in it, and the equation the setting names.
 *
 * The polynomial is the fractal's variant, so the rule, the equation and the
 * sentences all move with it. A value this build cannot read is drawn as z^3 - 1
 * and shown as it (`newtonPolynomialFor`'s own fallback), so the card cannot
 * describe a picture the renderer is not drawing.
 */
function newton(variant: string): FractalMath {
  const polynomial = newtonPolynomialFor(variant).id;

  return {
    title: "Newton fractal",
    rule: row(
      z,
      ARROW,
      z,
      operator(MINUS),
      fraction(NEWTON_POLYNOMIALS[polynomial], NEWTON_DERIVATIVES[polynomial]),
    ),
    start: START_AT_PIXEL,
    setting: {
      label: "Polynomial, the equation whose solutions it hunts for",
      value: row(NEWTON_POLYNOMIALS[polynomial], EQUALS, number(0)),
    },
    blurb: NEWTON_BLURBS[polynomial],
    escape: NEWTON_ESCAPES[polynomial],
  };
}

/** (c − 1) and (c − 2), the two brackets the second magnetic type is built from. */
const C_MINUS_1 = row(OPEN, c, operator(MINUS), number(1), CLOSE);
const C_MINUS_2 = row(OPEN, c, operator(MINUS), number(2), CLOSE);

/**
 * The fraction the first magnetic type squares: (z² + c − 1) / (2z + c − 2).
 *
 * The Top and bottom are both 1 at z = 1 whatever c is, which is why 1 is a
 * fixed point of the map for every c -- the fact the set is built on.
 */
const MAGNET_ONE_FRACTION = fraction(
  row(superscript(z, number(2)), PLUS, c, operator(MINUS), number(1)),
  row(
    number(2),
    operator(INVISIBLE_TIMES),
    z,
    PLUS,
    c,
    operator(MINUS),
    number(2),
  ),
);

/**
 * The fraction the second magnetic type squares: the top and bottom are the
 * pair that agree at z = 1 as well, which is again what makes 1 a fixed point.
 */
const MAGNET_TWO_FRACTION = fraction(
  row(
    superscript(z, number(3)),
    PLUS,
    number(3),
    operator(INVISIBLE_TIMES),
    C_MINUS_1,
    operator(INVISIBLE_TIMES),
    z,
    PLUS,
    C_MINUS_1,
    operator(INVISIBLE_TIMES),
    C_MINUS_2,
  ),
  row(
    number(3),
    operator(INVISIBLE_TIMES),
    superscript(z, number(2)),
    PLUS,
    number(3),
    operator(INVISIBLE_TIMES),
    C_MINUS_2,
    operator(INVISIBLE_TIMES),
    z,
    PLUS,
    C_MINUS_1,
    operator(INVISIBLE_TIMES),
    C_MINUS_2,
    PLUS,
    number(1),
  ),
);

/** The rule of each magnetic type: its own fraction, squared, then c's point added. */
const MAGNET_RULES: Readonly<Record<number, MathExpr>> = {
  1: row(z, ARROW, superscript(MAGNET_ONE_FRACTION, number(2))),
  2: row(z, ARROW, superscript(MAGNET_TWO_FRACTION, number(2))),
};

/**
 * The Magnet set's maths: one rule per magnetic type, and the setting says
 * which.
 *
 * The two types are the two fractions of the magnetic model, and the picture
 * is the same question asked of either: which c have an orbit that comes to
 * rest on 1. Most of the plane does, so the coloured region of the picture is
 * the island of c that does not.
 */
function magnet(variant: string): FractalMath {
  const type = parseMagnetType(variant) ?? MAGNET_TYPES[0];

  return {
    title: "Magnet set",
    rule: MAGNET_RULES[type],
    start: START_AT_ZERO,
    setting: {
      label: "Magnetic type, which of the model's two maps is drawn",
      value: text(MAGNET_TYPE_LABELS[type]),
    },
    blurb:
      "Each step forms a fraction out of z and c, squares it, and starts again from there. Almost every c has an orbit that settles on the fixed point z = 1, and that settled set is the flat black of the picture; the colours draw the small island of c whose orbit runs off to infinity instead. The two magnetic types are the same question asked of two different fractions.",
    escape: `A point is inside when its orbit comes within ${MAGNET_TOLERANCE} of 1, the number the map settles on, and it is painted black like the inside of any other set. A point is outside when |z| passes ${MAGNET_BAILOUT}, which these maps only reach on their way out; the colour is the step on which that happens.`,
  };
}

/** The step's own index, n, and the two it is written against. */
const N = identifier("n");
const Z_NEXT = subscript(z, row(N, PLUS, number(1)));
const Z_NOW = subscript(z, N);
const Z_BEFORE = subscript(z, row(N, operator(MINUS), number(1)));
const P = identifier("p");

/** The Phoenix step: the Julia step with the point before the last, scaled by p, added in. */
const PHOENIX_RULE = row(
  Z_NEXT,
  EQUALS,
  superscript(Z_NOW, number(2)),
  PLUS,
  c,
  PLUS,
  P,
  operator(INVISIBLE_TIMES),
  Z_BEFORE,
);

/**
 * The Phoenix set's maths: the rule with its memory term, and the setting says
 * which pair of c and p is drawn.
 *
 * The constant is carried as one point with c in its real part and p in its
 * imaginary part, so the card writes the two numbers apart, as `c = …, p = …`.
 * A name this build cannot read is drawn as the first constant and shown as
 * it, as Julia's is, so the card cannot describe a picture the renderer is not
 * drawing.
 */
function phoenix(variant: string): FractalMath {
  const named =
    PHOENIX_CONSTANTS.find((entry) => entry.name === variant) ??
    PHOENIX_CONSTANTS[0];
  const { real, imaginary } = named.constant;

  return {
    title: "Phoenix set",
    rule: PHOENIX_RULE,
    start: row(
      subscript(z, number(0)),
      EQUALS,
      PIXELS_POINT,
      operator(","),
      subscript(z, row(operator(MINUS), number(1))),
      EQUALS,
      number(0),
    ),
    setting: {
      label: `Phoenix constant "${named.name}", c added at every step and p weighing the point before the last`,
      value: row(
        c,
        EQUALS,
        ...(real < 0 ? [operator(MINUS)] : []),
        number(formatCoordinate(Math.abs(real))),
        operator(","),
        P,
        EQUALS,
        ...(imaginary < 0 ? [operator(MINUS)] : []),
        number(formatCoordinate(Math.abs(imaginary))),
      ),
    },
    blurb:
      "This is a Julia set with a memory: every step squares the number and adds c, and also adds p times the number from the step before. That extra term feeds the past back into each new point, which feathers the picture into flame-like shapes that a plain Julia set never makes. Points whose numbers stay small are the black body and the rest are coloured by how fast they run away.",
    escape: `${ESCAPE_RADIUS_2} In the orbit plot the memory shows: the path starts at the pixel, and each new dot is pulled by the dot before the last, so the path spirals less smoothly than a Julia orbit does.`,
  };
}

function julia(variant: string): FractalMath {
  // The renderer falls back to the first named constant for a name it cannot
  // read, so the card says the constant that is actually drawn.
  const point = parseJuliaConstant(variant) ?? JULIA_CONSTANTS[0].constant;
  const named = JULIA_CONSTANTS.find((constant) => constant.name === variant);

  return {
    title: "Julia set",
    rule: rule(superscript(z, number(2))),
    start: START_AT_PIXEL,
    setting: {
      label: `${named ? `Julia constant "${named.name}"` : "Julia constant"}, added at every step`,
      value: row(c, EQUALS, complexExpr(point.real, point.imaginary)),
    },
    blurb:
      "Every point of the picture is a starting value, and the same fixed number c is added at every step. Points whose numbers stay small forever form the Julia set, and the rest run away, coloured by how fast. Each choice of c gives a different picture, and the Mandelbrot set is the map of which choices give a connected one.",
    escape: ESCAPE_RADIUS_2,
  };
}

function multibrot(variant: string): FractalMath {
  const power = parseMultibrotPower(variant) ?? MULTIBROT_POWERS[0];

  return {
    title: "Multibrot set",
    rule: rule(superscript(z, identifier("d"))),
    start: START_AT_ZERO,
    setting: {
      label: "Power, how many times z multiplies itself",
      value: row(identifier("d"), EQUALS, number(power)),
    },
    blurb:
      "The same game as the Mandelbrot set, but each step raises the number to a higher power d instead of squaring it. A higher power gives the set more lobes, d - 1 of them, so d = 3 has two, d = 4 has three and d = 5 has four. Numbers that stay small are the black body; the rest are coloured by how fast they run away.",
    escape: ESCAPE_RADIUS_2,
  };
}

/**
 * The descriptor of every fractal in `FRACTAL_TYPES`, keyed by its id. A
 * fractal that takes a setting is a function of its variant. The guard test
 * walks `FRACTAL_TYPES` against these keys, so a fractal added to the picker
 * without its maths fails the gate.
 */
export const FRACTAL_MATH: Readonly<
  Record<string, (variant: string) => FractalMath>
> = {
  mandelbrot: () => MANDELBROT,
  julia,
  "burning-ship": () => BURNING_SHIP,
  "perpendicular-ship": () => PERPENDICULAR_SHIP,
  tricorn: () => TRICORN,
  magnet,
  multibrot,
  newton,
  celtic: () => CELTIC,
  phoenix,
};

/**
 * The maths of the picture a fractal and its setting draw.
 *
 * An id this build does not know gets the Mandelbrot set's, as the picker's
 * own resolvers do, so the card says what the renderer draws.
 * @param fractalId - A `FRACTAL_TYPES` id
 * @param variant - The page's variant: the Julia constant's name or the Multibrot's power; ignored by the rest
 * @returns The descriptor for the card
 */
export function describeFractalMath(
  fractalId: string,
  variant: string,
): FractalMath {
  const describe = Object.prototype.hasOwnProperty.call(FRACTAL_MATH, fractalId)
    ? FRACTAL_MATH[fractalId]
    : FRACTAL_MATH.mandelbrot;

  return describe(variant);
}
