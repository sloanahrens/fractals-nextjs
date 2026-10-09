import { FractalBounds, ColorScheme } from "../types/fractal";
import { FRACTAL_TYPES } from "./fractalTypes";
import { JULIA_CONSTANTS } from "./julia";
import { boundsToView } from "./mandelbrot";

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
  /** Julia constant this view was saved against; read only for a Julia view. */
  juliaConstant?: string;
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
 * The zoom is exact, and exact is not printable: a notch of the wheel moves
 * the view by a hair over 10%, and the bounds a zoom is read from carry float
 * error in their last digits. So show enough to see the view move (1.1x,
 * 1.21x), drop the noise, and use the K/M shorthand once the digits get long.
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

// Calculate center point from bounds
export function calculateCenter(bounds: FractalBounds): {
  x: number;
  y: number;
} {
  return {
    x: (bounds.minReal + bounds.maxReal) / 2,
    y: (bounds.minImaginary + bounds.maxImaginary) / 2,
  };
}

// Get preset by ID
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
 * A view belongs to the fractal on the canvas when it is saved, and the
 * constant belongs to a Julia view and to nothing else: a Mandelbrot or Burning
 * Ship entry gets no `juliaConstant` key at all, so its stored JSON stays the
 * shape it had before this field existed.
 * @param fractalId - Id of the fractal on the canvas
 * @param juliaConstantName - Constant on the canvas; written only for Julia
 * @returns The fields to merge into the saved preset
 */
export function presetFractalFields(
  fractalId: string,
  juliaConstantName: string,
): { fractal: string; juliaConstant?: string } {
  return fractalId === "julia"
    ? { fractal: fractalId, juliaConstant: juliaConstantName }
    : { fractal: fractalId };
}

/**
 * The Julia constant a view names.
 *
 * A preset that names a constant this build no longer offers cannot be loaded
 * as written: the picker would sit on a name it has no option for. The first
 * constant is what `resolveFractalKind` draws for such a name, so naming it
 * here keeps the select and the canvas describing the same picture.
 */
export function presetJuliaConstant(preset: FractalPreset): string {
  const named = JULIA_CONSTANTS.some(
    (constant) => constant.name === preset.juliaConstant,
  );

  return named ? (preset.juliaConstant as string) : JULIA_CONSTANTS[0].name;
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
