/**
 * The Math probe: the parts that live in markup and in the page's effects
 *
 * What the probe computes is `mathProbe.test.ts`'s business and what a kind
 * answers is `escapeInfo.test.ts`'s. What a Node suite with no DOM cannot
 * render is the row the card draws and the listeners the page attaches, so
 * this reads the sources the way the other panel tests here do: the work lives
 * in one animation frame's callback, it is guarded on the card being expanded
 * and on screen, the pointer leaving clears it, and a view that moves under a
 * resting pointer re-reads the same place rather than showing the old view's.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HELP_SECTIONS } from "../lib/helpEntries";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/FractalExplorer.tsx");
const card = source("../components/ui/MathCard.tsx");

// The page's whole probe block: from the flag that decides whether it runs to
// the card's own use of it.
const probe = page.slice(
  page.indexOf("const probeLive"),
  page.indexOf("const wanderNudge"),
);

describe("when the probe runs", () => {
  it("runs only while the expanded card is on screen", () => {
    expect(probe).toMatch(
      /const probeLive =\s*mathOpen &&\s*mathExpanded &&\s*!tourPlaying &&\s*!tourOverlayOpen;/,
    );
  });

  it("does nothing at all when it is not live: no listener, no reading", () => {
    // The effect gives up before it reaches any of the wiring below, so a
    // collapsed or hidden card costs nothing at all.
    expect(probe.indexOf("if (!probeLive)")).toBeLessThan(
      probe.indexOf("const canvas = canvasRef.current"),
    );
    expect(probe.indexOf("if (!probeLive)")).toBeLessThan(
      probe.indexOf("addEventListener"),
    );
  });

  it("drops where the pointer was when it stops", () => {
    const stop = probe.slice(
      probe.indexOf("if (!probeLive)"),
      probe.indexOf("const canvas = canvasRef.current"),
    );

    expect(stop).toContain("pointerRef.current = null;");
  });
});

describe("the work", () => {
  it("is one point per animation frame, whatever the pointer does", () => {
    expect(probe).toContain("createFrameThrottle(run)");
    expect(probe).toContain("throttle.request()");
    expect(probe).toContain("throttle.cancel()");
  });

  it("happens in the frame's callback and never in the pointer handler", () => {
    const frame = probe.slice(
      probe.indexOf("const run = () => {"),
      probe.indexOf("const throttle = createFrameThrottle"),
    );
    const handler = probe.slice(
      probe.indexOf("const handleMove"),
      probe.indexOf("const handleLeave"),
    );

    expect(frame).toContain("probeAtPointer(");
    // The handler only remembers where the pointer is and asks for a frame.
    expect(handler).toContain(
      "pointerRef.current = { x: event.clientX, y: event.clientY };",
    );
    expect(handler).toContain("throttle.request()");
    expect(handler).not.toContain("probeAtPointer(");
    expect(handler).not.toContain("setProbe(");
  });

  it("reads the place through the canvas's own box and bounds", () => {
    expect(probe).toContain("canvas.getBoundingClientRect()");
    expect(probe).toContain("canvas.width");
    expect(probe).toContain("bounds,");
    expect(probe).toContain("effectiveMaxIterations,");
    expect(probe).toContain("colorScheme,");
  });

  it("re-reads the same place when the view moves under a resting pointer", () => {
    // The pointer reports no move when the picture moves under it, so the
    // effect's own run does: the inputs are its dependencies, and the place it
    // last saw is kept in a ref across them.
    const dependencies = probe.slice(probe.indexOf("  }, ["));

    for (const input of [
      "probeLive",
      "fractalKind",
      "bounds",
      "effectiveMaxIterations",
      "colorScheme",
    ]) {
      expect(dependencies).toContain(input);
    }
    expect(probe).toContain("if (pointerRef.current) throttle.request();");
  });
});

describe("the listeners", () => {
  it("watch the picture's pointer and let the page pan under them", () => {
    expect(page).toContain(
      'canvas.addEventListener("pointermove", handleMove, { passive: true })',
    );
    expect(page).toContain(
      'canvas.addEventListener("pointerdown", handleMove, { passive: true })',
    );
    expect(page).toContain(
      'canvas.addEventListener("pointerleave", handleLeave)',
    );
  });

  it("clear the probe when the pointer leaves the picture", () => {
    const leave = probe.slice(
      probe.indexOf("const handleLeave"),
      probe.indexOf("canvas.addEventListener"),
    );

    expect(leave).toContain("pointerRef.current = null;");
    expect(leave).toContain("setProbe(null);");
  });

  it("are taken off again when the probe stops", () => {
    const cleanup = probe.slice(probe.indexOf("return () => {"));

    for (const target of ["pointermove", "pointerdown", "pointerleave"]) {
      expect(cleanup).toContain(`removeEventListener("${target}"`);
    }
    expect(cleanup).toContain("throttle.cancel();");
  });
});

describe("the card's row", () => {
  it("takes the probe as a prop, only while it is running", () => {
    expect(page).toContain("probe={probeLive ? probe : null}");
    expect(card).toContain("probe?: PointProbe | null;");
    expect(card).toContain("probe = null,");
  });

  it("shows the point, its orbit and a swatch of its colour", () => {
    expect(card).toContain(
      "formatComplex(probe.point.real, probe.point.imaginary)",
    );
    expect(card).toContain(
      "describeProbe(fractalType, probe.info, iterations)",
    );
    expect(card).toContain("backgroundColor: colourCss(probe.colour)");
  });

  it("says where to point when there is no probe", () => {
    expect(card).toContain("Hover the picture");
  });

  it("is part of the expanded card, not the collapsed line", () => {
    const expanded = card.indexOf("{expanded && (");
    const rows = card.indexOf("<dt className={ROW_LABEL}>Point</dt>");

    expect(expanded).toBeGreaterThan(0);
    expect(rows).toBeGreaterThan(expanded);
  });
});

describe("the help overlay", () => {
  it("says the expanded card follows the pointer", () => {
    const entry = HELP_SECTIONS.flatMap((section) => section.entries).find(
      (row) => row.keys === "Math",
    );

    expect(entry?.action).toContain("hover the picture");
    expect(entry?.action).toContain("swatch");
  });
});
