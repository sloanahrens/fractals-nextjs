import { FractalBounds, ColorScheme } from "../types/fractal";
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
}

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
    bounds: {
      minReal: -0.76,
      maxReal: -0.74,
      minImaginary: 0.09,
      maxImaginary: 0.11,
    },
    maxIterations: 200,
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
    bounds: {
      minReal: 0.24,
      maxReal: 0.26,
      minImaginary: -0.01,
      maxImaginary: 0.01,
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

function parseCustomPresets(source: string): FractalPreset[] {
  try {
    return JSON.parse(source);
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
