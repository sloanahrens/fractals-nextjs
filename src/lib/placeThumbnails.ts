import type { ColorRGB, ColorScheme } from "../types/fractal";
import { FractalRenderer } from "./fractalRenderer";
import { resolveFractalKind } from "./fractalTypes";
import {
  autoIterations,
  calculateZoomBounds,
  MIN_ITERATIONS,
} from "./mandelbrot";
import type { Place } from "./places";

/** A rendered thumbnail: RGBA pixels, row by row, ready for `putImageData`. */
export interface ThumbnailImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * What the strip draws in place of a picture that could not be rendered: one
 * flat colour over the thumbnail's size. A descriptor rather than pixels, so a
 * failure costs no memory and the strip can fill a rectangle with it.
 */
export interface ThumbnailPlaceholder {
  width: number;
  height: number;
  color: ColorRGB;
}

/** What the store holds for a place in a colour scheme. */
export type ThumbnailEntry =
  | { status: "ready"; image: ThumbnailImage }
  | {
      status: "failed";
      placeholder: ThumbnailPlaceholder;
      /** Why the render failed, for whoever is debugging; never shown. */
      reason: string;
    };

/** What the injected renderer is asked for. */
export interface ThumbnailRenderRequest {
  place: Place;
  scheme: ColorScheme;
  width: number;
  height: number;
  /** Aborted by `cancelAll`; a render that sees it should stop early. */
  signal: AbortSignal;
}

/**
 * Draws one thumbnail. It may reject, and may ignore the signal: the store
 * discards the result of a render it has aborted whether or not the render
 * noticed.
 */
export type ThumbnailRender = (
  request: ThumbnailRenderRequest,
) => Promise<ThumbnailImage>;

/** Called once with the entry a request ended on, a failure marker included. */
export type ThumbnailListener = (entry: ThumbnailEntry) => void;

export interface ThumbnailStoreOptions {
  render: ThumbnailRender;
  /** Thumbnail width in pixels. */
  width?: number;
  /** Thumbnail height in pixels. */
  height?: number;
  /** How many rendered pictures the cache keeps; the least recently used goes first. */
  capacity?: number;
}

export interface ThumbnailStore {
  /**
   * Ask for a place's thumbnail. A cached entry, a failure marker included,
   * calls `onReady` before this returns. Otherwise the request joins the render
   * of that key already queued or running, or queues one, and `onReady` is
   * called when it ends. `cancelAll` drops the request without calling it.
   */
  request(place: Place, scheme: ColorScheme, onReady: ThumbnailListener): void;
  /**
   * Drop every queued render, abort the one in flight, and never call the
   * `onReady` of anything dropped. Cached entries stay, and the store stays
   * usable: the next `request` starts fresh.
   */
  cancelAll(): void;
  /**
   * The entry already held, or undefined. A hit counts as a use, so a picture
   * the strip keeps drawing is not the one evicted. Never throws.
   */
  get(place: Place, scheme: ColorScheme): ThumbnailEntry | undefined;
  /**
   * Stop starting renders. A render already running finishes: it is a few
   * thousand pixels, so aborting it would cost more than it saves.
   */
  pause(): void;
  /** Start renders again, in the order they were requested. */
  resume(): void;
}

export const DEFAULT_THUMBNAIL_WIDTH = 64;
export const DEFAULT_THUMBNAIL_HEIGHT = 48;
export const DEFAULT_THUMBNAIL_CAPACITY = 120;

/** The mid grey a failed thumbnail is drawn as. */
const PLACEHOLDER_COLOR: ColorRGB = { r: 128, g: 128, b: 128 };

interface Job {
  key: string;
  place: Place;
  scheme: ColorScheme;
  listeners: ThumbnailListener[];
  controller: AbortController | undefined;
  cancelled: boolean;
}

function requirePositiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }

  return value;
}

function isImageOfSize(
  image: ThumbnailImage,
  width: number,
  height: number,
): boolean {
  return (
    image !== null &&
    typeof image === "object" &&
    image.width === width &&
    image.height === height &&
    image.data instanceof Uint8ClampedArray &&
    image.data.length === width * height * 4
  );
}

/**
 * A cache and a queue of place thumbnails.
 *
 * Renders run one at a time, in the order requested, and each starts on its own
 * macrotask: the browser gets a turn between two pictures, and a `pause()`
 * made in the same turn as a request lands before anything is drawn. Results
 * are cached by place id and colour scheme. A failed render is remembered for
 * the life of the store, outside the LRU, so a place that cannot be drawn is
 * not retried every time the strip scrolls past it.
 *
 * The store owns no canvas and reads no clock: `render` is injected, which is
 * what lets the tests drive it with a fake. `createCanvasThumbnailRender` is
 * the real one.
 */
export function createThumbnailStore({
  render,
  width = DEFAULT_THUMBNAIL_WIDTH,
  height = DEFAULT_THUMBNAIL_HEIGHT,
  capacity = DEFAULT_THUMBNAIL_CAPACITY,
}: ThumbnailStoreOptions): ThumbnailStore {
  requirePositiveInteger("width", width);
  requirePositiveInteger("height", height);
  requirePositiveInteger("capacity", capacity);

  const placeholder: ThumbnailPlaceholder = {
    width,
    height,
    color: PLACEHOLDER_COLOR,
  };

  // Map iteration order is insertion order, so the first key is the least
  // recently used when every use deletes and re-inserts its key.
  const ready = new Map<string, ThumbnailEntry>();
  const failed = new Map<string, ThumbnailEntry>();
  // Every request not yet answered: queued jobs and the one running.
  const pending = new Map<string, Job>();
  let queue: Job[] = [];
  let running: Job | undefined;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const keyOf = (place: Place, scheme: ColorScheme) => `${place.id}|${scheme}`;

  function remember(key: string, entry: ThumbnailEntry): void {
    ready.delete(key);
    ready.set(key, entry);

    while (ready.size > capacity) {
      const oldest = ready.keys().next();
      if (oldest.done) break;
      ready.delete(oldest.value);
    }
  }

  function lookup(key: string): ThumbnailEntry | undefined {
    const held = ready.get(key);

    if (held) {
      ready.delete(key);
      ready.set(key, held);
      return held;
    }

    return failed.get(key);
  }

  function schedulePump(): void {
    if (timer !== undefined || paused || running || queue.length === 0) return;

    timer = setTimeout(() => {
      timer = undefined;
      start();
    }, 0);
  }

  function start(): void {
    if (paused || running) return;

    const job = queue.shift();
    if (!job) return;

    running = job;
    job.controller = new AbortController();
    void run(job, job.controller.signal);
  }

  async function run(job: Job, signal: AbortSignal): Promise<void> {
    let entry: ThumbnailEntry;

    try {
      const image = await render({
        place: job.place,
        scheme: job.scheme,
        width,
        height,
        signal,
      });

      entry = isImageOfSize(image, width, height)
        ? { status: "ready", image }
        : {
            status: "failed",
            placeholder,
            reason: "the render did not return an image of the asked size",
          };
    } catch (error) {
      entry = {
        status: "failed",
        placeholder,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    // cancelAll has already forgotten this job, and `running` may belong to a
    // newer one by now, so a cancelled job touches nothing.
    if (job.cancelled) return;

    if (entry.status === "ready") remember(job.key, entry);
    else failed.set(job.key, entry);

    pending.delete(job.key);
    running = undefined;
    schedulePump();

    for (const listener of job.listeners) notify(listener, entry);
  }

  // One listener's mistake must not strand the listeners after it, or stall the
  // queue behind it. It is rethrown on a timer so that it still surfaces.
  function notify(listener: ThumbnailListener, entry: ThumbnailEntry): void {
    try {
      listener(entry);
    } catch (error) {
      setTimeout(() => {
        throw error;
      }, 0);
    }
  }

  return {
    request(place, scheme, onReady) {
      const key = keyOf(place, scheme);
      const held = lookup(key);

      if (held) {
        onReady(held);
        return;
      }

      const inFlight = pending.get(key);

      if (inFlight) {
        inFlight.listeners.push(onReady);
        return;
      }

      const job: Job = {
        key,
        place,
        scheme,
        listeners: [onReady],
        controller: undefined,
        cancelled: false,
      };

      pending.set(key, job);
      queue.push(job);
      schedulePump();
    },

    cancelAll() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }

      for (const job of pending.values()) job.cancelled = true;

      running?.controller?.abort();
      pending.clear();
      queue = [];
      running = undefined;
    },

    get(place, scheme) {
      return lookup(keyOf(place, scheme));
    },

    pause() {
      paused = true;

      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },

    resume() {
      paused = false;
      schedulePump();
    },
  };
}

/**
 * The iteration count a thumbnail is drawn at: half of what Auto picks for the
 * zoom, never under the slider's floor. Sixty-four columns cannot show the
 * filigree the last iterations resolve, so a thumbnail pays for the structure
 * that survives at its size and not for the rest.
 */
export function thumbnailIterations(zoom: number): number {
  return Math.max(MIN_ITERATIONS, Math.round(autoIterations(zoom) / 2));
}

/** The part of a canvas the thumbnail render needs, which an off-screen one has too. */
type ThumbnailCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * An off-screen canvas where the browser has one, else a detached element that
 * is never attached to the page.
 */
function createOffscreenCanvas(width: number, height: number): ThumbnailCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== "undefined") {
    const element = document.createElement("canvas");
    element.width = width;
    element.height = height;
    return element;
  }

  throw new Error("No canvas is available to draw a thumbnail on");
}

function abortError(): Error {
  const error = new Error("The thumbnail render was aborted");
  error.name = "AbortError";
  return error;
}

/**
 * The real `render` for `createThumbnailStore`: draw the place with
 * `FractalRenderer` on a canvas of its own and read the pixels back.
 *
 * Each call makes its own canvas and renderer, so two renders never share a run
 * token and an aborted one cannot paint over the next. An abort stops the
 * renderer at its next row and rejects, because what it painted so far is not
 * a thumbnail.
 * @param createCanvas - Where to draw; the default is an off-screen canvas
 * with a detached element as fallback, and a test passes a stand-in
 */
export function createCanvasThumbnailRender(
  createCanvas: (
    width: number,
    height: number,
  ) => ThumbnailCanvas = createOffscreenCanvas,
): ThumbnailRender {
  return async ({ place, scheme, width, height, signal }) => {
    if (signal.aborted) throw abortError();

    const canvas = createCanvas(width, height);
    const renderer = new FractalRenderer(
      canvas as HTMLCanvasElement,
      resolveFractalKind(place.fractal, place.juliaConstant ?? ""),
    );
    const stop = () => renderer.cancelRender();

    signal.addEventListener("abort", stop, { once: true });

    try {
      await renderer.renderFractal(
        {
          bounds: calculateZoomBounds(place.centerX, place.centerY, place.zoom),
          maxIterations: thumbnailIterations(place.zoom),
          width,
          height,
          colorScheme: scheme,
        },
        undefined,
        false,
      );
    } finally {
      signal.removeEventListener("abort", stop);
    }

    if (signal.aborted) throw abortError();

    const context = canvas.getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

    if (!context) throw new Error("Could not get 2D rendering context");

    const { data } = context.getImageData(0, 0, width, height);

    return { width, height, data };
  };
}
