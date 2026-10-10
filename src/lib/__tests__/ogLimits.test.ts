import { describe, expect, it } from "vitest";

import {
  BudgetExceededError,
  GateFullError,
  LruCache,
  OG_CACHE_ENTRIES,
  OG_QUEUE_LIMIT,
  OG_RENDER_BUDGET_MS,
  RenderGate,
  startBudget,
} from "../ogLimits";

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

/** Let every queued continuation run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("the limits' defaults", () => {
  it("are the ones the route is specified with", () => {
    expect(OG_CACHE_ENTRIES).toBe(40);
    expect(OG_QUEUE_LIMIT).toBe(2);
    expect(OG_RENDER_BUDGET_MS).toBe(8000);
  });
});

describe("LruCache", () => {
  it("returns what was set, and undefined for what was not", () => {
    const cache = new LruCache<string>(3);

    cache.set("a", "A");

    expect(cache.get("a")).toBe("A");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("drops the entry used longest ago when it grows past its capacity", () => {
    const cache = new LruCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    cache.set("d", 4);

    expect(cache.size).toBe(3);
    expect(cache.has("a")).toBe(false);
    expect(["b", "c", "d"].every((key) => cache.has(key))).toBe(true);
  });

  it("counts a get as a use", () => {
    const cache = new LruCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    cache.get("a");
    cache.set("d", 4);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("counts a set of an existing key as a use, and replaces its value", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);

    cache.set("a", 10);
    cache.set("c", 3);

    expect(cache.get("a")).toBe(10);
    expect(cache.has("b")).toBe(false);
    expect(cache.size).toBe(2);
  });

  it("holds exactly its capacity of the 40 PNGs the route keeps", () => {
    const cache = new LruCache<number>(OG_CACHE_ENTRIES);

    for (let i = 0; i < 100; i++) cache.set(`view-${i}`, i);

    expect(cache.size).toBe(40);
    expect(cache.has("view-59")).toBe(false);
    expect(cache.has("view-60")).toBe(true);
    expect(cache.has("view-99")).toBe(true);
  });

  it("refuses a capacity that holds nothing", () => {
    expect(() => new LruCache(0)).toThrow(RangeError);
    expect(() => new LruCache(1.5)).toThrow(RangeError);
  });
});

describe("RenderGate", () => {
  it("runs a job at once when nothing is running, and returns its value", async () => {
    const gate = new RenderGate();

    expect(await gate.run(async () => 7)).toBe(7);
    expect(gate.busy).toBe(false);
    expect(gate.queued).toBe(0);
  });

  it("runs one job at a time and the rest in the order they arrived", async () => {
    const gate = new RenderGate(2);
    const events: string[] = [];
    const a = deferred();
    const b = deferred();
    const c = deferred();

    const runs = [
      gate.run(async () => {
        events.push("a start");
        await a.promise;
        events.push("a end");
      }),
      gate.run(async () => {
        events.push("b start");
        await b.promise;
        events.push("b end");
      }),
      gate.run(async () => {
        events.push("c start");
        await c.promise;
        events.push("c end");
      }),
    ];

    await settle();
    expect(events).toEqual(["a start"]);
    expect(gate.queued).toBe(2);

    a.resolve();
    await settle();
    expect(events).toEqual(["a start", "a end", "b start"]);

    b.resolve();
    await settle();
    c.resolve();
    await Promise.all(runs);

    expect(events).toEqual([
      "a start",
      "a end",
      "b start",
      "b end",
      "c start",
      "c end",
    ]);
    expect(gate.busy).toBe(false);
  });

  it("turns away the job that would be a third in the line, without starting it", async () => {
    const gate = new RenderGate(2);
    const first = deferred();
    let started = 0;
    const job = async () => {
      started++;
      await first.promise;
    };

    const accepted = [gate.run(job), gate.run(job), gate.run(job)];
    await settle();

    await expect(gate.run(job)).rejects.toBeInstanceOf(GateFullError);
    expect(started).toBe(1);
    expect(gate.queued).toBe(2);

    first.resolve();
    await Promise.all(accepted);
    expect(started).toBe(3);
  });

  it("takes work again once the line has drained", async () => {
    const gate = new RenderGate(1);
    const hold = deferred();
    const running = gate.run(() => hold.promise);
    const waiting = gate.run(async () => "waited");
    await settle();

    await expect(gate.run(async () => "no")).rejects.toBeInstanceOf(
      GateFullError,
    );

    hold.resolve();
    await running;
    expect(await waiting).toBe("waited");
    expect(await gate.run(async () => "again")).toBe("again");
  });

  it("is not blocked by a job that fails, and passes the failure on", async () => {
    const gate = new RenderGate(2);
    const first = deferred();

    const failing = gate.run(async () => {
      await first.promise;
      throw new Error("boom");
    });
    const next = gate.run(async () => "after");
    await settle();

    first.reject(new Error("never seen"));
    await expect(failing).rejects.toThrow();
    expect(await next).toBe("after");
    expect(gate.busy).toBe(false);
  });

  it("never has two jobs running at once", async () => {
    const gate = new RenderGate(5);
    let running = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 6 }, () =>
        gate.run(async () => {
          running++;
          peak = Math.max(peak, running);
          await settle();
          running--;
        }),
      ),
    );

    expect(peak).toBe(1);
  });
});

describe("startBudget", () => {
  it("lets work continue until the budget is spent", () => {
    let now = 1000;
    const check = startBudget(() => now, 8000);

    expect(() => check()).not.toThrow();
    now = 8999;
    expect(() => check()).not.toThrow();
    now = 9000;
    expect(() => check()).not.toThrow();
  });

  it("throws once the clock is past the deadline", () => {
    let now = 1000;
    const check = startBudget(() => now, 8000);

    now = 9001;

    expect(() => check()).toThrow(BudgetExceededError);
  });

  it("starts its clock when it is made, not when it is first checked", () => {
    let now = 50_000;
    const check = startBudget(() => now, 100);

    now = 50_101;

    expect(() => check()).toThrow(BudgetExceededError);
  });

  it("defaults to eight seconds", () => {
    let now = 0;
    const check = startBudget(() => now);

    now = 8000;
    expect(() => check()).not.toThrow();
    now = 8001;
    expect(() => check()).toThrow(BudgetExceededError);
  });
});
