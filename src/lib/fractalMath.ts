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

import type { TrapShape } from "../types/fractal";
import { formatCoordinate } from "./zoomScale";
import {
  TRAP_CIRCLE_CENTRE,
  TRAP_CIRCLE_RADIUS,
  TRAP_LINE_REAL,
  TRAP_POINT,
} from "./orbitTrap";
import { JULIA_CONSTANTS, parseJuliaConstant } from "./julia";
import { MULTIBROT_POWERS, parseMultibrotPower } from "./multibrot";
import {
  MAGNET_BAILOUT,
  MAGNET_TOLERANCE,
  MAGNET_TYPES,
  MAGNET_TYPE_LABELS,
  parseMagnetType,
} from "./magnet";
import { newtonPolynomialFor } from "./newton";
import { PHOENIX_CONSTANTS } from "./phoenix";

/**
 * A formula, as a small tree. Enough kinds of node for every rule here:
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
  | { kind: "abs"; of: MathExpr }
  | { kind: "sqrt"; of: MathExpr };

/**
 * One sentence of a fractal's paragraph, and whether a look on the picture
 * leaves it true.
 *
 * A trap colours every pixel by how close its orbit comes to the shape, so the
 * count the orbit ended at, the root it reached, the settled black and the
 * colour families are not on screen while one is on: a sentence that names them
 * is false then. `colouring` marks those, and {@link blurbFor} leaves them out.
 */
export interface BlurbSentence {
  /** The sentence, as the card prints it. */
  text: string;
  /** True for a sentence about the colours Normal paints, and only Normal. */
  colouring?: boolean;
}

/** A fractal's paragraph: two or three sentences, the idea before any jargon. */
export type Blurb = readonly BlurbSentence[];

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
  /**
   * Two or three plain sentences, the idea before any jargon
   * ({@link blurbFor} prints them, and drops the ones a trap makes false).
   */
  blurb: Blurb;
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
const sqrt = (of: MathExpr): MathExpr => ({ kind: "sqrt", of });

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
    case "sqrt":
      return `the square root of ${speak(expr.of)}`;
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
  blurb: [
    { text: "Pick a point on the plane and call it c." },
    { text: "Start at zero and keep squaring the number and adding c." },
    {
      text: "If the numbers stay small forever the point is in the set, the black body of the picture; if they run away, it is outside, and how quickly it runs away sets its colour.",
      colouring: true,
    },
  ],
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
  blurb: [
    {
      text: "The same game as the Mandelbrot set, with one twist: before squaring, each step flips both parts of the number to be positive.",
    },
    {
      text: "That fold breaks the set's mirror symmetry and gives it a jagged, ship-like outline.",
    },
    {
      text: "Numbers that stay small are the black ship; the rest are coloured by how fast they run away.",
      colouring: true,
    },
  ],
  escape: ESCAPE_RADIUS_2,
};

const TRICORN: FractalMath = {
  title: "Tricorn",
  rule: rule(superscript(conjugate(z), number(2))),
  start: START_AT_ZERO,
  setting: null,
  blurb: [
    {
      text: "The same game as the Mandelbrot set, with one twist: before squaring, each number is flipped to its mirror image across the real axis, its conjugate.",
    },
    {
      text: "That turns the one-lobed set into a three-armed one that a turn of 120 degrees maps onto itself.",
    },
    {
      text: "Numbers that stay small are the black body; the rest are coloured by how fast they run away.",
      colouring: true,
    },
  ],
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
  blurb: [
    {
      text: "The same game as the Mandelbrot set, with one twist: the two halves of the number are not treated alike.",
    },
    {
      text: "The real part squares as it is, while the imaginary part is taken against the size of the real part, so the sign of the real part is thrown away in one half of the step and kept in the other.",
    },
    {
      text: "That fold leaves a flat-backed dark hull with rows of masts along its edge, and the rest is coloured by how fast a point runs away.",
      colouring: true,
    },
  ],
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
  blurb: [
    {
      text: "The same game as the Mandelbrot set, with one twist: after squaring, the real part of the result is flipped to be positive.",
    },
    {
      text: "That fold gives the set a flat left edge and lacy, knotted loops.",
    },
    {
      text: "Numbers that stay small are the black body; the rest are coloured by how fast they run away.",
      colouring: true,
    },
  ],
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
const NEWTON_BLURBS: Readonly<Record<string, Blurb>> = {
  "3": [
    {
      text: "Newton's method hunts for a solution of z cubed = 1 by improving a guess again and again.",
    },
    {
      text: "The equation has three solutions, the cube roots of 1, and every pixel is a first guess.",
    },
    {
      text: "The picture colours each starting point by the solution it ends up at, shaded by how few steps that took; the borders between the three colours are endlessly tangled.",
      colouring: true,
    },
  ],
  "4": [
    {
      text: "Newton's method hunts for a solution of z to the fourth = 1 by improving a guess again and again.",
    },
    {
      text: "The equation has four solutions, the fourth roots of 1, and every pixel is a first guess.",
    },
    {
      text: "The picture colours each starting point by the solution it ends up at, shaded by how few steps that took, so four colour families meet along the same endlessly tangled borders.",
      colouring: true,
    },
  ],
  "5": [
    {
      text: "Newton's method hunts for a solution of z to the fifth = 1 by improving a guess again and again.",
    },
    {
      text: "The equation has five solutions, the fifth roots of 1, and every pixel is a first guess.",
    },
    {
      text: "The picture colours each starting point by the solution it ends up at, shaded by how few steps that took, and five colour families meet along the borders between them.",
      colouring: true,
    },
  ],
  cycle: [
    {
      text: "Newton's method hunts for a solution of z cubed minus 2z plus 2 by improving a guess again and again.",
    },
    {
      text: "The equation has three solutions, but beside the origin the method is caught in a loop instead: nought is sent to 1 and 1 straight back to nought, so those points never settle.",
    },
    {
      text: "The picture colours each starting point by the solution it ends up at, shaded by how few steps that took, and paints the ones caught in the loop black.",
      colouring: true,
    },
  ],
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
 * The top and bottom are both 1 at z = 1 whatever c is, which is why 1 is a
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

/**
 * A fraction squared. The fraction goes in brackets so the exponent sits
 * against the closing bracket: a bare `msup` over an `mfrac` sets the 2 beside
 * the numerator's last term, which reads as (z² + c − 1)² over 2z + c − 2.
 */
const squaredFraction = (inner: MathExpr): MathExpr =>
  superscript(row(OPEN, inner, CLOSE), number(2));

/** The rule of each magnetic type: its own fraction, in brackets, squared. */
const MAGNET_RULES: Readonly<Record<number, MathExpr>> = {
  1: row(z, ARROW, squaredFraction(MAGNET_ONE_FRACTION)),
  2: row(z, ARROW, squaredFraction(MAGNET_TWO_FRACTION)),
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
    blurb: [
      {
        text: "Each step forms a fraction out of z and c, squares it, and starts again from there.",
      },
      {
        text: "Almost every c has an orbit that settles on the fixed point z = 1, and that settled set is the flat black of the picture; the colours draw the small island of c whose orbit runs off to infinity instead.",
        colouring: true,
      },
      {
        text: "The two magnetic types are the same question asked of two different fractions.",
      },
    ],
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
    blurb: [
      {
        text: "This is a Julia set with a memory: every step squares the number and adds c, and also adds p times the number from the step before.",
      },
      {
        text: "That extra term feeds the past back into each new point, which feathers the picture into flame-like shapes that a plain Julia set never makes.",
      },
      {
        text: "Points whose numbers stay small are the black body and the rest are coloured by how fast they run away.",
        colouring: true,
      },
    ],
    escape: `${ESCAPE_RADIUS_2} In the orbit plot the memory shows: the path starts at the pixel, and each new dot is pulled by the dot before the last, so the path spirals less smoothly than a Julia orbit does.`,
  };
}

/** z₀ = 1, c = the pixel's point: Nova starts at a root of z³ − 1 and adds the pixel at every step. */
const START_AT_ONE = row(
  subscript(z, number(0)),
  EQUALS,
  number(1),
  operator(","),
  c,
  EQUALS,
  PIXELS_POINT,
);

/** Nova's step: Newton's step for z³ − 1, with c added after it. */
const NOVA: FractalMath = {
  title: "Nova fractal",
  rule: row(
    z,
    ARROW,
    z,
    operator(MINUS),
    fraction(NEWTON_POLYNOMIALS["3"], NEWTON_DERIVATIVES["3"]),
    PLUS,
    c,
  ),
  start: START_AT_ONE,
  setting: null,
  blurb: [
    {
      text: "Nova is Newton's method for z cubed = 1 with a constant added after every step.",
    },
    {
      text: "Pick a point on the plane and call it c, start at 1 and keep improving the guess and adding c.",
    },
    {
      text: "Instead of three tidy basins the picture is a Mandelbrot-like set with spirals and bulbs in it, where the Newton basins are folded into the shapes.",
    },
  ],
  escape:
    "A point is done when a step moves it by less than 0.000001, which means it has settled; the colour is the number of steps that took. A point whose numbers pass 1,000,000 has escaped and is coloured by its step the same way, and a point that has not settled within the iteration cap, circling or wandering for good, is painted black. In the orbit plot a settling point is a path that closes in on one spot, and a point that circles is a path that keeps going round.",
};

/** z₀ = π/2, c = the pixel's point: the critical point of c sin z, so the first step lands on c. */
const START_AT_HALF_PI = row(
  subscript(z, number(0)),
  EQUALS,
  fraction(number("π"), number(2)),
  operator(","),
  c,
  EQUALS,
  PIXELS_POINT,
);

const SINE: FractalMath = {
  title: "Sine set",
  rule: row(
    z,
    ARROW,
    c,
    operator(INVISIBLE_TIMES),
    identifier("sin", "the sine of"),
    OPEN,
    z,
    CLOSE,
  ),
  start: START_AT_HALF_PI,
  setting: null,
  blurb: [
    {
      text: "The same game as the Mandelbrot set, but each step takes the sine of the number instead of squaring it, and then multiplies by c.",
    },
    {
      text: "The sine of a number that has strayed far from the real line is enormous, so a point either settles or is thrown out almost at once: the set is a chain of round bulbs along the real axis, and the filigree is where the two meet.",
    },
    {
      text: "Points that stay put are the black bulbs; the rest are coloured by how many steps it takes to throw them out.",
      colouring: true,
    },
  ],
  escape:
    "A point escapes when the imaginary part of z passes 20: the sine of such a number is about a hundred million times bigger again, so it never comes back. The colour is the step on which that happens, smoothed between steps; a point that never escapes within the iteration cap is painted black. A point on the real axis never leaves it, which is why a thin black line runs the whole width of the picture.",
};

/** z₀ = 0, c = the pixel's point: the critical point of c cos z, so the first step lands on c. */
const COSINE: FractalMath = {
  title: "Cosine set",
  rule: row(
    z,
    ARROW,
    c,
    operator(INVISIBLE_TIMES),
    identifier("cos", "the cosine of"),
    OPEN,
    z,
    CLOSE,
  ),
  start: START_AT_ZERO,
  setting: null,
  blurb: [
    {
      text: "The same game as the Mandelbrot set, but each step takes the cosine of the number instead of squaring it, and then multiplies by c.",
    },
    {
      text: "The cosine of a number that has strayed far from the real line is enormous, so a point either settles or is thrown out almost at once: the set is two large discs that touch at the origin, with smaller discs strung along the real axis, and the filigree is where they meet.",
    },
    {
      text: "Points that stay put are the black discs; the rest are coloured by how many steps it takes to throw them out.",
      colouring: true,
    },
  ],
  escape:
    "A point escapes when the imaginary part of z passes 20: the cosine of such a number is about a hundred million times bigger again, so it never comes back. The colour is the step on which that happens, smoothed between steps; a point that never escapes within the iteration cap is painted black. A point on the real axis never leaves it, which is why a thin black line runs the whole width of the picture.",
};

/** z₀ = √(π/2), c = the pixel's point: the critical point of c sin z², so the first step lands on c. */
const START_AT_ROOT_HALF_PI = row(
  subscript(z, number(0)),
  EQUALS,
  sqrt(fraction(number("π"), number(2))),
  operator(","),
  c,
  EQUALS,
  PIXELS_POINT,
);

/** z₀ = arccos(−1/c), c = the pixel's point: a critical point of c sin z + z, on the branch with real part in [0, π]. */
const START_AT_ARCCOS = row(
  subscript(z, number(0)),
  EQUALS,
  identifier("arccos", "the arc cosine of"),
  OPEN,
  operator(MINUS),
  fraction(number(1), c),
  CLOSE,
  operator(","),
  c,
  EQUALS,
  PIXELS_POINT,
);

const SINE_PLUS_Z: FractalMath = {
  title: "Sine plus z set",
  rule: row(
    z,
    ARROW,
    c,
    operator(INVISIBLE_TIMES),
    identifier("sin", "the sine of"),
    z,
    PLUS,
    z,
  ),
  start: START_AT_ARCCOS,
  setting: null,
  blurb: [
    {
      text: "The same game as the Sine set, but each step adds c times the sine of the number to the number itself, so a point drifts along instead of being thrown back to c.",
    },
    {
      text: "A real c of size 1 or more keeps its orbit on the real axis, so a long black line runs the width of the picture with beads strung along it past the central body, and the filigree is where the body and the beads meet.",
    },
    {
      text: "Points that stay put are the black body and beads; the rest are coloured by how many steps it takes to throw them out.",
      colouring: true,
    },
  ],
  escape:
    "A point escapes when the imaginary part of z passes 20: the sine of such a number is about a hundred million times bigger again, so it never comes back. The colour is the step on which that happens, smoothed between steps; a point that never escapes within the iteration cap is painted black.",
};

const SINE_SQUARED: FractalMath = {
  title: "Sine of z squared set",
  rule: row(
    z,
    ARROW,
    c,
    operator(INVISIBLE_TIMES),
    identifier("sin", "the sine of"),
    SQUARE_OF_Z,
  ),
  start: START_AT_ROOT_HALF_PI,
  setting: null,
  blurb: [
    {
      text: "The same game as the Mandelbrot set, but each step squares the number, takes the sine of the square and then multiplies by c.",
    },
    {
      text: "The sine of a number that has strayed far from the real line is enormous, so a point either settles or is thrown out almost at once: an orbit that starts on the real axis or on the imaginary axis stays on it, so both whole axes are in the set, and the shape is a diamond with smaller copies strung along them.",
    },
    {
      text: "Points that stay put are the black diamond; the rest are coloured by how many steps it takes to throw them out.",
      colouring: true,
    },
  ],
  escape:
    "A point escapes when the square of z is more than 20 off the real axis either way (the size of Im z² passes 20): the sine of such a number is about a hundred million times bigger again, so it never comes back. The colour is the step on which that happens, smoothed between steps; a point that never escapes within the iteration cap is painted black. An orbit that starts on either axis stays on it, which is why two black lines cross the picture.",
};

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
    blurb: [
      {
        text: "Every point of the picture is a starting value, and the same fixed number c is added at every step.",
      },
      {
        text: "Points whose numbers stay small forever form the Julia set, and the rest run away, coloured by how fast.",
        colouring: true,
      },
      {
        text: "Each choice of c gives a different picture, and the Mandelbrot set is the map of which choices give a connected one.",
      },
    ],
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
    blurb: [
      {
        text: "The same game as the Mandelbrot set, but each step raises the number to a higher power d instead of squaring it.",
      },
      {
        text: "A higher power gives the set more lobes, d - 1 of them, so d = 3 has two, d = 4 has three and d = 5 has four.",
      },
      {
        text: "Numbers that stay small are the black body; the rest are coloured by how fast they run away.",
        colouring: true,
      },
    ],
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
  nova: () => NOVA,
  sine: () => SINE,
  cosine: () => COSINE,
  "sin-z-squared": () => SINE_SQUARED,
  "sine-plus-z": () => SINE_PLUS_Z,
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

/**
 * What the Normal picture's colour was made of, said as the thing a trap
 * picture shows instead: {@link describeTrapColouring} reads "...rather than"
 * one of these.
 *
 * An escape-time set colours a point by how fast it runs away, so that is the
 * fallback. The three kinds whose orbits end by settling on something rather
 * than leaving — Newton, Nova and the Magnet — say what their own colour was
 * instead, because "how quickly the orbit escapes" would be false of them.
 * Phoenix is escape-time like the Mandelbrot set and takes the fallback.
 */
const TRAP_COMPARISONS: Readonly<Record<string, string>> = {
  newton: "which root the orbit settles on, and how quickly",
  nova: "how many steps the orbit took to settle or to run away",
  magnet:
    "whether the orbit settles on the fixed point or runs off to infinity",
};

const TRAP_ESCAPE_COMPARISON = "how quickly the orbit escapes";

/**
 * The sentence a paragraph gains when a trap draws the picture. It is the same
 * for every fractal and every shape: the trap itself is named by the shape's
 * own numbers in the row above, so a second copy here would be one more place
 * for the card to disagree with the renderer.
 *
 * It stands in for the sentences {@link blurbFor} drops, which is why it says
 * where the colours come from rather than only what they are made of.
 */
export const TRAP_BLURB_SENTENCE =
  'With an orbit trap on, the colour of every point is how close its orbit comes to the trap; the "Each point" row above says which shape that is.';

/**
 * The paragraph the card prints under its rows.
 *
 * With Normal it is every sentence of the descriptor, in order, which is the
 * paragraph a reader has always seen. With a trap on it is only the sentences a
 * trap leaves true — see {@link BlurbSentence} for which ones those are — and
 * then {@link TRAP_BLURB_SENTENCE}, so a reader is never told what a colouring
 * they are not looking at is made of.
 *
 * @param blurb - The fractal's paragraph
 * @param trap - The trap the picture is drawn in, or null for Normal
 * @returns The sentences, joined with single spaces
 */
export function blurbFor(blurb: Blurb, trap: TrapShape | null): string {
  return blurb
    .filter((sentence) => trap === null || sentence.colouring !== true)
    .map((sentence) => sentence.text)
    .concat(trap === null ? [] : [TRAP_BLURB_SENTENCE])
    .join(" ");
}

/**
 * Where a trap sits, in the plane the orbit moves in, with its own numbers:
 * "a point at -0.5", "the imaginary axis, the line whose real part is 0" or
 * "the circle of radius 0.5 about the origin".
 *
 * Every number is read off the constants in `orbitTrap.ts` rather than written
 * out again, so the sentence cannot describe a shape the renderer is not
 * using.
 * @param trap - Which trap is on
 * @returns The shape and its place, as a clause
 */
export function describeTrapShape(trap: TrapShape): string {
  switch (trap) {
    case "point":
      return `a point at ${formatComplex(TRAP_POINT.real, TRAP_POINT.imaginary)}`;
    case "line":
      return `the imaginary axis, the line whose real part is ${formatCoordinate(TRAP_LINE_REAL)}`;
    case "circle": {
      const atOrigin =
        TRAP_CIRCLE_CENTRE.real === 0 && TRAP_CIRCLE_CENTRE.imaginary === 0;
      const centre = atOrigin
        ? "the origin"
        : formatComplex(TRAP_CIRCLE_CENTRE.real, TRAP_CIRCLE_CENTRE.imaginary);

      return `the circle of radius ${formatCoordinate(TRAP_CIRCLE_RADIUS)} about ${centre}`;
    }
  }
}

/**
 * What the colours mean with an orbit trap on, in plain words and in this
 * order: the fixed shape and where it is, the path each point's orbit takes,
 * how close that path comes to the shape and which end of the palette is
 * which, what the picture therefore shows instead of the Normal colouring, and
 * that Shift, Reverse and the scheme still choose the colours. It ends on what
 * the orbit plot draws, which is the path and not the trap.
 *
 * The comparison the fourth sentence draws is the fractal's own: a kind whose
 * orbits settle rather than escape would make "rather than how fast it
 * escapes" false, so it names its own colouring instead
 * ({@link TRAP_COMPARISONS}).
 * @param fractalId - The `FRACTAL_TYPES` id on the canvas
 * @param trap - The orbit trap the picture is drawn in
 * @returns The expanded card's colour explanation, in the trap's terms
 */
export function describeTrapColouring(
  fractalId: string,
  trap: TrapShape,
): string {
  const comparison = Object.prototype.hasOwnProperty.call(
    TRAP_COMPARISONS,
    fractalId,
  )
    ? TRAP_COMPARISONS[fractalId]
    : TRAP_ESCAPE_COMPARISON;

  return (
    `An orbit trap is a fixed shape in the plane the orbit moves in — ${describeTrapShape(trap)} — ` +
    `and it stays where it is when the picture pans or zooms. Each point's orbit is the path it ` +
    `follows, and the colour is how close that path ever comes to the shape: the closest is one ` +
    `end of the palette and the farthest the other. So the picture shows where orbits pass near ` +
    `the shape rather than ${comparison}, which is why the colours flow in bands. Shift, Reverse ` +
    `and the colour scheme still choose the colours. The orbit plot draws the path the point took ` +
    `and not the trap.`
  );
}
