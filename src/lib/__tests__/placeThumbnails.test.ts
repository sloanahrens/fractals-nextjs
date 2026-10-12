import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ColorScheme } from "../../types/fractal";
import { FractalRenderer } from "../fractalRenderer";
import { resolveFractalKind } from "../fractalTypes";
import { autoIterations, calculateZoomBounds } from "../mandelbrot";
import {
  createCanvasThumbnailRender,
  createThumbnailStore,
  type ThumbnailEntry,
  type ThumbnailImage,
  type ThumbnailRenderRequest,
} from "../placeThumbnails";
import { PLACES, placeColorScheme, type Place } from "../places";

const WIDTH = 4;
const HEIGHT = 3;

function place(id: string): Place {
  return {
    id,
    name: id,
    fractal: "mandelbrot",
    centerX: -0.75,
    centerY: 0,
    zoom: 1,
  };
}

function image(fill = 1): ThumbnailImage {
  return {
    width: WIDTH,
    height: HEIGHT,
    data: new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(fill),
  };
}

interface Call {
  request: ThumbnailRenderRequest;
  resolve(result?: ThumbnailImage): void;
  reject(error: unknown): void;
}

/**
 * A render the test finishes by hand: every call is recorded and stays pending
 * until the test resolves or rejects it, so what the store does while a render
 * is in flight can be looked at.
 */
function fakeRender() {
  const calls: Call[] = [];

  const render = (request: ThumbnailRenderRequest) =>
    new Promise<ThumbnailImage>((resolve, reject) => {
      calls.push({
        request,
        resolve: (result = image()) => resolve(result),
        reject,
      });
    });

  return { render, calls, ids: () => calls.map((c) => c.request.place.id) };
}

function newStore(options: { capacity?: number } = {}, fake = fakeRender()) {
  const store = createThumbnailStore({
    render: fake.render,
    width: WIDTH,
    height: HEIGHT,
    ...options,
  });

  return { store, ...fake };
}

/** Let the store's start-of-render timer fire and the render promises settle. */
async function tick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createThumbnailStore", () => {
  describe("rendering and caching", () => {
    it("renders a request at the asked size and hands the entry to onReady", async () => {
      const { store, calls } = newStore();
      const onReady = vi.fn();

      store.request(place("a"), "fire", onReady);
      await tick();

      expect(calls).toHaveLength(1);
      expect(calls[0].request).toMatchObject({
        place: { id: "a" },
        scheme: "fire",
        width: WIDTH,
        height: HEIGHT,
      });
      expect(onReady).not.toHaveBeenCalled();

      const picture = image(7);
      calls[0].resolve(picture);
      await tick();

      expect(onReady).toHaveBeenCalledExactlyOnceWith({
        status: "ready",
        image: picture,
      });
    });

    it("answers a cached entry at once, without rendering again", async () => {
      const { store, calls } = newStore();

      store.request(place("a"), "fire", () => {});
      await tick();
      calls[0].resolve();
      await tick();

      const onReady = vi.fn();
      store.request(place("a"), "fire", onReady);

      // Before any timer runs: the call is synchronous.
      expect(onReady).toHaveBeenCalledTimes(1);
      await tick();
      expect(calls).toHaveLength(1);
    });

    it("keys the cache by scheme as well as by place", async () => {
      const { store, calls } = newStore();

      store.request(place("a"), "fire", () => {});
      await tick();
      calls[0].resolve();
      await tick();

      expect(store.get(place("a"), "fire")?.status).toBe("ready");
      expect(store.get(place("a"), "ocean")).toBeUndefined();

      store.request(place("a"), "ocean", () => {});
      await tick();
      expect(calls).toHaveLength(2);
    });

    it("keys the cache by the scheme's own settings as well as by the scheme", async () => {
      // A reversal or a shift is another picture of the same place, so it is
      // asked for and held apart — which is what keeps a tile the picture a
      // click on it draws.
      const { store, calls } = newStore();
      const reversed = { reverse: true };

      store.request(place("a"), "fire", () => {});
      await tick();
      calls[0].resolve();
      await tick();

      store.request(place("a"), "fire", () => {}, reversed);
      await tick();

      expect(calls).toHaveLength(2);
      expect(calls[0].request.options).toBeUndefined();
      expect(calls[1].request.options).toEqual(reversed);

      calls[1].resolve();
      await tick();

      expect(store.get(place("a"), "fire", reversed)?.status).toBe("ready");
      // A setting a request did not ask for is not the one it was given.
      expect(store.get(place("a"), "fire", { shift: 0.25 })).toBeUndefined();
      // ...and no settings at all is the key the store has always used.
      expect(store.get(place("a"), "fire", {})?.status).toBe("ready");
    });

    it("keys the cache by the orbit trap, and a request with none is the key it always was", async () => {
      const { store, calls } = newStore();

      store.request(place("a"), "fire", () => {});
      await tick();
      calls[0].resolve();
      await tick();

      store.request(place("a"), "fire", () => {}, { trap: "line" });
      await tick();
      expect(calls).toHaveLength(2);
      expect(calls[1].request.options).toEqual({ trap: "line" });
      calls[1].resolve();
      await tick();

      expect(store.get(place("a"), "fire", { trap: "line" })?.status).toBe(
        "ready",
      );
      // Another shape is another picture, and no trap at all is the plain one.
      expect(store.get(place("a"), "fire", { trap: "circle" })).toBeUndefined();
      expect(store.get(place("a"), "fire", { trap: null })?.status).toBe(
        "ready",
      );
      expect(store.get(place("a"), "fire")?.status).toBe("ready");
    });

    it("get is undefined for a place never requested", () => {
      const { store } = newStore();

      expect(store.get(place("a"), "fire")).toBeUndefined();
    });
  });

  describe("LRU eviction", () => {
    async function fill(
      store: ReturnType<typeof newStore>,
      ids: string[],
      scheme: ColorScheme = "fire",
    ) {
      for (const id of ids) {
        store.store.request(place(id), scheme, () => {});
        await tick();
        store.calls[store.calls.length - 1].resolve();
        await tick();
      }
    }

    it("drops the least recently requested picture past capacity", async () => {
      const s = newStore({ capacity: 2 });

      await fill(s, ["a", "b", "c"]);

      expect(s.store.get(place("a"), "fire")).toBeUndefined();
      expect(s.store.get(place("b"), "fire")).toBeDefined();
      expect(s.store.get(place("c"), "fire")).toBeDefined();
    });

    it("counts a get as a use", async () => {
      const s = newStore({ capacity: 2 });

      await fill(s, ["a", "b"]);
      s.store.get(place("a"), "fire");
      await fill(s, ["c"]);

      expect(s.store.get(place("a"), "fire")).toBeDefined();
      expect(s.store.get(place("b"), "fire")).toBeUndefined();
    });

    it("counts a cached request as a use", async () => {
      const s = newStore({ capacity: 2 });

      await fill(s, ["a", "b"]);
      s.store.request(place("a"), "fire", () => {});
      await fill(s, ["c"]);

      expect(s.store.get(place("a"), "fire")).toBeDefined();
      expect(s.store.get(place("b"), "fire")).toBeUndefined();
    });

    it("renders an evicted picture again when it is asked for again", async () => {
      const s = newStore({ capacity: 1 });

      await fill(s, ["a", "b"]);
      s.store.request(place("a"), "fire", () => {});
      await tick();

      expect(s.ids()).toEqual(["a", "b", "a"]);
    });
  });

  describe("in-flight sharing", () => {
    it("runs one render for concurrent requests of a key and tells each caller", async () => {
      const { store, calls } = newStore();
      const first = vi.fn();
      const second = vi.fn();
      const third = vi.fn();

      store.request(place("a"), "fire", first);
      store.request(place("a"), "fire", second);
      await tick();
      // The third arrives while the render is already running.
      store.request(place("a"), "fire", third);
      await tick();

      expect(calls).toHaveLength(1);

      calls[0].resolve();
      await tick();

      expect(calls).toHaveLength(1);
      for (const listener of [first, second, third]) {
        expect(listener).toHaveBeenCalledTimes(1);
      }
    });

    it("does not share between schemes", async () => {
      const { store, calls } = newStore();

      store.request(place("a"), "fire", () => {});
      store.request(place("a"), "ocean", () => {});
      await tick();
      calls[0].resolve();
      await tick();

      expect(calls).toHaveLength(2);
    });
  });

  describe("ordering", () => {
    it("renders one at a time, in the order requested", async () => {
      const { store, calls, ids } = newStore();

      for (const id of ["a", "b", "c"])
        store.request(place(id), "fire", () => {});

      await tick();
      expect(ids()).toEqual(["a"]);

      // A second render waits for the first even when time passes.
      await vi.advanceTimersByTimeAsync(1000);
      expect(ids()).toEqual(["a"]);

      calls[0].resolve();
      await tick();
      expect(ids()).toEqual(["a", "b"]);

      calls[1].resolve();
      await tick();
      expect(ids()).toEqual(["a", "b", "c"]);
    });

    it("starts a render on a timer, not inside the request", () => {
      const { store, calls } = newStore();

      store.request(place("a"), "fire", () => {});

      expect(calls).toHaveLength(0);
    });
  });

  describe("cancelAll", () => {
    it("aborts the render in flight and never calls its onReady", async () => {
      const { store, calls } = newStore();
      const onReady = vi.fn();

      store.request(place("a"), "fire", onReady);
      await tick();
      expect(calls[0].request.signal.aborted).toBe(false);

      store.cancelAll();
      expect(calls[0].request.signal.aborted).toBe(true);

      // The render ignores the signal and finishes anyway.
      calls[0].resolve();
      await tick();

      expect(onReady).not.toHaveBeenCalled();
      expect(store.get(place("a"), "fire")).toBeUndefined();
    });

    it("drops queued work and never calls its onReady", async () => {
      const { store, calls, ids } = newStore();
      const queued = vi.fn();

      store.request(place("a"), "fire", () => {});
      store.request(place("b"), "fire", queued);
      await tick();

      store.cancelAll();
      calls[0].resolve();
      await vi.advanceTimersByTimeAsync(1000);

      expect(ids()).toEqual(["a"]);
      expect(queued).not.toHaveBeenCalled();
    });

    it("drops work that has not started even before the first timer", async () => {
      const { store, calls } = newStore();

      store.request(place("a"), "fire", () => {});
      store.cancelAll();
      await vi.advanceTimersByTimeAsync(1000);

      expect(calls).toHaveLength(0);
    });

    it("leaves cached pictures in place", async () => {
      const { store, calls } = newStore();

      store.request(place("a"), "fire", () => {});
      await tick();
      calls[0].resolve();
      await tick();
      store.cancelAll();

      expect(store.get(place("a"), "fire")?.status).toBe("ready");
    });

    it("lets a later request render the same key afresh, and ignores the aborted render's late result", async () => {
      const { store, calls } = newStore();
      const stale = vi.fn();
      const fresh = vi.fn();

      store.request(place("a"), "fire", stale);
      await tick();
      store.cancelAll();

      store.request(place("a"), "fire", fresh);
      await tick();
      expect(calls).toHaveLength(2);

      // The aborted one limps in last: it must not answer or fill the cache.
      calls[1].resolve(image(9));
      await tick();
      calls[0].resolve(image(1));
      await tick();

      expect(stale).not.toHaveBeenCalled();
      expect(fresh).toHaveBeenCalledTimes(1);
      expect(fresh).toHaveBeenCalledWith({
        status: "ready",
        image: expect.objectContaining({
          data: expect.objectContaining({ 0: 9 }),
        }),
      });
      expect(store.get(place("a"), "fire")).toEqual(
        expect.objectContaining({
          image: expect.objectContaining({
            data: expect.objectContaining({ 0: 9 }),
          }),
        }),
      );
    });

    it("keeps the queue moving after a cancelled render finishes late", async () => {
      const { store, calls, ids } = newStore();

      store.request(place("a"), "fire", () => {});
      await tick();
      store.cancelAll();

      store.request(place("b"), "fire", () => {});
      await tick();
      expect(ids()).toEqual(["a", "b"]);

      store.request(place("c"), "fire", () => {});
      calls[0].resolve(); // the cancelled one, late
      await tick();
      // c waits for b: the late result of a must not free the slot.
      expect(ids()).toEqual(["a", "b"]);

      calls[1].resolve();
      await tick();
      expect(ids()).toEqual(["a", "b", "c"]);
    });
  });

  describe("failure", () => {
    it("caches a flat placeholder and does not retry", async () => {
      const { store, calls } = newStore();
      const onReady = vi.fn();

      store.request(place("a"), "fire", onReady);
      await tick();
      calls[0].reject(new Error("no canvas"));
      await tick();

      const expected: ThumbnailEntry = {
        status: "failed",
        placeholder: {
          width: WIDTH,
          height: HEIGHT,
          color: expect.objectContaining({ r: expect.any(Number) }),
        },
        reason: "no canvas",
      };
      expect(onReady).toHaveBeenCalledWith(expected);
      expect(store.get(place("a"), "fire")).toEqual(expected);

      const again = vi.fn();
      store.request(place("a"), "fire", again);
      await vi.advanceTimersByTimeAsync(1000);

      expect(again).toHaveBeenCalledWith(expected);
      expect(calls).toHaveLength(1);
    });

    it("survives a render that throws before returning a promise", async () => {
      const store = createThumbnailStore({
        render: () => {
          throw new Error("sync boom");
        },
        width: WIDTH,
        height: HEIGHT,
      });
      const onReady = vi.fn();

      store.request(place("a"), "fire", onReady);
      await tick();

      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", reason: "sync boom" }),
      );
    });

    it("treats a render that rejects with a non-error as a failure", async () => {
      const { store, calls } = newStore();

      store.request(place("a"), "fire", () => {});
      await tick();
      calls[0].reject("plain string");
      await tick();

      expect(store.get(place("a"), "fire")).toMatchObject({
        status: "failed",
        reason: "plain string",
      });
    });

    it("treats an image of the wrong size as a failure", async () => {
      const { store, calls } = newStore();

      store.request(place("a"), "fire", () => {});
      await tick();
      calls[0].resolve({
        width: 2,
        height: 2,
        data: new Uint8ClampedArray(16),
      });
      await tick();

      expect(store.get(place("a"), "fire")?.status).toBe("failed");
    });

    it("moves on to the next place after a failure", async () => {
      const { store, calls, ids } = newStore();

      store.request(place("a"), "fire", () => {});
      store.request(place("b"), "fire", () => {});
      await tick();
      calls[0].reject(new Error("x"));
      await tick();

      expect(ids()).toEqual(["a", "b"]);
    });

    it("keeps failure markers outside the LRU", async () => {
      const { store, calls } = newStore({ capacity: 1 });

      store.request(place("bad"), "fire", () => {});
      await tick();
      calls[0].reject(new Error("x"));
      await tick();

      for (const id of ["a", "b"]) {
        store.request(place(id), "fire", () => {});
        await tick();
        calls[calls.length - 1].resolve();
        await tick();
      }

      expect(store.get(place("bad"), "fire")?.status).toBe("failed");
    });
  });

  describe("listeners", () => {
    it("does not let one throwing listener strand the others", async () => {
      const { store, calls } = newStore();
      const after = vi.fn();

      store.request(place("a"), "fire", () => {
        throw new Error("listener boom");
      });
      store.request(place("a"), "fire", after);
      await tick();
      calls[0].resolve();

      // The mistake is rethrown on a timer, so it is not swallowed.
      await expect(vi.advanceTimersByTimeAsync(0)).rejects.toThrow(
        "listener boom",
      );
      expect(after).toHaveBeenCalledTimes(1);
    });
  });

  describe("pause and resume", () => {
    it("starts nothing while paused, then continues in order on resume", async () => {
      const { store, ids } = newStore();

      store.pause();
      store.request(place("a"), "fire", () => {});
      store.request(place("b"), "fire", () => {});
      await vi.advanceTimersByTimeAsync(1000);

      expect(ids()).toEqual([]);

      store.resume();
      await tick();

      expect(ids()).toEqual(["a"]);
    });

    it("holds back a render a request in the same turn had scheduled", async () => {
      const { store, ids } = newStore();

      store.request(place("a"), "fire", () => {});
      store.pause();
      await vi.advanceTimersByTimeAsync(1000);

      expect(ids()).toEqual([]);
    });

    it("lets the render in flight finish but starts no next one", async () => {
      const { store, calls, ids } = newStore();
      const onReady = vi.fn();

      store.request(place("a"), "fire", onReady);
      store.request(place("b"), "fire", () => {});
      await tick();

      store.pause();
      calls[0].resolve();
      await vi.advanceTimersByTimeAsync(1000);

      expect(onReady).toHaveBeenCalledTimes(1);
      expect(calls[0].request.signal.aborted).toBe(false);
      expect(ids()).toEqual(["a"]);

      store.resume();
      await tick();
      expect(ids()).toEqual(["a", "b"]);
    });

    it("still answers cached requests while paused", async () => {
      const { store, calls } = newStore();

      store.request(place("a"), "fire", () => {});
      await tick();
      calls[0].resolve();
      await tick();

      store.pause();
      const onReady = vi.fn();
      store.request(place("a"), "fire", onReady);

      expect(onReady).toHaveBeenCalledTimes(1);
    });

    it("stays paused through cancelAll", async () => {
      const { store, ids } = newStore();

      store.pause();
      store.cancelAll();
      store.request(place("a"), "fire", () => {});
      await vi.advanceTimersByTimeAsync(1000);

      expect(ids()).toEqual([]);
    });

    it("resume with nothing queued does nothing", async () => {
      const { store, ids } = newStore();

      store.resume();
      await vi.advanceTimersByTimeAsync(1000);

      expect(ids()).toEqual([]);
    });
  });

  describe("options", () => {
    it("defaults to 64 x 48", async () => {
      const calls: ThumbnailRenderRequest[] = [];
      const store = createThumbnailStore({
        render: (request) => {
          calls.push(request);
          return new Promise(() => {});
        },
      });

      store.request(place("a"), "fire", () => {});
      await tick();

      expect(calls[0]).toMatchObject({ width: 64, height: 48 });
    });

    it.each([
      ["width", { width: 0 }],
      ["height", { height: 2.5 }],
      ["capacity", { capacity: 0 }],
    ])("refuses a bad %s", (_name, options) => {
      expect(() =>
        createThumbnailStore({
          render: fakeRender().render,
          ...options,
        }),
      ).toThrow(RangeError);
    });
  });
});

describe("createCanvasThumbnailRender", () => {
  // Real timers: FractalRenderer yields on setTimeout while it draws.
  beforeEach(() => {
    vi.useRealTimers();
  });

  /** The same Node stand-in for a 2D canvas the renderer tests use, plus getImageData. */
  function createFakeCanvas(width: number, height: number) {
    const state = {
      width,
      height,
      pixels: new Uint8ClampedArray(width * height * 4),
    };

    const context = {
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      putImageData: (picture: { data: Uint8ClampedArray }) => {
        state.pixels.set(picture.data);
      },
      getImageData: () => ({ data: state.pixels.slice() }),
    };

    return {
      width,
      height,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
  }

  /** The share of pixels whose colour differs from the top-left pixel's. */
  function differingFromCorner(picture: ThumbnailImage): number {
    let differing = 0;

    for (let index = 1; index < picture.width * picture.height; index++) {
      for (let channel = 0; channel < 3; channel++) {
        if (picture.data[index * 4 + channel] !== picture.data[channel]) {
          differing++;
          break;
        }
      }
    }

    return differing / (picture.width * picture.height);
  }

  const byId = (id: string) => {
    const found = PLACES.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`no place ${id}`);
    return found;
  };

  it("renders a Mandelbrot, a Julia and a Burning Ship place as non-blank 64x48 pictures", async () => {
    const store = createThumbnailStore({
      render: createCanvasThumbnailRender(createFakeCanvas),
      width: 64,
      height: 48,
    });
    const places = [
      byId("mandelbrot-seahorse-valley"),
      byId("julia-classic-spirals"),
      byId("burning-ship-hull-and-rigging"),
    ];

    const entries = await Promise.all(
      places.map(
        (candidate) =>
          new Promise<ThumbnailEntry>((resolve) => {
            store.request(
              candidate,
              candidate.colorScheme ?? "classic",
              resolve,
            );
          }),
      ),
    );

    for (const entry of entries) {
      expect(entry.status).toBe("ready");
      if (entry.status !== "ready") continue;

      expect(entry.image.width).toBe(64);
      expect(entry.image.height).toBe(48);
      expect(entry.image.data).toHaveLength(64 * 48 * 4);
      expect(differingFromCorner(entry.image)).toBeGreaterThanOrEqual(0.05);
    }
  });

  /**
   * The picture a click on the place draws, at 64x48: the place's view at the
   * 4:3 shape of the page's canvas, the iteration count Auto picks for its
   * zoom, and the scheme the click sets. Built from the place and the page's
   * own functions, not from the thumbnail render, so the comparison below has
   * two sides.
   */
  async function mainRenderOf(
    candidate: Place,
    current: ColorScheme,
    scheme = placeColorScheme(candidate, current),
  ): Promise<Uint8ClampedArray> {
    const canvas = createFakeCanvas(64, 48);
    const renderer = new FractalRenderer(
      canvas,
      resolveFractalKind(candidate.fractal, candidate.variant ?? ""),
    );

    await renderer.renderFractal(
      {
        bounds: calculateZoomBounds(
          candidate.centerX,
          candidate.centerY,
          candidate.zoom,
        ),
        maxIterations: autoIterations(candidate.zoom),
        width: 64,
        height: 48,
        colorScheme: scheme,
      },
      undefined,
      false,
    );

    return canvas.getContext("2d")!.getImageData(0, 0, 64, 48).data;
  }

  /** The mean absolute difference per colour channel, 0 to 255. */
  function meanChannelDifference(
    first: Uint8ClampedArray,
    second: Uint8ClampedArray,
  ): number {
    let sum = 0;
    let count = 0;

    for (let pixel = 0; pixel < 64 * 48; pixel++) {
      for (let channel = 0; channel < 3; channel++) {
        sum += Math.abs(
          first[pixel * 4 + channel] - second[pixel * 4 + channel],
        );
        count++;
      }
    }

    return sum / count;
  }

  // The tile and the picture a click draws are two renders of one place. At
  // 64x48 they measure 0.00 on every place in the catalogue: same view, same
  // count, same scheme. Before the thumbnail drew at Auto's count it drew at
  // half of it, and the palette position of a pixel is its iteration count
  // over the maximum, so the same comparison measured 3 to 118 per channel.
  // The bound leaves room for nothing but float rounding; anything a viewer
  // could see is far above it.
  const THUMBNAIL_MAIN_DIFFERENCE_BOUND = 1;

  it.each(PLACES.map((candidate) => [candidate.id, candidate] as const))(
    "%s looks like the picture a click on it draws",
    async (_id, candidate) => {
      const render = createCanvasThumbnailRender(createFakeCanvas);
      // The page is in a scheme no place uses by default; a place that names
      // none follows it, and the two sides must follow it alike.
      const current: ColorScheme = "grayscale";
      const thumbnail = await render({
        place: candidate,
        scheme: placeColorScheme(candidate, current),
        width: 64,
        height: 48,
        signal: new AbortController().signal,
      });

      expect(
        meanChannelDifference(
          thumbnail.data,
          await mainRenderOf(candidate, current),
        ),
      ).toBeLessThanOrEqual(THUMBNAIL_MAIN_DIFFERENCE_BOUND);
    },
    30000,
  );

  // A tile in trap mode is the picture a click on it shows in trap mode: the
  // strip is handed the page's trap beside the palette settings, and the click
  // keeps it (`handlePlaceSelect` resets it only for a tour hop or Surprise me).
  it.each(
    (["point", "line", "circle"] as const).flatMap((trap) =>
      [
        "mandelbrot-seahorse-valley",
        "julia-classic-spirals",
        "burning-ship-armada",
      ].map((id) => [id, trap] as const),
    ),
  )(
    "%s in the %s trap looks like the picture a click on it draws",
    async (id, trap) => {
      const candidate = byId(id);
      const scheme = placeColorScheme(candidate, "classic");
      const look = { reverse: true, shift: 0.25, trap } as const;
      const tile = await createCanvasThumbnailRender(createFakeCanvas)({
        place: candidate,
        scheme,
        options: look,
        width: 64,
        height: 48,
        signal: new AbortController().signal,
      });

      const canvas = createFakeCanvas(64, 48);
      await new FractalRenderer(
        canvas,
        resolveFractalKind(candidate.fractal, candidate.variant ?? ""),
      ).renderFractal(
        {
          bounds: calculateZoomBounds(
            candidate.centerX,
            candidate.centerY,
            candidate.zoom,
          ),
          maxIterations: autoIterations(candidate.zoom),
          width: 64,
          height: 48,
          colorScheme: scheme,
          colorOptions: { reverse: true, shift: 0.25 },
          trap,
        },
        undefined,
        false,
      );
      const click = canvas.getContext("2d")!.getImageData(0, 0, 64, 48).data;

      expect(meanChannelDifference(tile.data, click)).toBeLessThanOrEqual(
        THUMBNAIL_MAIN_DIFFERENCE_BOUND,
      );

      // ...and it is not the plain tile, so the look reached the renderer.
      const plain = await createCanvasThumbnailRender(createFakeCanvas)({
        place: candidate,
        scheme,
        options: { reverse: true, shift: 0.25 },
        width: 64,
        height: 48,
        signal: new AbortController().signal,
      });
      expect(meanChannelDifference(tile.data, plain.data)).toBeGreaterThan(1);
    },
    30000,
  );

  it("would notice a tile drawn in the page's scheme instead of the place's", async () => {
    // The bug this guards: the tile in the page's colours, the click in the
    // place's own. Rendering that tile must exceed the bound.
    const candidate = byId("mandelbrot-lightning");
    const render = createCanvasThumbnailRender(createFakeCanvas);
    const wrongTile = await render({
      place: candidate,
      scheme: "grayscale",
      width: 64,
      height: 48,
      signal: new AbortController().signal,
    });

    expect(candidate.colorScheme).not.toBe("grayscale");
    expect(
      meanChannelDifference(
        wrongTile.data,
        await mainRenderOf(candidate, "grayscale"),
      ),
    ).toBeGreaterThan(THUMBNAIL_MAIN_DIFFERENCE_BOUND);
  });

  it("rejects when aborted instead of returning a half-drawn picture", async () => {
    const render = createCanvasThumbnailRender(createFakeCanvas);
    const controller = new AbortController();
    const pending = render({
      place: byId("mandelbrot-seahorse-valley"),
      scheme: "fire",
      width: 64,
      height: 48,
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects at once for a signal already aborted, without making a canvas", async () => {
    const createCanvas = vi.fn(createFakeCanvas);
    const controller = new AbortController();
    controller.abort();

    await expect(
      createCanvasThumbnailRender(createCanvas)({
        place: byId("mandelbrot-whole"),
        scheme: "fire",
        width: 64,
        height: 48,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(createCanvas).not.toHaveBeenCalled();
  });
});
