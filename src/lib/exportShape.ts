/**
 * The wallpaper shapes Download PNG can save the view in, and the frame each
 * one draws.
 *
 * The screen is 4:3 and its sizes are whole multiples of the canvas
 * (`exportSize.ts`). A wallpaper is a real screen's shape at a real screen's
 * pixels: Desktop 16:9, Phone 9:19.5 and Square 1:1.
 *
 * Framing. A shape's frame is the view on screen at the shape's own aspect,
 * with the whole screen view inside it and the extra plane going to the sides
 * or above and below — never cropped away. A shape wider than the screen's 4:3
 * keeps the view's height and gains plane at the sides; a taller one keeps its
 * width and gains plane above and below. So a 16:9 wallpaper of the whole
 * Mandelbrot set shows the whole set, where a frame that kept the width and
 * cut the height would lose the top and bottom of it, and a phone wallpaper
 * keeps the width it was looking at rather than a narrow slice of it.
 *
 * The picture has square pixels: the frame's aspect is the published size's
 * own, so nothing is stretched. The shapes are rounded descriptions — a
 * 1170 x 2532 phone is 9:19.52, not 9:19.5 — so the size's own pixels decide
 * the frame and the shape's nominal aspect is what the shape is called.
 */

import type { FractalBounds } from "../types/fractal";
import { appendToFileName } from "./exportSize";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  MIN_ZOOM,
  calculateZoomBounds,
} from "./mandelbrot";

/** The shape Download PNG opens on: the canvas's own 4:3 view. */
export const SCREEN_SHAPE_ID = "screen";

/**
 * The aspect of the screen view: 4:3, the shape `calculateZoomBounds` draws.
 * The pivot every other shape is framed against.
 */
export const SCREEN_ASPECT = BASE_WIDTH / BASE_HEIGHT;

/** One pixel size a wallpaper shape can be saved at. */
export interface WallpaperSize {
  width: number;
  height: number;
}

/** One shape the Shape select offers. */
export interface ExportShape {
  /** The select's value, and the id the page holds. */
  id: string;
  /** The select's text, naming the shape. */
  label: string;
  /**
   * What the shape contributes to a wallpaper's file name, before the size.
   * The screen ships one for the catalogue's completeness, but its saves keep
   * the names they have always had (`exportFileName`), so the screen's slug is
   * never written.
   */
  slug: string;
  /** The shape as it is named, e.g. 16/9, which the published sizes round. */
  aspect: number;
  /**
   * The sizes this shape is offered at, smallest first. The screen ships none:
   * its sizes are whole multiples of the canvas, which `exportSize.ts` works
   * out from the canvas on screen.
   */
  sizes: WallpaperSize[];
}

/**
 * The shapes, in the order the Shape select shows them: the screen first, which
 * is what the control opens on.
 */
export const EXPORT_SHAPES: readonly ExportShape[] = [
  {
    id: SCREEN_SHAPE_ID,
    label: "Screen (4:3)",
    slug: "4x3",
    aspect: SCREEN_ASPECT,
    sizes: [],
  },
  {
    id: "desktop",
    label: "Desktop 16:9",
    slug: "16x9",
    aspect: 16 / 9,
    sizes: [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 3840, height: 2160 },
    ],
  },
  {
    id: "phone",
    label: "Phone 9:19.5",
    slug: "9x19.5",
    aspect: 9 / 19.5,
    sizes: [
      { width: 1170, height: 2532 },
      { width: 1290, height: 2796 },
    ],
  },
  {
    id: "square",
    label: "Square 1:1",
    slug: "1x1",
    aspect: 1,
    sizes: [
      { width: 1080, height: 1080 },
      { width: 2160, height: 2160 },
    ],
  },
];

/**
 * The shape an id names, or the screen for one this build does not know — the
 * same fallback `resolveFractalKind` gives a fractal.
 *
 * @param id - The id the page holds
 * @returns The shape to draw with
 */
export function exportShapeFor(id: string): ExportShape {
  return EXPORT_SHAPES.find((shape) => shape.id === id) ?? EXPORT_SHAPES[0];
}

/**
 * The region of the plane a picture of a shape draws.
 *
 * The centre is the view's centre and the frame is the aspect it is asked for,
 * so its pixels are square. It always contains the screen's 4:3 view: a shape
 * wider than 4:3 keeps the view's height and widens about it, a taller one
 * keeps its width and heightens about it. The screen's own shape is the bounds
 * the page draws, to the last bit.
 *
 * Zoom and aspect are taken as given when they are usable numbers and replaced
 * by the screen's own where they are not, so a value from outside can never
 * put a NaN or an infinity into the renderer.
 *
 * @param centerX - Real part of the centre
 * @param centerY - Imaginary part of the centre
 * @param zoom - Magnification, 1 being the whole base view
 * @param aspect - Width over height the picture is drawn at
 * @returns The bounds to render
 */
export function exportFrame(
  centerX: number,
  centerY: number,
  zoom: number,
  aspect: number,
): FractalBounds {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : MIN_ZOOM;
  const view = calculateZoomBounds(centerX, centerY, scale);
  const shape = Number.isFinite(aspect) && aspect > 0 ? aspect : SCREEN_ASPECT;

  // The screen's shape: the bounds the page draws already, byte for byte.
  if (shape === SCREEN_ASPECT) return view;

  if (shape > SCREEN_ASPECT) {
    // Wider than the screen: the view's full height is kept and the sides are
    // filled in, so nothing the visitor was looking at is cut off. The social
    // card's `cardBounds` (`ogView.ts`) applies this same rule to its 1.91:1
    // shape; it is not shared because that module is the image route's, and
    // this one is drawn in the browser.
    const halfWidth = ((BASE_HEIGHT / scale) * shape) / 2;

    return {
      minReal: centerX - halfWidth,
      maxReal: centerX + halfWidth,
      minImaginary: view.minImaginary,
      maxImaginary: view.maxImaginary,
    };
  }

  // Taller than the screen: the view's full width is kept and the room goes
  // above and below it.
  const halfHeight = BASE_WIDTH / scale / 2 / shape;

  return {
    minReal: view.minReal,
    maxReal: view.maxReal,
    minImaginary: centerY - halfHeight,
    maxImaginary: centerY + halfHeight,
  };
}

/**
 * The name a wallpaper is saved under: the name the view is saved under, with
 * the shape and the size marked before the extension, so a Desktop 3840 x 2160
 * and a Phone 1170 x 2532 of one view are told apart in a folder. The example
 * the feature names is `_16x9_3840x2160`.
 *
 * The screen shape's own saves keep the names they have always had
 * (`exportFileName`); this is for the shapes that are not the screen.
 *
 * @param name - The name for the view, from `downloadFileName`
 * @param shape - The shape being saved
 * @param width - Width of the picture in pixels
 * @param height - Height of the picture in pixels
 * @returns The filename for the wallpaper
 */
export function wallpaperFileName(
  name: string,
  shape: ExportShape,
  width: number,
  height: number,
): string {
  return appendToFileName(name, `${shape.slug}_${width}x${height}`);
}
