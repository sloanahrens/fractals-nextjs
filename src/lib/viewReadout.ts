/**
 * The one line that says where the view is: "Zoom 400x at -0.7453, 0.1127".
 *
 * It sits above the coordinate boxes in the Settings drawer and is the only
 * place the drawer prints the centre and zoom as text, now that the Center
 * sliders and the View Info card are gone. The numbers are rounded the way the
 * boxes below it round them (`formatCoordinate`, six significant digits) so
 * the line and the boxes never disagree about the same view, and the zoom is
 * `formatZoom`, which the Zoom Level slider's label already uses.
 */

import { FractalBounds } from "../types/fractal";
import { calculateCenter, calculateZoomLevel, formatZoom } from "./presets";
import { formatCoordinate } from "./zoomScale";

/**
 * The view as a read-out line.
 *
 * @param bounds - The view on screen
 * @returns The zoom and the centre, as one short sentence
 */
export function describeView(bounds: FractalBounds): string {
  const center = calculateCenter(bounds);

  return `Zoom ${formatZoom(calculateZoomLevel(bounds))}x at ${formatCoordinate(center.x)}, ${formatCoordinate(center.y)}`;
}
