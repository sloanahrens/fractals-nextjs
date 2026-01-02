import { FractalBounds, ColorScheme } from "../types/fractal";

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

// Calculate zoom level from fractal bounds
export function calculateZoomLevel(bounds: FractalBounds): number {
  const width = bounds.maxReal - bounds.minReal;
  const initialWidth = 4; // Default view spans from -2 to 2
  return Math.round(initialWidth / width);
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

// Local storage functions for custom presets
export function saveCustomPreset(preset: FractalPreset): void {
  const customPresets = getCustomPresets();
  const existingIndex = customPresets.findIndex((p) => p.id === preset.id);

  if (existingIndex >= 0) {
    customPresets[existingIndex] = preset;
  } else {
    customPresets.push(preset);
  }

  localStorage.setItem("fractal-custom-presets", JSON.stringify(customPresets));
}

export function getCustomPresets(): FractalPreset[] {
  try {
    const stored = localStorage.getItem("fractal-custom-presets");
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error loading custom presets:", error);
    return [];
  }
}

export function deleteCustomPreset(id: string): void {
  const customPresets = getCustomPresets().filter((p) => p.id !== id);
  localStorage.setItem("fractal-custom-presets", JSON.stringify(customPresets));
}

export function getAllPresets(): FractalPreset[] {
  return [...BUILTIN_PRESETS, ...getCustomPresets()];
}
