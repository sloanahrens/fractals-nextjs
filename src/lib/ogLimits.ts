/**
 * The cost limits of `/api/og`, as plain objects with their clock and their
 * waiting passed in, so the whole of the policy is driven in Node with no real
 * time.
 *
 * The route is an unauthenticated CPU endpoint on a service that scales to
 * zero, so three things bound what a caller can make it do: a cache, so a
 * repeated view costs nothing; a gate, so only one render runs at a time per
 * instance and a bounded few wait behind it, the rest being turned away; and a
 * budget, so one render that is slower than expected is stopped rather than
 * left to hold the CPU. Nothing here is persistent or shared between
 * instances: each instance protects itself.
 */

/** Entries the PNG cache keeps. */
export const OG_CACHE_ENTRIES = 40;

/** Requests that may wait for the render in progress. */
export const OG_QUEUE_LIMIT = 2;

/** The longest one render may run, in milliseconds. */
export const OG_RENDER_BUDGET_MS = 8000;

/**
 * A least-recently-used map of fixed capacity.
 *
 * `get` and `set` both count as a use; adding past the capacity drops the entry
 * used longest ago. A map keeps insertion order, so the oldest use is the first
 * key and re-inserting on use keeps the order true.
 */
export class LruCache<V> {
  private readonly entries = new Map<string, V>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("An LRU cache needs a capacity of at least 1");
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;

    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);

    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }
}

/** Thrown by {@link RenderGate.run} when the queue is full. */
export class GateFullError extends Error {
  constructor() {
    super("The render queue is full");
    this.name = "GateFullError";
  }
}

/**
 * Runs jobs one at a time, with a bounded line behind the one running.
 *
 * A job that arrives while one runs waits its turn, unless `queueLimit` are
 * already waiting, in which case the call rejects at once with
 * {@link GateFullError} and the job is never started. A job that fails does not
 * block the line.
 */
export class RenderGate {
  private running = false;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly queueLimit: number = OG_QUEUE_LIMIT) {}

  /** Jobs waiting behind the one running. */
  get queued(): number {
    return this.waiting.length;
  }

  /** Whether a job is running now. */
  get busy(): boolean {
    return this.running;
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running) {
      if (this.waiting.length >= this.queueLimit) throw new GateFullError();
      await new Promise<void>((resume) => this.waiting.push(resume));
    }

    // Whoever resumed this call left `running` true for it, so a job that
    // arrives between the resume and this line cannot start alongside it.
    this.running = true;
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        next();
      } else {
        this.running = false;
      }
    }
  }
}

/** Thrown when a render passes its budget. */
export class BudgetExceededError extends Error {
  constructor() {
    super("The render ran out of time");
    this.name = "BudgetExceededError";
  }
}

/**
 * A deadline on an injected clock.
 *
 * @param now - Milliseconds, any origin (`performance.now`, or a fake)
 * @param budgetMs - How long the work may take
 * @returns A function that throws {@link BudgetExceededError} once the budget
 *   is spent, for the work to call between its steps
 */
export function startBudget(
  now: () => number,
  budgetMs: number = OG_RENDER_BUDGET_MS,
): () => void {
  const deadline = now() + budgetMs;

  return () => {
    if (now() > deadline) throw new BudgetExceededError();
  };
}
