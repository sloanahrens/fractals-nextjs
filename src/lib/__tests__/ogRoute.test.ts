import { afterEach, describe, expect, it, vi } from "vitest";

import { LruCache, RenderGate } from "../ogLimits";
import { OG_HEIGHT, OG_WIDTH, parseOgQuery } from "../ogView";
import {
  OG_CACHE_CONTROL,
  createOgHandler,
  renderOgPng,
  type OgRender,
} from "../ogRoute";
import { encodePng } from "../pngEncode";
import { renderRgba } from "../renderRgba";

const URL_BASE = "http://localhost:3000/api/og";

/** A request for the card of a view, one view per zoom. */
const request = (zoom: number | string = 1, extra = "") =>
  new Request(`${URL_BASE}?v=1&f=mandelbrot&x=-0.75&y=0&z=${zoom}${extra}`);

/** A promise a test settles by hand. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A renderer that answers at once with bytes naming the view. */
function instantRender() {
  const render = vi.fn<OgRender>(async (view) =>
    Buffer.from(`png:${view.key}`),
  );
  return render;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a request that is not a view", () => {
  it.each([
    ["no query", URL_BASE],
    ["an empty query", `${URL_BASE}?`],
    ["a version and nothing else", `${URL_BASE}?v=1`],
    ["another version", `${URL_BASE}?v=2&f=julia`],
    ["a view with no version", `${URL_BASE}?f=julia&x=0.1`],
    ["an unreadable coordinate", `${URL_BASE}?v=1&x=abc`],
    ["an exponent", `${URL_BASE}?v=1&x=1e3`],
    ["a hostile value", `${URL_BASE}?v=1&f=%3Cscript%3E&x=../../etc/passwd`],
    ["an unknown fractal", `${URL_BASE}?v=1&f=lyapunov`],
    ["a count out of range", `${URL_BASE}?v=1&i=100000`],
    ["a very long value", `${URL_BASE}?v=1&x=${"9".repeat(5000)}`],
    ["a bare percent sign", `${URL_BASE}?%`],
  ])(
    "is a 400 with a short text body and no rendering: %s",
    async (_n, url) => {
      const render = instantRender();
      const gate = new RenderGate();
      const handle = createOgHandler({ render, gate });

      const response = await handle(new Request(url));

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.text();
      expect(body.length).toBeGreaterThan(0);
      expect(body.length).toBeLessThan(120);
      expect(body).not.toContain("script");
      expect(render).not.toHaveBeenCalled();
      expect(gate.busy).toBe(false);
    },
  );
});

describe("a valid view", () => {
  it("is a 200 PNG that is cacheable for a year and immutable", async () => {
    const handle = createOgHandler({ render: instantRender() });

    const response = await handle(request(3));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(OG_CACHE_CONTROL).toBe("public, max-age=31536000, immutable");
    const body = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get("content-length")).toBe(String(body.length));
    expect(body.toString()).toContain("png:v=1&f=mandelbrot");
  });

  it("hands the renderer the view the query names", async () => {
    const render = instantRender();
    const handle = createOgHandler({ render });

    await handle(request(400));

    const view = render.mock.calls[0][0];
    expect(view.maxIterations).toBe(400);
    expect(view.kind.id).toBe("mandelbrot");
    expect(view.key).toBe("v=1&f=mandelbrot&x=-0.75&y=0&z=400&s=classic&i=400");
  });

  it("is answered from the cache the second time, spelled however", async () => {
    const render = instantRender();
    const handle = createOgHandler({ render });

    const first = await handle(request(3));
    const again = await handle(request(3));
    const respelled = await handle(
      new Request(
        `${URL_BASE}?z=3.0&y=0.0&x=-0.750&f=mandelbrot&v=1&w=800&h=600`,
      ),
    );

    expect(render).toHaveBeenCalledTimes(1);
    expect(again.status).toBe(200);
    expect(again.headers.get("cache-control")).toBe(OG_CACHE_CONTROL);
    expect(await again.text()).toBe(await first.text());
    expect(respelled.status).toBe(200);
  });

  it("draws a different view afresh", async () => {
    const render = instantRender();
    const handle = createOgHandler({ render });

    await handle(request(2));
    await handle(request(3));

    expect(render).toHaveBeenCalledTimes(2);
  });

  it("forgets the view used longest ago once the cache is full", async () => {
    const render = instantRender();
    const handle = createOgHandler({ render, cache: new LruCache<Buffer>(2) });

    await handle(request(2));
    await handle(request(3));
    await handle(request(2)); // a use: 3 is now the oldest
    await handle(request(4)); // evicts 3
    expect(render).toHaveBeenCalledTimes(3);

    await handle(request(2));
    expect(render).toHaveBeenCalledTimes(3);
    await handle(request(3));
    expect(render).toHaveBeenCalledTimes(4);
  });
});

describe("overload", () => {
  it("renders one view at a time, queues two, and turns the fourth away with 503 and Retry-After: 2", async () => {
    const release = deferred();
    const render = vi.fn<OgRender>(async (view) => {
      await release.promise;
      return Buffer.from(`png:${view.key}`);
    });
    const gate = new RenderGate();
    const handle = createOgHandler({ render, gate });

    const accepted = [
      handle(request(2)),
      handle(request(3)),
      handle(request(4)),
    ];
    await settle();
    expect(render).toHaveBeenCalledTimes(1);
    expect(gate.queued).toBe(2);

    const turnedAway = await handle(request(5));

    expect(turnedAway.status).toBe(503);
    expect(turnedAway.headers.get("retry-after")).toBe("2");
    expect(turnedAway.headers.get("cache-control")).toBe("no-store");
    expect(await turnedAway.text()).toMatch(/try again/i);
    expect(render).toHaveBeenCalledTimes(1);

    release.resolve();
    const answers = await Promise.all(accepted);
    expect(answers.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(render).toHaveBeenCalledTimes(3);

    // The line has drained: the view that was turned away is welcome now.
    expect((await handle(request(5))).status).toBe(200);
  });

  it("does not cache an answer it turned away", async () => {
    const release = deferred();
    const render = vi.fn<OgRender>(async (view) => {
      await release.promise;
      return Buffer.from(view.key);
    });
    const handle = createOgHandler({
      render,
      gate: new RenderGate(0),
    });

    const running = handle(request(2));
    await settle();
    expect((await handle(request(3))).status).toBe(503);

    release.resolve();
    await running;
    await handle(request(3));

    expect(render).toHaveBeenCalledTimes(2);
  });

  it("shares one render between requests for the same view, using no place in the line", async () => {
    const release = deferred();
    const render = vi.fn<OgRender>(async (view) => {
      await release.promise;
      return Buffer.from(`png:${view.key}`);
    });
    const gate = new RenderGate(0);
    const handle = createOgHandler({ render, gate });

    const all = [handle(request(2)), handle(request(2)), handle(request(2))];
    await settle();
    expect(gate.queued).toBe(0);

    release.resolve();
    const answers = await Promise.all(all);

    expect(render).toHaveBeenCalledTimes(1);
    expect(answers.map((r) => r.status)).toEqual([200, 200, 200]);
    const bodies = await Promise.all(answers.map((r) => r.text()));
    expect(new Set(bodies).size).toBe(1);
  });
});

describe("the render budget", () => {
  it("is a 503 with no Retry-After when a render runs past it, and nothing is cached", async () => {
    let now = 0;
    const render = vi.fn<OgRender>(async (view, checkBudget) => {
      now += 8001;
      checkBudget();
      return Buffer.from(view.key);
    });
    const handle = createOgHandler({ render, now: () => now });

    const response = await handle(request(2));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toMatch(/too long/i);

    now = 0;
    await handle(request(2));
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("is spent by the real renderer's own clock checks, which stop it early", async () => {
    // A clock that jumps 3 s every time it is read: the budget (8 s) is gone by
    // the third look, so the renderer has to be looking between slices.
    let now = 0;
    const clock = () => (now += 3000);
    const yields = vi.fn(async () => {});
    const handle = createOgHandler({
      render: renderOgPng,
      now: clock,
      yieldToEventLoop: yields,
    });

    const response = await handle(request(2));

    expect(response.status).toBe(503);
    expect(yields.mock.calls.length).toBeLessThan(5);
  });

  it("gives each render its own full budget", async () => {
    let now = 0;
    const handle = createOgHandler({
      render: async (view, checkBudget) => {
        now += 5000;
        checkBudget();
        return Buffer.from(view.key);
      },
      now: () => now,
    });

    expect((await handle(request(2))).status).toBe(200);
    expect((await handle(request(3))).status).toBe(200);
  });
});

describe("a render that fails", () => {
  it("is a 500 that says nothing of why, and the next request tries again", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const render = vi
      .fn<OgRender>()
      .mockRejectedValueOnce(new Error("secret internal detail"))
      .mockImplementation(async (view) => Buffer.from(view.key));
    const handle = createOgHandler({ render });

    const failed = await handle(request(2));

    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("secret");
    expect(consoleError).toHaveBeenCalled();
    expect((await handle(request(2))).status).toBe(200);
  });
});

describe("the real renderer", () => {
  it("draws a 1200x630 PNG of the view, the same bytes every time", async () => {
    const render = vi.fn<OgRender>(renderOgPng);
    const handle = createOgHandler({ render });
    const query = "v=1&f=mandelbrot&x=-0.75&y=0&z=1&s=classic&i=auto";

    const first = await handle(new Request(`${URL_BASE}?${query}`));
    const bytes = Buffer.from(await first.arrayBuffer());

    expect(first.status).toBe(200);
    expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);

    const again = await handle(new Request(`${URL_BASE}?${query}`));
    expect(Buffer.from(await again.arrayBuffer()).equals(bytes)).toBe(true);
    expect(render).toHaveBeenCalledTimes(1);

    // A fresh handler has no cache and draws the same file again.
    const fresh = await createOgHandler()(new Request(`${URL_BASE}?${query}`));
    expect(Buffer.from(await fresh.arrayBuffer()).equals(bytes)).toBe(true);
  }, 30_000);

  it("draws the colours the link names, the scheme's own settings and all", async () => {
    const query = "v=1&f=mandelbrot&x=-0.75&y=0&z=1&s=fire&r=1&o=0.25";
    const parsed = parseOgQuery(query);
    if (!parsed.ok) throw new Error(parsed.message);

    const response = await createOgHandler()(new Request(`${URL_BASE}?${query}`));
    const drawn = Buffer.from(await response.arrayBuffer());

    // The same pixels the shared pipeline draws for that view, settings
    // included — a card is the picture its link names, not the scheme's plain
    // one.
    const expected = encodePng(
      renderRgba(
        parsed.view.bounds,
        OG_WIDTH,
        OG_HEIGHT,
        parsed.view.maxIterations,
        parsed.view.colorScheme,
        parsed.view.kind,
        true,
        parsed.view.colorOptions,
      ),
      OG_WIDTH,
      OG_HEIGHT,
    );
    expect(drawn.equals(expected)).toBe(true);

    const plain = await createOgHandler()(
      new Request(`${URL_BASE}?v=1&f=mandelbrot&x=-0.75&y=0&z=1&s=fire`),
    );
    expect(Buffer.from(await plain.arrayBuffer()).equals(drawn)).toBe(false);
  }, 30_000);

  it("gives the event loop a turn between slices of rows", async () => {
    const yields = vi.fn(async () => {});
    const handle = createOgHandler({
      render: renderOgPng,
      yieldToEventLoop: yields,
    });

    await handle(request(1));

    // 630 rows in slices of a few rows each is a good many turns.
    expect(yields.mock.calls.length).toBeGreaterThan(50);
  }, 30_000);
});
