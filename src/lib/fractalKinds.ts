import { FractalKind } from "../types/fractal";
import { mandelbrotKind } from "./mandelbrot";

// Every fractal the app can draw. Mandelbrot alone today; the next one is an
// entry here plus its own module, and nothing else in the app has to learn
// about it.
export const FRACTAL_KINDS: readonly FractalKind[] = [mandelbrotKind];

/**
 * The kind the app draws when nothing has chosen one: the one fractal this app
 * has always drawn.
 */
export const DEFAULT_FRACTAL_KIND: FractalKind = mandelbrotKind;

/**
 * Look a kind up by id.
 *
 * An id with no kind behind it falls back to the default rather than
 * undefined, so an unknown id (a preset from a future version, say) renders the
 * familiar fractal instead of a blank canvas.
 * @param id - Identifier to look up
 * @returns The kind with that id, or the default kind
 */
export function getFractalKind(id: string): FractalKind {
  return FRACTAL_KINDS.find((kind) => kind.id === id) ?? DEFAULT_FRACTAL_KIND;
}
