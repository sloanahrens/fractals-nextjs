import { formatZoom } from "./presets";

// A filename is a label the user reads in a downloads folder, so the
// coordinates carry enough digits to tell two nearby views apart without
// dragging a double's worth of digits into the name.
const COORDINATE_PRECISION = 6;

// The characters a filename may hold without quoting, on every filesystem the
// download might land on.
const UNSAFE_FILENAME_CHARACTERS = /[^A-Za-z0-9._-]/g;

function formatCoordinate(value: number): string {
  // toPrecision gives the significant digits; going back through Number drops
  // the zeros it pads with, so -0.75 stays "-0.75" rather than "-0.750000".
  return Number(value.toPrecision(COORDINATE_PRECISION)).toString();
}

/**
 * The name a downloaded render is saved under: what was drawn and the view it
 * shows, so a folder full of them stays legible. The zoom is formatted the way
 * the Zoom Level readout formats it, so 175 saves as 175x, 1.5 as 1.5x and
 * 2000 as 2.0Kx.
 * @param centerX - Centre of the rendered view
 * @param centerY - Centre of the rendered view
 * @param zoom - Zoom of the rendered view
 * @param prefix - What was drawn, as the first word of the name
 * @returns The filename for the download
 */
export function downloadFileName(
  centerX: number,
  centerY: number,
  zoom: number,
  prefix: string = "mandelbrot",
): string {
  const name = [
    prefix,
    formatCoordinate(centerX),
    formatCoordinate(centerY),
    `${formatZoom(zoom)}x`,
  ]
    .join("_")
    // Nothing above is expected to produce a space, a slash or anything else
    // a filesystem may object to, but the name is built from numbers the user
    // can reach, so the last step is the one that guarantees it.
    .replace(UNSAFE_FILENAME_CHARACTERS, "-");

  return `${name}.png`;
}
