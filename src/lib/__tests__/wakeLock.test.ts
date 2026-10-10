import { describe, expect, it, vi } from "vitest";

import {
  holdScreenAwake,
  type VisibilitySource,
  type WakeLockSource,
} from "../wakeLock";

/** A document stand-in that records its listeners and can fire them. */
function fakeDocument(state = "visible") {
  const listeners = new Set<() => void>();
  const document: VisibilitySource & { show: (state: string) => void } = {
    visibilityState: state,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    show(next) {
      document.visibilityState = next;
      for (const listener of [...listeners]) listener();
    },
  };

  return { document, listeners };
}

/** A wake lock whose every request is answered by hand. */
function fakeWakeLock() {
  const sentinels: { release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async () => {
    const sentinel = { release: vi.fn(async () => {}) };
    sentinels.push(sentinel);
    return sentinel;
  });

  return { source: { request } as WakeLockSource, request, sentinels };
}

describe("holdScreenAwake", () => {
  it("asks for the screen lock and releases it", async () => {
    const { source, request, sentinels } = fakeWakeLock();
    const { document } = fakeDocument();

    const release = holdScreenAwake(source, document);
    expect(request).toHaveBeenCalledWith("screen");
    await Promise.resolve();

    release();
    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it("asks again when the tab comes back, and not while it is hidden", async () => {
    const { source, request } = fakeWakeLock();
    const { document } = fakeDocument();

    holdScreenAwake(source, document);
    document.show("hidden");
    expect(request).toHaveBeenCalledTimes(1);

    document.show("visible");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("stops listening once released", () => {
    const { source } = fakeWakeLock();
    const { document, listeners } = fakeDocument();

    const release = holdScreenAwake(source, document);
    expect(listeners.size).toBe(1);

    release();
    expect(listeners.size).toBe(0);
  });

  it("releases a lock that arrives after the tour has ended", async () => {
    const { source, sentinels } = fakeWakeLock();
    const { document } = fakeDocument();

    const release = holdScreenAwake(source, document);
    release();
    await Promise.resolve();
    await Promise.resolve();

    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
  });

  it("does nothing where the browser has no wake lock", () => {
    const { document, listeners } = fakeDocument();

    const release = holdScreenAwake(undefined, document);

    expect(listeners.size).toBe(0);
    expect(() => release()).not.toThrow();
  });

  it("ignores a refused request", async () => {
    const source: WakeLockSource = {
      request: vi.fn(async () => {
        throw new Error("NotAllowedError");
      }),
    };
    const { document } = fakeDocument();

    const release = holdScreenAwake(source, document);
    await Promise.resolve();

    expect(() => release()).not.toThrow();
  });

  it("ignores a request that throws instead of rejecting", () => {
    const source: WakeLockSource = {
      request: vi.fn(() => {
        throw new Error("no");
      }),
    };
    const { document } = fakeDocument();

    expect(() => holdScreenAwake(source, document)()).not.toThrow();
  });

  it("ignores a release that rejects or throws", async () => {
    const rejecting: WakeLockSource = {
      request: async () => ({
        release: async () => {
          throw new Error("gone");
        },
      }),
    };
    const throwing: WakeLockSource = {
      request: async () => ({
        release: () => {
          throw new Error("gone");
        },
      }),
    };

    for (const source of [rejecting, throwing]) {
      const { document } = fakeDocument();
      const release = holdScreenAwake(source, document);
      await Promise.resolve();

      expect(() => release()).not.toThrow();
    }
  });
});
