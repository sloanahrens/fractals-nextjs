"use client";

import { useEffect, useRef, useState } from "react";

import {
  decideNudge,
  markNudgeSeen,
  readNudgeSeen,
  WANDER_NUDGE_AFTER_MS,
  WANDER_NUDGE_SHOW_MS,
  type NudgeStorage,
} from "../../lib/wanderControl";

interface WanderNudgeInputs {
  /** Auto-wander is on. */
  wanderOn: boolean;
  /** A tour is playing. */
  tourPlaying: boolean;
  /** Settings or Help is open. */
  overlayOpen: boolean;
}

/** The browser's storage, or null where even asking for it throws. */
function browserStorage(): NudgeStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The first-run nudge for the Auto-wander pill: true for `WANDER_NUDGE_SHOW_MS`
 * once, the first time the page has been open `WANDER_NUDGE_AFTER_MS` with no
 * wander and no tour started (`decideNudge` makes the call).
 *
 * The browser remembers it was shown, in localStorage, the moment it appears —
 * so a reload mid-nudge does not repeat it — and where storage is unavailable
 * the page simply nudges on every visit. Any press or key dismisses it. It is
 * held back while Settings or Help is open and never starts once the visitor
 * has used wander or a tour. State is set only from timers and events, and the
 * value returned is also false the moment any of those things becomes true, so
 * a nudge never outlives the reason for it.
 */
export function useWanderNudge({
  wanderOn,
  tourPlaying,
  overlayOpen,
}: WanderNudgeInputs): boolean {
  const [shown, setShown] = useState(false);
  const openedAt = useRef<number | null>(null);
  const wanderUsed = useRef(false);
  const tourStarted = useRef(false);

  useEffect(() => {
    if (openedAt.current === null) openedAt.current = performance.now();
    if (wanderOn) wanderUsed.current = true;
    if (tourPlaying) tourStarted.current = true;

    if (overlayOpen) return;

    const decide = () =>
      decideNudge({
        openForMs: performance.now() - (openedAt.current ?? 0),
        wanderUsed: wanderUsed.current,
        tourStarted: tourStarted.current,
        overlayOpen: false,
        seen: readNudgeSeen(browserStorage()),
      });

    if (decide() === "never") return;

    const elapsed = performance.now() - openedAt.current;
    const timer = setTimeout(
      () => {
        if (decide() !== "show") return;

        markNudgeSeen(browserStorage());
        setShown(true);
      },
      Math.max(0, WANDER_NUDGE_AFTER_MS - elapsed),
    );

    return () => clearTimeout(timer);
  }, [wanderOn, tourPlaying, overlayOpen]);

  // A shown nudge goes away on the first press or key, or by itself.
  useEffect(() => {
    if (!shown) return;

    const dismiss = () => setShown(false);
    const timer = setTimeout(dismiss, WANDER_NUDGE_SHOW_MS);

    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
    };
  }, [shown]);

  return shown && !wanderOn && !tourPlaying && !overlayOpen;
}
