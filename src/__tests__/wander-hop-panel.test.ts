/**
 * Auto-wander's hops: the parts that live in the page's wiring
 *
 * When a step is a hop, and when a blank landing forces one, is
 * `wanderControllerHops.test.ts`'s business. A Node suite with no DOM cannot
 * render the page, so this reads the source the way the tour and Nearby strip
 * panel tests do: the hop goes through the tile's handler, rewrites the history
 * entry rather than adding one, asks the tour engine with a state of its own,
 * and the detector is the canvas's.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/page.tsx");

/** The `useEffect` that contains `needle`, up to the end of the file's next effect. */
function effectContaining(needle: string): string {
  const at = page.indexOf(needle);
  if (at === -1) throw new Error(`${needle} is not in the page`);

  const start = page.lastIndexOf("useEffect(", at);
  const end = page.indexOf("\n  }", at);
  return page.slice(start, end);
}

describe("the step handler", () => {
  const step = effectContaining("wander.setStepHandler(");

  it("takes the step's kind and hops to a place the tour engine chooses", () => {
    expect(step).toMatch(/setStepHandler\(\(\{ hop \}\) =>/);
    expect(step).toContain("nextTourStop(");
    expect(step).toContain("PLACES");
    expect(step).toContain("wanderHopRef");
  });

  it("goes there through the tile's handler, replacing the entry", () => {
    expect(step).toContain("handlePlaceSelect(place, { replace: true })");
    // Not the tour's crossfade, and not a jump.
    expect(step).not.toContain("tour: true");
    expect(step).not.toContain("beginJump");
    expect(step).not.toContain("pushViewLink");
  });

  it("leaves the drift as it was", () => {
    expect(step).toContain("nextWanderView(");
    expect(step).toMatch(/applyView\(\{\s*centerX: next\.centerX/);
  });

  it("keeps the walk's own memory apart from the tour's", () => {
    expect(page).toContain(
      "const wanderHopRef = useRef<TourState | null>(null)",
    );
    expect(page).toContain(
      "const tourEngineRef = useRef<TourState | null>(null)",
    );
  });
});

describe("a blank landing", () => {
  it("asks the canvas, through the blank-picture detector", () => {
    expect(page).toMatch(
      /wander\.setBlankDetector\(\(\) => \{[^}]*canvasIsBlank\(canvas\)/,
    );
  });

  it("is reported when the picture has settled, after the handler is current", () => {
    const handler = page.indexOf("wander.setStepHandler(");
    const settled = page.indexOf("wander.notifySettled()");

    expect(settled).toBeGreaterThan(-1);
    expect(handler).toBeGreaterThan(-1);
    expect(settled).toBeGreaterThan(handler);
    expect(effectContaining("wander.notifySettled()")).toContain("tourSettled");
  });
});

describe("a place chosen by the walk", () => {
  it("is no jump: `replace` skips beginJump and the tile's click still begins one", () => {
    expect(page).toContain("replace = tour");
    expect(page).toContain("if (!replace) beginJump();");
    expect(page).toContain(
      "startCrossfade(target, tour ? TOUR_CROSSFADE_MS : CROSSFADE_MS)",
    );
  });
});
