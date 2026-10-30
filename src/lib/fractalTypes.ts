import type { FractalKind } from "../types/fractal";
import { burningShipKind } from "./burningShip";
import { isCustomJuliaConstant } from "./customConstantInput";
import {
  JULIA_CONSTANTS,
  createJuliaKind,
  isJuliaConstantName,
  parseJuliaConstant,
} from "./julia";
import {
  MAGNET_TYPES,
  MAGNET_TYPE_LABELS,
  createMagnetKind,
  parseMagnetType,
} from "./magnet";
import { mandelbrotKind } from "./mandelbrot";
import {
  MULTIBROT_POWERS,
  createMultibrotKind,
  parseMultibrotPower,
} from "./multibrot";
import {
  NEWTON_POLYNOMIALS,
  createNewtonKind,
  parseNewtonPolynomial,
} from "./newton";
import { celticKind } from "./celtic";
import {
  PHOENIX_CONSTANTS,
  createPhoenixKind,
  parsePhoenixConstant,
} from "./phoenix";
import { novaKind } from "./nova";
import { perpendicularShipKind } from "./perpendicularShip";
import { sineKind } from "./sine";
import { tricornKind } from "./tricorn";

/**
 * A fractal the explorer offers, as the picker shows it: the id the rest of
 * the app switches on, and the label next to it.
 */
export interface FractalType {
  /** Identifier the picker selects and the renderer resolves */
  id: string;
  /** Display text for the picker */
  label: string;
}

/**
 * The fractals the picker offers, in the order it lists them. The first is the
 * one the explorer opens on.
 */
export const FRACTAL_TYPES: readonly FractalType[] = [
  { id: "mandelbrot", label: "Mandelbrot" },
  { id: "julia", label: "Julia" },
  { id: "burning-ship", label: "Burning Ship" },
  { id: "tricorn", label: "Tricorn" },
  { id: "multibrot", label: "Multibrot" },
  { id: "newton", label: "Newton" },
  { id: "celtic", label: "Celtic" },
  // The one label that is shortened, on purpose: "Perpendicular Ship" is the
  // longest name here, and the full names overflow the switcher's row on a
  // phone, where the row is capped at the picture's width and scrolls
  // sideways. "Perp. Ship" keeps the row readable there, and the id and every
  // other name the app says (the Math card's title, a link's line, the Help
  // row) are spelled in full.
  { id: "perpendicular-ship", label: "Perp. Ship" },
  { id: "magnet", label: "Magnet" },
  { id: "phoenix", label: "Phoenix" },
  { id: "nova", label: "Nova" },
  { id: "sine", label: "Sine" },
];

/** One choice of a fractal's variant, as a chip or a select option shows it. */
export interface FractalVariantOption {
  /** What the page holds and a link carries for this choice */
  value: string;
  /** Display text for the chip or option */
  label: string;
}

/**
 * The one setting a fractal takes beyond its view -- a constant, power,
 * polynomial or type. The switcher's second row and the Settings select are
 * both drawn from this, so a fractal that takes a setting needs a descriptor
 * and no new controls.
 */
export interface FractalVariants {
  /** What the setting is called, as the row's caption and the select's label */
  label: string;
  /** The named choices, in the order they are offered */
  options: readonly FractalVariantOption[];
  /** Whether the setting also takes a value of the user's own (a Custom choice) */
  allowsCustom: boolean;
}

const JULIA_VARIANTS: FractalVariants = {
  label: "Julia constant",
  options: JULIA_CONSTANTS.map((constant) => ({
    value: constant.name,
    label: constant.name,
  })),
  allowsCustom: true,
};

// The power is written as the plain digit in a link and in storage, and the
// chip shows the formula's term, so "z^4" is what a visitor sees for "4".
const MULTIBROT_VARIANTS: FractalVariants = {
  label: "Power",
  options: MULTIBROT_POWERS.map((power) => ({
    value: String(power),
    label: `z^${power}`,
  })),
  allowsCustom: false,
};

// The magnetic type is written as the plain digit in a link and in storage, so
// "1" is what a link carries; the chip shows "Type I", which is what a visitor
// sees, because a bare "1" says nothing about what it chooses between.
const MAGNET_VARIANTS: FractalVariants = {
  label: "Type",
  options: MAGNET_TYPES.map((type) => ({
    value: String(type),
    label: MAGNET_TYPE_LABELS[type],
  })),
  allowsCustom: false,
};

// The id is the power's own digit in a link and in storage ("3", "4", "5"), or
// "cycle" for the polynomial with no such digit; the chip shows the equation,
// which is what a visitor is choosing between.
const NEWTON_VARIANTS: FractalVariants = {
  label: "Polynomial",
  options: NEWTON_POLYNOMIALS.map((polynomial) => ({
    value: polynomial.id,
    label: polynomial.label,
  })),
  allowsCustom: false,
};

// The Phoenix constant is written as its name in a link and in storage, as a
// Julia constant is, and the chip shows the same name. There is no Custom
// choice: the constant is two numbers of different kinds (c, which is added,
// and p, which weighs the point before the last), so there is no map to pick
// them from the way the Julia map picks a point.
const PHOENIX_VARIANTS: FractalVariants = {
  label: "Phoenix constant",
  options: PHOENIX_CONSTANTS.map((entry) => ({
    value: entry.name,
    label: entry.name,
  })),
  allowsCustom: false,
};

/**
 * The setting a fractal takes, or null for a fractal that takes none.
 * @param fractalId - Id of the fractal
 * @returns Its variant descriptor; null for every fractal but Julia, the Multibrot, the Newton fractal, the Magnet and the Phoenix, and for any id this build does not know
 */
export function fractalVariants(fractalId: string): FractalVariants | null {
  if (fractalId === "julia") return JULIA_VARIANTS;
  if (fractalId === "multibrot") return MULTIBROT_VARIANTS;
  if (fractalId === "newton") return NEWTON_VARIANTS;
  if (fractalId === "magnet") return MAGNET_VARIANTS;
  if (fractalId === "phoenix") return PHOENIX_VARIANTS;

  return null;
}

/**
 * The variant a fractal opens on: its first named choice, or "" for a fractal
 * with no variant.
 * @param fractalId - Id of the fractal
 * @returns The variant value to start from
 */
export function defaultVariant(fractalId: string): string {
  return fractalVariants(fractalId)?.options[0]?.value ?? "";
}

/**
 * Whether a value is one this fractal can be drawn with: a named choice, or for
 * a fractal that allows it, a readable custom one. False for every value of a
 * fractal with no variant.
 * @param fractalId - Id of the fractal
 * @param value - A variant value from a link, a saved view or the page
 * @returns True when the value is a variant of that fractal
 */
export function isVariantValue(
  fractalId: string,
  value: string | null | undefined,
): value is string {
  if (value == null) return false;
  if (fractalId === "julia") return isJuliaConstantName(value);
  if (fractalId === "multibrot") return parseMultibrotPower(value) !== null;
  if (fractalId === "newton") return parseNewtonPolynomial(value) !== null;

  if (fractalId === "magnet") return parseMagnetType(value) !== null;

  return fractalId === "phoenix" && parsePhoenixConstant(value) !== null;
}

/**
 * The variant to hold once the page is on a fractal.
 *
 * The page keeps one variant string across a change of fractal, so a visit from
 * Julia to the Multibrot would otherwise leave a constant's name where a power
 * belongs. A value the fractal can be drawn with stays; a fractal that takes a
 * setting but cannot use the value gets its default; a fractal that takes none
 * leaves the value as it was, so Julia -> Mandelbrot -> Julia keeps the
 * constant.
 * @param fractalId - Id of the fractal the page is going to
 * @param variant - The variant the page holds
 * @returns The variant to hold for that fractal
 */
export function variantOn(fractalId: string, variant: string): string {
  if (fractalVariants(fractalId) === null) return variant;

  return isVariantValue(fractalId, variant)
    ? variant
    : defaultVariant(fractalId);
}

/**
 * Whether a value is the fractal's custom choice: readable, and not one of its
 * named options. It is what makes the select show Custom and the boxes appear.
 * @param fractalId - Id of the fractal
 * @param value - The variant on the page
 * @returns True for a custom value of a fractal that allows one
 */
export function isCustomVariant(fractalId: string, value: string): boolean {
  return (
    fractalVariants(fractalId)?.allowsCustom === true &&
    isCustomJuliaConstant(value)
  );
}

/**
 * The formula a picker choice draws.
 *
 * The picker names a fractal and the renderer wants a {@link FractalKind}. A
 * plain kind -- the Mandelbrot set, the Burning Ship, the Perpendicular Ship,
 * the Tricorn, the Celtic set, Nova or the Sine set -- is the same thing. Julia is a family
 * rather than a picture, so the choice carries a constant as well -- one of the
 * named ones, or a custom spelling of any other point -- and the Multibrot,
 * Newton, the Magnet and the Phoenix are families of their own setting. A value
 * a family cannot read falls back to its first option, never to a blank canvas.
 * @param typeId - Id of the fractal the picker selected
 * @param variant - Name of the Julia constant, the Multibrot power, the Newton polynomial, the Magnet type or the Phoenix constant; ignored for any other fractal
 * @returns The kind to draw
 */
export function resolveFractalKind(
  typeId: string,
  variant: string,
): FractalKind {
  if (typeId === "burning-ship") return burningShipKind;
  if (typeId === "perpendicular-ship") return perpendicularShipKind;
  if (typeId === "tricorn") return tricornKind;
  if (typeId === "newton") {
    return createNewtonKind(
      parseNewtonPolynomial(variant) ?? NEWTON_POLYNOMIALS[0].id,
    );
  }
  if (typeId === "celtic") return celticKind;
  if (typeId === "nova") return novaKind;
  if (typeId === "sine") return sineKind;
  if (typeId === "magnet") {
    return createMagnetKind(parseMagnetType(variant) ?? MAGNET_TYPES[0]);
  }
  if (typeId === "phoenix") {
    return createPhoenixKind(
      parsePhoenixConstant(variant) ?? PHOENIX_CONSTANTS[0].constant,
    );
  }
  if (typeId === "multibrot") {
    return createMultibrotKind(
      parseMultibrotPower(variant) ?? MULTIBROT_POWERS[0],
    );
  }
  if (typeId !== "julia") return mandelbrotKind;

  const constant = parseJuliaConstant(variant);

  return createJuliaKind(constant ?? JULIA_CONSTANTS[0].constant);
}

/** Where a fractal's default view sits, in the plane and in zoom. */
export interface FractalDefaultView {
  centerX: number;
  centerY: number;
  zoom: number;
}

/**
 * The view a fractal opens on; why each frame was chosen is beside its branch.
 * @param typeId - Id of the fractal to frame
 * @returns The centre and zoom that fractal opens on
 */
export function defaultViewFor(typeId: string): FractalDefaultView {
  if (typeId === "julia") return { centerX: 0, centerY: 0, zoom: 1 };

  if (typeId === "burning-ship") {
    return { centerX: -0.45, centerY: -0.5, zoom: 1 };
  }

  // The Tricorn's three arms point to -2 and to 1 +- 1.73i, the left tip turned
  // by 120 degrees each way, so the set maps onto itself about the origin and
  // the origin frames all three arms alike. Zoom 1 is the widest view the
  // explorer has (4 by 3, x from -2 to 2, y from -1.5 to 1.5): the left arm and
  // the body are whole and the other two arms run off the top and bottom edges,
  // losing the last 0.23 of their thin tips. Chosen from renders at 400x300 of
  // (0, 0) and (-0.25, 0), both at zoom 1: the second moved the left tip off
  // the frame's edge and no more of the others in, at the cost of the symmetry,
  // so the centre stays on the origin.
  if (typeId === "tricorn") return { centerX: 0, centerY: 0, zoom: 1 };

  // The Multibrot sets are symmetric about the origin by a turn of 360/(d-1)
  // degrees, so the origin centres each alike, and one frame has to hold three
  // sets of different shapes. Measured with a 0.002 grid and a cap of 400
  // (points still inside at the cap), the sets span:
  //   z^3: x -0.69..0.69, y -1.32..1.32   (the tallest: two lobes, one above
  //                                         the other)
  //   z^4: x -1.26..0.80, y -1.10..1.10   (three lobes, one pointing left)
  //   z^5: x -0.91..0.91, y -0.91..0.91   (four lobes)
  // Zoom 1 is x -2..2 by y -1.5..1.5: z^3, the one that fills most of it, keeps
  // 0.18 clear above and below, and the other two sit well inside (confirmed in
  // renders of all three at 300x225 in the classic scheme). Zoom 1.1 would
  // leave z^3's top bulb only 0.04 from the frame's edge.
  if (typeId === "multibrot") return { centerX: 0, centerY: 0, zoom: 1 };

  // Newton's method on z^3 - 1 has no set to frame: every point of the plane
  // but the boundary belongs to one of three basins, so the frame is chosen to
  // show all three. The map commutes with a turn of 120 degrees about the
  // origin (the roots 1 and -0.5 +- 0.866i are turned onto each other), the
  // three basins meet at the origin and the boundary runs out from it along
  // the rays at 60, 180 and 300 degrees, so the origin is the centre that
  // treats them alike, and zoom 1 (x -2..2, y -1.5..1.5) is the widest view the
  // explorer has. Measured on a 400x300 grid at a cap of 100, whole counts, the
  // frame is 40% / 30% / 30% basin of the root 1, of -0.5 + 0.866i and of
  // -0.5 - 0.866i (the frame is wider than it is tall, so the root on the axis
  // gets the larger share), none left unsettled, and each root and its dark
  // centre is inside it with a margin of at least 0.6 to the nearest edge.
  // Drawn at 400x300 in all five schemes, the origin junction reads as a
  // pinwheel of three colours with bulbs strung along the three boundaries
  // (newton.test.ts holds the three colour families for every scheme).
  if (typeId === "newton") return { centerX: 0, centerY: 0, zoom: 1 };

  // The Celtic set is the Mandelbrot set's on the real axis, so it runs from
  // the thin spike at -2 to the nose at 0.33, and it is mirrored about that
  // axis. Measured with a 0.004 grid and a cap of 400 it spans x -1.78..0.33
  // (the spike's last stretch is thinner than the grid) by y -1.55..1.55, so
  // the body's top and bottom run a little past zoom 1's 1.5, which is the
  // widest view there is. Centring on the middle of the real extent, -0.8,
  // leaves the spike and the nose both inside with 0.8 to spare each side.
  if (typeId === "celtic") return { centerX: -0.8, centerY: 0, zoom: 1 };

  // The Perpendicular Ship is mirrored about the real axis, and its masts
  // stand above and below the hull, so the frame is centred on that axis.
  // Measured with a 0.02 grid at a cap of 200 and a 0.004 one at 400 (points
  // still inside at the cap), the set spans x -1.78..0.68 by y -1.09..1.09 --
  // 2.46 wide and 2.18 tall, so the middle of its real extent is -0.55. Zoom 1
  // is the widest view there is (4 by 3): x -2.55..1.45 by y -1.5..1.5, which
  // holds the spike's tip, the nose and both rows of masts with 0.4 or more
  // clear above, below and either side.
  if (typeId === "perpendicular-ship") {
    return { centerX: -0.55, centerY: 0, zoom: 1 };
  }

  // The Magnet set is the c whose orbit settles on the attracting fixed point
  // z = 1, and that is most of the plane; the picture is the island of c whose
  // orbit runs off to infinity instead, which is what the coloured region of
  // every one of its pictures is. Type I's island is measured with a 0.02 grid
  // at a cap of 150 and a 0.005 one at 300, and spans x -0.46..3.07 by y
  // -2.16..2.16; Type II's is smaller and sits a little left, spanning x
  // -0.20..2.30 by y -1.53..1.53. Zoom 1 is the widest view the explorer has
  // (4 by 3), so it is the only frame that can hold either island across, and
  // it is centred on the middle of Type I's real extent: x -0.7..3.3 covers
  // both islands and the settled black either side of them, while y -1.5..1.5
  // crops Type I's top and bottom lobes, which is the most of its height the
  // explorer can show at once. The corner is the flat black of the settled set.
  if (typeId === "magnet") return { centerX: 1.3, centerY: 0, zoom: 1 };

  // The Sine set is the c whose orbit under z -> c sin z, started at the
  // critical point pi/2, is not thrown out. Every point of the real axis is in
  // it (an orbit that starts real stays real), and the picture is a chain of
  // round bulbs along that axis: measured on a 0.002 grid at a cap of 400 along
  // y = 0.1, the in-set runs are x 0..0.994 (the central disc, |c| < 1, where
  // the fixed point 0 attracts because its multiplier is c), 1.008..2.256 and
  // 2.29..2.596, then 4.536..4.994, and at x = 0.3 the central disc rises to
  // y = 0.954 (sqrt(1 - 0.09)). The set is symmetric about both axes, so the
  // origin centres it. Zoom 1 (x -2..2, y -1.5..1.5) is the widest view there
  // is: it holds the central disc whole, the next disc to 2.256 less its last
  // 0.26, and both buds above and below the central disc, and 47.8% of its
  // pixels are in the set (measured on 400 by 300 at the cap of 400).
  if (typeId === "sine") return { centerX: 0, centerY: 0, zoom: 1 };

  // A Phoenix set is a Julia set of the two-term step, so like Julia's it is
  // framed on the origin and every constant draws about it. Measured with a
  // 0.01 grid at a cap of 300 (points that run 30 steps or more, which is the
  // set and the structure around it), the three named constants span
  //   Classic   x -0.67..0.75, y -1.27..1.27
  //   Spirals   x -0.88..0.72, y -1.13..1.13  (dust: no point runs the cap)
  //   Hourglass x -0.65..0.75, y -1.28..1.28
  // and zoom 1 (x -2..2, y -1.5..1.5, the widest view there is) holds each with
  // 0.2 or more clear above and below and over a unit either side. The sets
  // are taller than they are wide, so the frame's height is what bounds them.
  if (typeId === "phoenix") return { centerX: 0, centerY: 0, zoom: 1 };

  // The Nova set is the c whose orbit does not settle quickly, and the picture
  // is that set and the bands round it. Measured with a 0.01 grid at a cap of
  // 300 (points that never settle or take 60 steps or more; the plane beyond
  // settles in about 35) it spans x -1.49..0.36 by y -0.59..0.59, so its middle
  // is about -0.55. Zoom 1.5 (x -1.88..0.78, y -1..1) holds all of it with
  // 0.4 clear above and below and the arc's tips and the filament's end well
  // inside; zoom 1 would show the same set a third smaller.
  if (typeId === "nova") return { centerX: -0.55, centerY: 0, zoom: 1.5 };

  return { centerX: -0.75, centerY: 0, zoom: 1 };
}
