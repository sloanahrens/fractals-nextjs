import { ColorOptions, ColorRGB, ColorScheme } from "../types/fractal";

/**
 * Map iteration count to a color based on the selected color scheme
 * @param iterations - Number of iterations (can be float for smooth coloring)
 * @param maxIterations - Maximum iteration count
 * @param scheme - Color scheme to use
 * @param options - Reverse and shift of the scheme; nothing for the scheme as
 *   the app has always drawn it
 * @returns RGB color values
 */
export function mapIterationsToColor(
  iterations: number,
  maxIterations: number,
  scheme: ColorScheme = "classic",
  options?: ColorOptions,
): ColorRGB {
  // Points in the set are black. This is decided before the palette options,
  // and is not a place on the palette they move along: a point that never
  // escaped is the same black reversed or shifted as it is as it is.
  if (iterations >= maxIterations) {
    return { r: 0, g: 0, b: 0 };
  }

  // Normalize iterations to 0-1 range
  return mapPositionToColor(iterations / maxIterations, scheme, options);
}

/**
 * Map a place on the palette to a colour: the part of the mapping that does not
 * care what the place stands for, so an iteration count and an orbit trap's
 * distance go through the same scheme, Reverse and Shift.
 *
 * {@link mapIterationsToColor} is the black test and the division by the cap,
 * then this; `colorMapping.test.ts` holds the pair byte for byte.
 * @param position - Place on the palette, 0 to 1 (a trap picture holds it
 *   inside `TRAP_POSITION_MIN`..`TRAP_POSITION_MAX`)
 * @param scheme - Color scheme to use
 * @param options - Reverse and shift of the scheme; nothing for the scheme as
 *   the app has always drawn it
 * @returns RGB color values
 */
export function mapPositionToColor(
  position: number,
  scheme: ColorScheme = "classic",
  options?: ColorOptions,
): ColorRGB {
  let normalizedIterations = position;

  // The two palette options, in this order: the scheme is reversed and then
  // shifted, so a reversed scheme started a quarter of the way round is the
  // mirror of that scheme started a quarter of the way round, which is what a
  // visitor setting one and then the other sees. Neither one is applied at all
  // when it is asking for the place it is already at, so a caller passing
  // nothing, or `reverse: false` and `shift: 0`, gets the very number the
  // mapping has always been given — and so the very colours.
  if (options?.reverse) normalizedIterations = 1 - normalizedIterations;
  const shift = options?.shift;
  if (shift !== undefined && Number.isFinite(shift) && shift !== 0) {
    // Modulo a whole turn: the palette is a loop, and starting a hundredth of a
    // turn past its end is starting that hundredth of a turn into it.
    const shifted = normalizedIterations + shift;
    normalizedIterations = shifted - Math.floor(shifted);
  }

  switch (scheme) {
    case "classic":
      return classicColorScheme(normalizedIterations);
    case "fire":
      return fireColorScheme(normalizedIterations);
    case "ocean":
      return oceanColorScheme(normalizedIterations);
    case "rainbow":
      return rainbowColorScheme(normalizedIterations);
    case "grayscale":
      return grayscaleColorScheme(normalizedIterations);
    default:
      return classicColorScheme(normalizedIterations);
  }
}

function classicColorScheme(t: number): ColorRGB {
  // Classic blue to red gradient with yellow highlights
  const r = Math.floor(255 * Math.sin(Math.PI * t * 3) ** 2);
  const g = Math.floor(255 * Math.sin(Math.PI * t * 5 + Math.PI / 3) ** 2);
  const b = Math.floor(
    255 * Math.sin(Math.PI * t * 7 + (2 * Math.PI) / 3) ** 2,
  );

  return { r, g, b };
}

function fireColorScheme(t: number): ColorRGB {
  // Fire-like colors: black -> red -> orange -> yellow -> white
  if (t < 0.25) {
    const intensity = t * 4;
    return {
      r: Math.floor(255 * intensity),
      g: 0,
      b: 0,
    };
  } else if (t < 0.5) {
    const intensity = (t - 0.25) * 4;
    return {
      r: 255,
      g: Math.floor(165 * intensity),
      b: 0,
    };
  } else if (t < 0.75) {
    const intensity = (t - 0.5) * 4;
    return {
      r: 255,
      g: Math.floor(165 + 90 * intensity),
      b: Math.floor(255 * intensity),
    };
  } else {
    const intensity = (t - 0.75) * 4;
    return {
      r: 255,
      g: 255,
      b: Math.floor(255 + intensity * 0), // Cap at 255
    };
  }
}

function oceanColorScheme(t: number): ColorRGB {
  // Ocean-like colors: dark blue -> cyan -> light blue -> white
  const r = Math.floor(255 * Math.pow(t, 3));
  const g = Math.floor(255 * Math.pow(t, 1.5));
  const b = Math.floor(255 * (0.3 + 0.7 * t));

  return { r, g, b };
}

function rainbowColorScheme(t: number): ColorRGB {
  // HSV rainbow mapped to RGB
  const hue = t * 360;
  return hsvToRgb(hue, 1, 1);
}

function grayscaleColorScheme(t: number): ColorRGB {
  // Simple grayscale gradient
  const intensity = Math.floor(255 * t);
  return { r: intensity, g: intensity, b: intensity };
}

/**
 * Convert HSV color values to RGB
 * @param h - Hue (0-360)
 * @param s - Saturation (0-1)
 * @param v - Value (0-1)
 * @returns RGB color values
 */
function hsvToRgb(h: number, s: number, v: number): ColorRGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 300 && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: Math.floor((r + m) * 255),
    g: Math.floor((g + m) * 255),
    b: Math.floor((b + m) * 255),
  };
}

/**
 * Get all available color schemes
 */
export function getAvailableColorSchemes(): {
  value: ColorScheme;
  label: string;
}[] {
  return [
    { value: "classic", label: "Classic" },
    { value: "fire", label: "Fire" },
    { value: "ocean", label: "Ocean" },
    { value: "rainbow", label: "Rainbow" },
    { value: "grayscale", label: "Grayscale" },
  ];
}
