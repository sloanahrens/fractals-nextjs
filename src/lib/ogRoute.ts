/**
 * The request handler behind `GET /api/og`, with everything it depends on
 * injectable.
 *
 * `src/app/api/og/route.ts` is a one-line shell over {@link createOgHandler}:
 * a Next route file may export nothing but its handlers and config, and the
 * policy here (which request is a 400, which is a 503, what is cached) wants a
 * test that builds a handler around a fake clock, a fake renderer and a
 * cache and gate of its own. See `ogView.ts` for what a query means and
 * `ogLimits.ts` for the limits.
 *
 * An answer to a request is one of:
 *
 * - 400, a short text body, when the query is not a view. No work is done.
 * - 200, the PNG, from the cache or freshly drawn. Both carry
 *   `Cache-Control: public, max-age=31536000, immutable`: the URL names the
 *   picture exactly, so it never changes.
 * - 503 with `Retry-After: 2` when the gate's line is full.
 * - 503 without it when a render ran past its budget: asking again would spend
 *   the same time for the same answer.
 * - 500 for anything unexpected, with no detail in the body.
 *
 * Two requests for one view at once share a single render (they need not queue
 * behind each other), which is what a link unfurled by several services at the
 * same moment would otherwise cost.
 *
 * Node only: the default renderer encodes with `node:zlib`.
 */

import type { OgView } from "./ogView";
import { OG_HEIGHT, OG_WIDTH, parseOgQuery } from "./ogView";
import {
  BudgetExceededError,
  GateFullError,
  LruCache,
  OG_CACHE_ENTRIES,
  OG_RENDER_BUDGET_MS,
  RenderGate,
  startBudget,
} from "./ogLimits";
import { encodePng } from "./pngEncode";
import { BYTES_PER_PIXEL, renderRgbaRows } from "./renderRgba";

/** The `Cache-Control` of a 200: the URL is the picture, so it is forever. */
export const OG_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** The `Retry-After` of a turned-away request, in seconds. */
export const OG_RETRY_AFTER_SECONDS = 2;

/** Rows drawn between a look at the clock and a turn for the event loop. */
const ROWS_PER_SLICE = 6;

/** Draws a view as the bytes of a PNG, calling `checkBudget` as it goes. */
export type OgRender = (
  view: OgView,
  checkBudget: () => void,
  yieldToEventLoop: () => Promise<void>,
) => Promise<Buffer>;

/**
 * The real renderer: the shared row function in slices, so the event loop (and
 * so `/api/health`) is served between them and the budget is checked, then the
 * encoder.
 */
export const renderOgPng: OgRender = async (
  view,
  checkBudget,
  yieldToEventLoop,
) => {
  const pixels = new Uint8ClampedArray(OG_WIDTH * OG_HEIGHT * BYTES_PER_PIXEL);
  const rowBytes = OG_WIDTH * BYTES_PER_PIXEL;

  for (let first = 0; first < OG_HEIGHT; first += ROWS_PER_SLICE) {
    const end = Math.min(first + ROWS_PER_SLICE, OG_HEIGHT);

    renderRgbaRows(
      pixels.subarray(first * rowBytes, end * rowBytes),
      first,
      end,
      view.bounds,
      OG_WIDTH,
      OG_HEIGHT,
      view.maxIterations,
      view.colorScheme,
      view.kind,
      true,
      view.colorOptions,
    );

    checkBudget();
    await yieldToEventLoop();
  }

  return encodePng(pixels, OG_WIDTH, OG_HEIGHT);
};

/** What a handler is built from; every part has a real default. */
export interface OgDeps {
  cache?: LruCache<Buffer>;
  gate?: RenderGate;
  /** Milliseconds on any origin; `performance.now` by default. */
  now?: () => number;
  /** A turn for the event loop; a macrotask by default (setImmediate). */
  yieldToEventLoop?: () => Promise<void>;
  budgetMs?: number;
  render?: OgRender;
}

function text(status: number, body: string, headers: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function png(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
      "Cache-Control": OG_CACHE_CONTROL,
    },
  });
}

/**
 * Build the handler for `GET /api/og`.
 *
 * @param deps - Replacements for the cache, the gate, the clock, the waiting
 *   and the renderer; the route passes none
 * @returns A function from a request to its response; it never throws
 */
export function createOgHandler(
  deps: OgDeps = {},
): (request: Request) => Promise<Response> {
  const cache = deps.cache ?? new LruCache<Buffer>(OG_CACHE_ENTRIES);
  const gate = deps.gate ?? new RenderGate();
  const now = deps.now ?? (() => performance.now());
  const yieldToEventLoop =
    deps.yieldToEventLoop ?? (() => new Promise((r) => setImmediate(r)));
  const budgetMs = deps.budgetMs ?? OG_RENDER_BUDGET_MS;
  const render = deps.render ?? renderOgPng;
  const inFlight = new Map<string, Promise<Buffer>>();

  /** One render of `view` through the gate, shared by every caller for it. */
  function draw(view: OgView): Promise<Buffer> {
    const existing = inFlight.get(view.key);
    if (existing) return existing;

    const drawing = gate
      .run(async () => {
        const bytes = await render(view, startBudget(now, budgetMs), () =>
          yieldToEventLoop(),
        );
        cache.set(view.key, bytes);
        return bytes;
      })
      .finally(() => inFlight.delete(view.key));
    inFlight.set(view.key, drawing);

    return drawing;
  }

  return async function handle(request: Request): Promise<Response> {
    try {
      const parsed = parseOgQuery(new URL(request.url).search);
      if (!parsed.ok) return text(400, parsed.message);

      const cached = cache.get(parsed.view.key);
      if (cached) return png(cached);

      return png(await draw(parsed.view));
    } catch (error) {
      if (error instanceof GateFullError) {
        return text(503, "Busy: try again in a moment.", {
          "Retry-After": String(OG_RETRY_AFTER_SECONDS),
        });
      }
      if (error instanceof BudgetExceededError) {
        return text(503, "That view took too long to draw.");
      }

      console.error("GET /api/og failed:", error);
      return text(500, "Could not draw that view.");
    }
  };
}
