/** The part of `navigator.wakeLock` this module uses. */
export interface WakeLockSource {
  request: (type: "screen") => Promise<{ release: () => Promise<void> }>;
}

/** The part of `document` this module uses. */
export interface VisibilitySource {
  visibilityState: string;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
}

/**
 * Keep the screen on, as best the browser allows.
 *
 * A browser drops the lock whenever the tab is hidden, so it is asked for
 * again when the tab comes back. Every failure is swallowed: a browser without
 * the API, a refusal (low battery, a policy) and a release that throws all
 * leave a tour playing on a screen that may dim, which is no reason to stop it.
 *
 * @param wakeLock - `navigator.wakeLock`, or undefined where there is none
 * @param visibility - The document
 * @returns A function that releases the lock and stops asking again
 */
export function holdScreenAwake(
  wakeLock: WakeLockSource | undefined,
  visibility: VisibilitySource,
): () => void {
  if (!wakeLock) return () => {};

  let held: { release: () => Promise<void> } | null = null;
  let released = false;

  const quietly = (lock: { release: () => Promise<void> }) => {
    try {
      lock.release().catch(() => {});
    } catch {
      // Nothing to do: the lock is gone either way.
    }
  };

  const acquire = () => {
    try {
      wakeLock.request("screen").then(
        (lock) => {
          // The tour can end while the request is in flight.
          if (released) quietly(lock);
          else held = lock;
        },
        () => {},
      );
    } catch {
      // A browser that throws instead of rejecting is refused all the same.
    }
  };

  const handleVisibilityChange = () => {
    if (visibility.visibilityState === "visible") acquire();
  };

  visibility.addEventListener("visibilitychange", handleVisibilityChange);
  acquire();

  return () => {
    released = true;
    visibility.removeEventListener("visibilitychange", handleVisibilityChange);
    if (held) quietly(held);
    held = null;
  };
}
