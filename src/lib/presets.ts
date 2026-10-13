import { FractalBounds, ColorScheme, TrapShape } from "../types/fractal";
import {
  FRACTAL_TYPES,
  defaultVariant,
  fractalVariants,
  isVariantValue,
  variantOn,
} from "./fractalTypes";
import { boundsToView } from "./mandelbrot";
import {
  DEFAULT_REVERSE,
  DEFAULT_SHIFT,
  normalizeShift,
} from "./paletteControls";
import { TRAP_SHAPES } from "./orbitTrap";

export interface FractalPreset {
  id: string;
  name: string;
  description: string;
  bounds: FractalBounds;
  maxIterations: number;
  colorScheme: ColorScheme;
  canvasWidth: number;
  canvasHeight: number;
  /**
   * Fractal this view was saved for, as a {@link FRACTAL_TYPES} id. Absent
   * means the Mandelbrot set: a view saved before the format had this field was
   * a Mandelbrot view, because that is the only thing the app could draw then.
   */
  fractal?: string;
  /**
   * A Julia view's constant, the variant `fractalVariants("julia")` offers. The
   * page calls it `variant`; the stored name stays `juliaConstant` so saved
   * views from before variants still load, and a Julia view is still written
   * under it so an older build can read what this one saves.
   */
  juliaConstant?: string;
  /**
   * The variant (see `fractalVariants`) of a fractal that takes one, other
   * than Julia, whose constant has its own field above: the Multibrot's power,
   * the Newton polynomial, the Magnet type or the Phoenix constant. A new field
   * rather than `juliaConstant` reused, because a power is not a constant, and
   * an older build then sees such a view as a view of a fractal it does not
   * know and leaves it unlisted instead of reading a power as a Julia name.
   */
  variant?: string;
  /**
   * Whether the view's palette was walked backwards when it was saved
   * (`ColorOptions.reverse`). Absent means it was not, which is what a view
   * saved before the setting existed was: the app had no such control.
   */
  reverse?: boolean;
  /**
   * How far round the palette the view's colours started when it was saved
   * (`ColorOptions.shift`), a fraction of a turn. Absent means not at all.
   */
  shift?: number;
  /**
   * The orbit trap the view was coloured by when it was saved, one of
   * `TRAP_SHAPES`. Absent means the iteration-count picture, which is what a
   * view saved before traps existed was.
   */
  trap?: TrapShape;
}

/** The fractal a view with no `fractal` field was saved for. */
export const DEFAULT_PRESET_FRACTAL = "mandelbrot";

/**
 * Every Julia set is symmetric and fits in the same box about the origin
 * whatever its constant, so the four named views below all open on this frame
 * — the whole set at zoom 1. Only the spirals view magnifies it.
 */
const JULIA_WHOLE_VIEW: FractalBounds = {
  minReal: -2,
  maxReal: 2,
  minImaginary: -1.5,
  maxImaginary: 1.5,
};

// The built-in views. A preset is a centre and a zoom written out as bounds and,
// since a view belongs to the fractal it was framed on, the fractal — and for a
// Julia view the constant. Every frame holds the 4:3 shape of the canvas
// (`calculateZoomBounds`), so loading one fills it rather than stretching it,
// and `presets.test.ts` measures each with its own fractal's iteration function
// — a frame the fractal fills is a blank button.
export const BUILTIN_PRESETS: FractalPreset[] = [
  {
    id: "overview",
    name: "Overview",
    description: "Classic Mandelbrot set overview",
    bounds: {
      minReal: -2.5,
      maxReal: 1.5,
      minImaginary: -1.5,
      maxImaginary: 1.5,
    },
    maxIterations: 100,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
  },
  {
    id: "seahorse-valley",
    name: "Seahorse Valley",
    description: "Beautiful seahorse-like structures",
    // Centre (-0.7453, 0.1127) at zoom 400: one seahorse spiral with the
    // surroundings that make it read as one. The frame it replaced sat over the
    // valley's left edge, which pushed the spiral against the right of the
    // picture and left half the canvas flat.
    bounds: {
      minReal: -0.7503,
      maxReal: -0.7403,
      minImaginary: 0.10895,
      maxImaginary: 0.11645,
    },
    maxIterations: 300,
    colorScheme: "ocean",
    canvasWidth: 800,
    canvasHeight: 600,
  },
  {
    id: "lightning",
    name: "Lightning",
    description: "Electric lightning-like patterns",
    bounds: {
      minReal: -1.2515,
      maxReal: -1.2495,
      minImaginary: 0.0195,
      maxImaginary: 0.0215,
    },
    maxIterations: 300,
    colorScheme: "fire",
    canvasWidth: 800,
    canvasHeight: 600,
  },
  {
    id: "spiral",
    name: "Spiral Galaxy",
    description: "Spiral patterns resembling galaxies",
    bounds: {
      minReal: -0.17,
      maxReal: -0.15,
      minImaginary: 1.03,
      maxImaginary: 1.05,
    },
    maxIterations: 250,
    colorScheme: "rainbow",
    canvasWidth: 800,
    canvasHeight: 600,
  },
  {
    id: "elephant-valley",
    name: "Elephant Valley",
    description: "Elephant-like bulbous structures",
    // Centre (0.29, 0.01) at zoom 200, where the trunk spirals are. The older
    // frame sat on the cardioid's edge at (0.25, 0): 95% of it was set
    // interior, which the renderer paints as one flat colour.
    bounds: {
      minReal: 0.28,
      maxReal: 0.3,
      minImaginary: 0.0025,
      maxImaginary: 0.0175,
    },
    maxIterations: 150,
    colorScheme: "fire",
    canvasWidth: 800,
    canvasHeight: 600,
  },
  {
    id: "feather",
    name: "Feather",
    description: "Delicate feather-like fractals",
    bounds: {
      minReal: -0.236,
      maxReal: -0.234,
      minImaginary: 0.826,
      maxImaginary: 0.828,
    },
    maxIterations: 400,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
  },
  {
    id: "julia-classic",
    name: "Julia: Classic",
    description: "The whole Classic Julia set",
    bounds: { ...JULIA_WHOLE_VIEW },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "julia",
    juliaConstant: "Classic",
  },
  {
    id: "julia-classic-spirals",
    name: "Julia: Classic spirals",
    description: "Spirals around the Classic Julia set",
    // The whole-set view at zoom 3, framed about the origin: the spirals that
    // give the constant its name.
    bounds: {
      minReal: -2 / 3,
      maxReal: 2 / 3,
      minImaginary: -0.5,
      maxImaginary: 0.5,
    },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "julia",
    juliaConstant: "Classic",
  },
  {
    id: "julia-dendrite",
    name: "Julia: Dendrite",
    description: "The Dendrite's branching filaments",
    bounds: { ...JULIA_WHOLE_VIEW },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "julia",
    juliaConstant: "Dendrite",
  },
  {
    id: "julia-douady-rabbit",
    name: "Julia: Douady rabbit",
    description: "The Douady rabbit's three-lobed body",
    bounds: { ...JULIA_WHOLE_VIEW },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "julia",
    juliaConstant: "Douady rabbit",
  },
  {
    id: "julia-siegel-disk",
    name: "Julia: Siegel disk",
    description: "The Siegel disk's rotation domain",
    bounds: { ...JULIA_WHOLE_VIEW },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "julia",
    juliaConstant: "Siegel disk",
  },
  {
    id: "ship-overview",
    name: "Burning Ship",
    description: "The whole Burning Ship",
    bounds: {
      minReal: -2.5,
      maxReal: 1.5,
      minImaginary: -2,
      maxImaginary: 1,
    },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "burning-ship",
  },
  {
    id: "ship-armada",
    name: "Ship armada",
    description: "The Burning Ship's armada of masts",
    bounds: {
      minReal: -1.805,
      maxReal: -1.705,
      minImaginary: -0.0675,
      maxImaginary: 0.0075,
    },
    maxIterations: 400,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "burning-ship",
  },
  {
    id: "tricorn-overview",
    name: "Tricorn",
    description: "The whole Tricorn, its three arms to the frame",
    // The Tricorn's default view (0, 0) at zoom 1: 4 by 3 about the origin.
    bounds: {
      minReal: -2,
      maxReal: 2,
      minImaginary: -1.5,
      maxImaginary: 1.5,
    },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "tricorn",
  },
  {
    id: "tricorn-star",
    name: "Tricorn star",
    description: "A three-pointed star on one of the Tricorn's antennae",
    // Centre (0.872, 1.51) at zoom 50: 0.08 by 0.06.
    bounds: {
      minReal: 0.832,
      maxReal: 0.912,
      minImaginary: 1.48,
      maxImaginary: 1.54,
    },
    maxIterations: 400,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "tricorn",
  },
  {
    id: "multibrot-cubic",
    name: "Multibrot z^3",
    description: "The whole z^3 Multibrot set, two lobes one above the other",
    // The Multibrot default view (0, 0) at zoom 1: 4 by 3 about the origin.
    bounds: {
      minReal: -2,
      maxReal: 2,
      minImaginary: -1.5,
      maxImaginary: 1.5,
    },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "multibrot",
    variant: "3",
  },
  {
    id: "multibrot-quartic",
    name: "Multibrot z^4",
    description: "The whole z^4 Multibrot set, three lobes",
    bounds: {
      minReal: -2,
      maxReal: 2,
      minImaginary: -1.5,
      maxImaginary: 1.5,
    },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "multibrot",
    variant: "4",
  },
  {
    id: "multibrot-copy",
    name: "Multibrot copy",
    description: "A small copy of the z^3 set riding on its top lobe",
    // Centre (0.267, 1.26) at zoom 50: 0.08 by 0.06.
    bounds: {
      minReal: 0.227,
      maxReal: 0.307,
      minImaginary: 1.23,
      maxImaginary: 1.29,
    },
    maxIterations: 400,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "multibrot",
    variant: "3",
  },
  {
    id: "newton-overview",
    name: "Newton basins",
    description: "The three basins of z^3 - 1, one colour family per root",
    // The Newton default view (0, 0) at zoom 1: 4 by 3 about the origin.
    bounds: {
      minReal: -2,
      maxReal: 2,
      minImaginary: -1.5,
      maxImaginary: 1.5,
    },
    maxIterations: 300,
    colorScheme: "rainbow",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "newton",
    variant: "3",
  },
  {
    id: "newton-junction",
    name: "Newton junction",
    description: "Where all three basins meet, at the origin",
    // Centre (0, 0) at zoom 8: 0.5 by 0.375.
    bounds: {
      minReal: -0.25,
      maxReal: 0.25,
      minImaginary: -0.1875,
      maxImaginary: 0.1875,
    },
    maxIterations: 300,
    colorScheme: "rainbow",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "newton",
    variant: "3",
  },
  {
    id: "celtic-overview",
    name: "Celtic Mandelbrot",
    description: "The whole Celtic set, flat-edged body and spike",
    // The Celtic default view (-0.8, 0) at zoom 1: 4 by 3 about (-0.8, 0).
    bounds: {
      minReal: -2.8,
      maxReal: 1.2,
      minImaginary: -1.5,
      maxImaginary: 1.5,
    },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "celtic",
  },
  {
    id: "celtic-lace",
    name: "Celtic lace",
    description: "Lace and small copies to the left of the Celtic body",
    // Centre (-1.3, 0.7) at zoom 4: 1 by 0.75.
    bounds: {
      minReal: -1.8,
      maxReal: -0.8,
      minImaginary: 0.325,
      maxImaginary: 1.075,
    },
    maxIterations: 400,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "celtic",
  },
  {
    id: "perpendicular-ship-overview",
    name: "Perpendicular Ship",
    description: "The whole Perp. Ship, hull, row of masts and spike",
    // The Perpendicular Ship's default view (-0.55, 0) at zoom 1: 4 by 3 about
    // (-0.55, 0).
    bounds: {
      minReal: -2.55,
      maxReal: 1.45,
      minImaginary: -1.5,
      maxImaginary: 1.5,
    },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "perpendicular-ship",
  },
  {
    id: "perpendicular-ship-tendrils",
    name: "Perpendicular Ship tendrils",
    description: "Lace tendrils off the top of the hull",
    // Centre (-0.36, 0.85) at zoom 4: 1 by 0.75.
    bounds: {
      minReal: -0.86,
      maxReal: 0.14,
      minImaginary: 0.475,
      maxImaginary: 1.225,
    },
    maxIterations: 400,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "perpendicular-ship",
  },
  {
    id: "magnet-drift",
    name: "Magnet disks (Type I)",
    description: "The drift of disks where the Type I island meets the settled set",
    // Centre (1.6, 0) at zoom 8: 0.5 by 0.375. There is no Magnet overview
    // view: the set the picture's black stands for is nearly the whole plane,
    // so a frame holding the whole thing is one flat colour over most of it,
    // which the per-fractal guard in `presets.test.ts` refuses. Both built-ins
    // are therefore framed on the island, where the picture has detail.
    bounds: {
      minReal: 1.35,
      maxReal: 1.85,
      minImaginary: -0.1875,
      maxImaginary: 0.1875,
    },
    maxIterations: 250,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "magnet",
    variant: "1",
  },
  {
    id: "magnet-lobe",
    name: "Magnet lobe (Type II)",
    description: "The bright lobe off the Type II island, in its dust",
    // Centre (1.6, 1.05) at zoom 8: 0.5 by 0.375.
    bounds: {
      minReal: 1.35,
      maxReal: 1.85,
      minImaginary: 0.8625,
      maxImaginary: 1.2375,
    },
    maxIterations: 250,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "magnet",
    variant: "2",
  },
  {
    id: "phoenix-overview",
    name: "Phoenix (Classic)",
    description: "The whole Classic Phoenix set: two feathered flames, one above the other",
    // The default frame, centre (0, 0) at zoom 1: 4 by 3, the widest view there is.
    bounds: {
      minReal: -2,
      maxReal: 2,
      minImaginary: -1.5,
      maxImaginary: 1.5,
    },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "phoenix",
    variant: "Classic",
  },
  {
    id: "phoenix-feathers",
    name: "Phoenix feathers",
    description: "The feathered edge of the upper Classic flame",
    // Centre (-0.1, 0.55) at zoom 4: 1 by 0.75.
    bounds: {
      minReal: -0.6,
      maxReal: 0.4,
      minImaginary: 0.175,
      maxImaginary: 0.925,
    },
    maxIterations: 300,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "phoenix",
    variant: "Classic",
  },
  {
    id: "nova-overview",
    name: "Nova",
    description: "The whole Nova set: a C-shaped arc round a bloom of bands, with a string of disks trailing left",
    // The default frame, centre (-0.55, 0) at zoom 1.5: 8/3 by 2.
    bounds: {
      minReal: -0.55 - 4 / 3,
      maxReal: -0.55 + 4 / 3,
      minImaginary: -1,
      maxImaginary: 1,
    },
    maxIterations: 130,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "nova",
  },
  {
    id: "nova-bulbs",
    name: "Nova bulbs",
    description: "A tree of bulbs under the arc's upper half",
    // Centre (-0.1, 0.45) at zoom 6: 2/3 by 0.5.
    bounds: {
      minReal: -0.1 - 1 / 3,
      maxReal: -0.1 + 1 / 3,
      minImaginary: 0.2,
      maxImaginary: 0.7,
    },
    maxIterations: 230,
    colorScheme: "classic",
    canvasWidth: 800,
    canvasHeight: 600,
    fractal: "nova",
  },
];

/**
 * The zoom a view shows: how many times the base view is divided into it.
 *
 * Read through the view math rather than measured against a base of its own,
 * so the Zoom Level readout and the wheel, drag and preset code that move the
 * view always mean the same thing by "1x".
 */
export function calculateZoomLevel(bounds: FractalBounds): number {
  return boundsToView(bounds).scale;
}

/**
 * Format a zoom for a readout.
 *
 * The zoom is exact, and exact is not printable: the wheel zooms continuously
 * and compounding floats drift, so the bounds a zoom is read from carry error
 * in their last digits. So show a few significant figures (1.17x), drop the
 * noise, and use the K/M shorthand once the digits get long.
 * @param zoom - Zoom to format
 * @returns The zoom as a short string, without a unit
 */
export function formatZoom(zoom: number): string {
  if (zoom >= 1_000_000) return `${(zoom / 1_000_000).toFixed(1)}M`;
  if (zoom >= 1000) return `${(zoom / 1000).toFixed(1)}K`;
  if (zoom >= 100) return zoom.toFixed(0);
  if (zoom >= 10) return Number(zoom.toFixed(1)).toString();
  return Number(zoom.toFixed(2)).toString();
}

export function calculateCenter(bounds: FractalBounds): {
  x: number;
  y: number;
} {
  return {
    x: (bounds.minReal + bounds.maxReal) / 2,
    y: (bounds.minImaginary + bounds.maxImaginary) / 2,
  };
}

export function getPresetById(id: string): FractalPreset | undefined {
  return BUILTIN_PRESETS.find((preset) => preset.id === id);
}

/**
 * Which fractal a view belongs to.
 *
 * A preset with no `fractal` field is a Mandelbrot view, and so is one that
 * names the Mandelbrot set. An id this build does not know is `null`: nothing
 * here can draw or list that view, so it is skipped — but it stays in storage,
 * because a build that knows the fractal may yet read it back.
 */
export function presetFractal(preset: FractalPreset): string | null {
  const id = preset.fractal ?? DEFAULT_PRESET_FRACTAL;

  return FRACTAL_TYPES.some((type) => type.id === id) ? id : null;
}

/**
 * The views in a list that belong to one fractal.
 *
 * This is the filter behind the preset dropdown and the built-in buttons, and
 * it is also why a view for a fractal this build does not know is never listed:
 * it has no fractal to be listed under. A fresh array, so callers may build on
 * it.
 * @param presets - Views to choose from
 * @param fractalId - Id of the fractal to list views for
 * @returns The views belonging to that fractal, in the order given
 */
export function presetsForFractal(
  presets: readonly FractalPreset[],
  fractalId: string,
): FractalPreset[] {
  return presets.filter((preset) => presetFractal(preset) === fractalId);
}

/**
 * The fractal fields a view saved right now should carry.
 *
 * A view belongs to the fractal on the canvas when it is saved, and its
 * variant goes with it only for a fractal that takes one. A Julia view keeps
 * the stored name it has always had, `juliaConstant`, so views saved before
 * variants still load and a view saved now still reads in an older build; any
 * other family's setting is written as `variant`. A fractal with no variant --
 * the Mandelbrot set, the Burning Ship, the Perpendicular Ship, the Tricorn,
 * the Celtic set or Nova -- gets neither key at all, so its stored JSON stays
 * the shape it had before these fields existed.
 * @param fractalId - Id of the fractal on the canvas
 * @param variant - Variant on the canvas; written only for a fractal that takes one
 * @returns The fields to merge into the saved preset
 */
export function presetFractalFields(
  fractalId: string,
  variant: string,
): { fractal: string; juliaConstant?: string; variant?: string } {
  if (fractalId === "julia") {
    return { fractal: fractalId, juliaConstant: variant };
  }
  if (fractalVariants(fractalId) !== null) {
    return { fractal: fractalId, variant };
  }

  return { fractal: fractalId };
}

/**
 * The variant a view names: its Julia constant, or the setting of any other
 * family that takes one (see `fractalVariants`).
 *
 * Both stored fields are read, the fractal's own first: a Julia view's
 * `juliaConstant` (then `variant`), any other fractal's `variant` (then
 * `juliaConstant`). A value the fractal cannot be drawn with is skipped, so a
 * view that names a constant this build cannot read cannot be loaded as
 * written, and the picker would otherwise sit on a name it has no option for.
 * A custom Julia name is read on its own terms rather than looked up, because
 * it is a point rather than one of the four; only a name that is neither keeps
 * the view from being loaded. What is named then is the fractal's default: the
 * first constant for Julia, power 3 for the Multibrot, which is what
 * `resolveFractalKind` draws for such a value, so the select and the canvas
 * describe the same picture. A fractal that takes no variant gets the Julia
 * default, which the page does not apply.
 */
export function presetVariant(preset: FractalPreset): string {
  const fractal = presetFractal(preset) ?? DEFAULT_PRESET_FRACTAL;
  const stored =
    fractal === "julia"
      ? [preset.juliaConstant, preset.variant]
      : [preset.variant, preset.juliaConstant];

  return (
    stored.find((value) => isVariantValue(fractal, value)) ??
    variantOn(fractal, defaultVariant("julia"))
  );
}

/**
 * The colour fields a view saved right now should carry.
 *
 * A view's palette is part of it: the same counts coloured two ways are two
 * pictures, so a saved view keeps whichever way it was saved. Both defaults are
 * left out of the entry, exactly as `presetFractalFields` leaves out a key that
 * says nothing — a view saved with the scheme's own colours gets neither field
 * and its stored JSON stays the shape it had before the settings existed. That
 * is also what makes a view saved now readable by an older build, which reads
 * the fields it knows and ignores the rest.
 *
 * @param reverse - Whether the palette on the canvas is walked backwards
 * @param shift - Fraction of a turn the colours start at
 * @param trap - The orbit trap colouring the picture, or null for the
 *   iteration count; written only when it is a shape, like the other two
 * @returns The fields to merge into the saved preset
 */
export function presetColorFields(
  reverse: boolean,
  shift: number,
  trap: TrapShape | null = null,
): { reverse?: boolean; shift?: number; trap?: TrapShape } {
  const fields: { reverse?: boolean; shift?: number; trap?: TrapShape } = {};

  if (reverse !== DEFAULT_REVERSE) fields.reverse = reverse;
  const wrapped = normalizeShift(shift);
  if (wrapped !== DEFAULT_SHIFT) fields.shift = wrapped;
  if (trap !== null && TRAP_SHAPES.includes(trap)) fields.trap = trap;

  return fields;
}

/**
 * The orbit trap a saved view names, or null for the iteration-count picture.
 *
 * Judged on its own like the palette settings: a view saved before traps
 * existed names none, and a stored value that is not one of the three shapes
 * (text from a later build, a number) is no trap, so the view still loads and
 * still draws.
 *
 * @param preset - The saved view
 */
export function presetTrap(preset: FractalPreset): TrapShape | null {
  return TRAP_SHAPES.find((shape) => shape === preset.trap) ?? null;
}

/**
 * The colours a saved view names: its palette's two settings, judged one at a
 * time.
 *
 * A view saved before the settings existed names neither, and one that names a
 * value this build cannot use — a shift that is not a number, or one that has
 * been in storage a long time — keeps its default, so the view still loads and
 * still draws. A shift is read modulo a whole turn, as the mapping and the link
 * codec read it.
 *
 * @param preset - The saved view
 * @returns Both settings, the defaults for anything it does not say
 */
export function presetColorOptions(preset: FractalPreset): {
  reverse: boolean;
  shift: number;
} {
  return {
    reverse: preset.reverse === true,
    shift: normalizeShift(preset.shift),
  };
}

// Custom presets live in localStorage: an external store that the components
// read through useSyncExternalStore. Reads go through the helpers below so the
// snapshot keeps a stable identity between changes, and writes notify the
// subscribers so the rendered list follows the store without an effect.
const CUSTOM_PRESETS_KEY = "fractal-custom-presets";

// Snapshot handed back when there is nothing stored, and the value
// useSyncExternalStore uses on the server.
const EMPTY_PRESETS: readonly FractalPreset[] = Object.freeze([]);

const presetListeners = new Set<() => void>();

let snapshotSource: string | null | undefined;
let snapshot: readonly FractalPreset[] = EMPTY_PRESETS;

/** The stored JSON, or null when there is none (or storage is unavailable). */
function readCustomPresetsSource(): string | null {
  try {
    return localStorage.getItem(CUSTOM_PRESETS_KEY) || null;
  } catch (error) {
    console.error("Error loading custom presets:", error);
    return null;
  }
}

/**
 * The stored list, as presets.
 *
 * Entries pass through as they were stored. A field this build does not know —
 * a fractal id from a newer one, or anything a later format adds — is carried
 * rather than dropped, and storage is never written back on a read, so opening
 * the page cannot lose a view or a field it did not understand. Only a value
 * that could not be a preset at all is discarded: a stored array holding
 * something other than objects.
 */
function normaliseCustomPresets(value: unknown): FractalPreset[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (entry): entry is FractalPreset =>
      typeof entry === "object" && entry !== null,
  );
}

function parseCustomPresets(source: string): FractalPreset[] {
  try {
    return normaliseCustomPresets(JSON.parse(source));
  } catch (error) {
    console.error("Error loading custom presets:", error);
    return [];
  }
}

function writeCustomPresets(presets: FractalPreset[]): void {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));

  for (const listener of presetListeners) {
    listener();
  }
}

/**
 * Subscribe to custom preset changes: takes a listener, returns an
 * unsubscribe. This is the `subscribe` half of useSyncExternalStore.
 */
export function subscribeToCustomPresets(listener: () => void): () => void {
  presetListeners.add(listener);
  return () => {
    presetListeners.delete(listener);
  };
}

/**
 * Current custom presets, with a reference that only changes when storage does.
 * Re-parsing on every call would hand useSyncExternalStore a new array each
 * render and loop forever.
 *
 * Frozen, because this array is both the client cache and (when empty) the
 * server snapshot: an in-place edit by one caller would show up as a phantom
 * preset in every component that has none saved. Editing it is a bug, so this
 * makes it throw. Use getCustomPresets() for a list you intend to build on.
 */
export function getCustomPresetsSnapshot(): readonly FractalPreset[] {
  const source = readCustomPresetsSource();

  if (source !== snapshotSource) {
    snapshotSource = source;
    snapshot = Object.freeze(
      source === null ? EMPTY_PRESETS : parseCustomPresets(source),
    );
  }

  return snapshot;
}

/** The server has no localStorage, so it renders as if nothing were saved. */
export function getServerCustomPresetsSnapshot(): readonly FractalPreset[] {
  return EMPTY_PRESETS;
}

export function saveCustomPreset(preset: FractalPreset): void {
  const customPresets = getCustomPresets();
  const existingIndex = customPresets.findIndex((p) => p.id === preset.id);

  if (existingIndex >= 0) {
    customPresets[existingIndex] = preset;
  } else {
    customPresets.push(preset);
  }

  writeCustomPresets(customPresets);
}

export function getCustomPresets(): FractalPreset[] {
  const source = readCustomPresetsSource();
  // A fresh array: callers are free to build on it before saving.
  return source === null ? [] : parseCustomPresets(source);
}

export function deleteCustomPreset(id: string): void {
  const customPresets = getCustomPresets().filter((p) => p.id !== id);
  writeCustomPresets(customPresets);
}

export function getAllPresets(): FractalPreset[] {
  return [...BUILTIN_PRESETS, ...getCustomPresets()];
}
