// Core fractal types and interfaces

export interface ComplexNumber {
  real: number;
  imaginary: number;
}

export interface FractalBounds {
  minReal: number;
  maxReal: number;
  minImaginary: number;
  maxImaginary: number;
}

export interface FractalConfig {
  bounds: FractalBounds;
  maxIterations: number;
  width: number;
  height: number;
  colorScheme: ColorScheme;
}

export interface RenderPoint {
  x: number;
  y: number;
  iterations: number;
}

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export type ColorScheme =
  | "classic"
  | "fire"
  | "ocean"
  | "rainbow"
  | "grayscale";

export interface ZoomState {
  centerX: number;
  centerY: number;
  scale: number;
}

export interface PanState {
  isDragging: boolean;
  lastX: number;
  lastY: number;
}
