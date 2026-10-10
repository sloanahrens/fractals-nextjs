/**
 * The orbit plot: the parts that live in markup.
 *
 * What a kind walks is `orbit.test.ts`'s business and what the plot makes of
 * those points is `orbitPlot.test.ts`'s. What a Node suite with no DOM cannot
 * render is the SVG the card draws and the control beside it, so this reads the
 * sources the way the other panel tests here do: the plot is inside the
 * expanded card and under the probe's rows, it is labelled in words rather than
 * left as a picture, it carries the escape circle only where there is one, the
 * Play control is off until it is asked for and disabled when motion is
 * reduced, and nothing here runs while the card is collapsed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ORBIT_MAX_STEPS } from "../lib/mathProbe";
import { ORBIT_PLAY_STEP_MS } from "../lib/orbitPlot";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const card = source("../components/ui/MathCard.tsx");
const plot = source("../components/ui/OrbitPlot.tsx");
const probeSource = source("../lib/mathProbe.ts");

/** The card's expanded block, where everything the card adds on More lives. */
const expanded = card.slice(card.indexOf("{expanded && ("));

describe("where the plot is drawn", () => {
  it("is in the expanded card, under the probe's rows", () => {
    expect(expanded.indexOf("<OrbitPlot")).toBeGreaterThan(
      expanded.indexOf("describeProbe("),
    );
  });

  it("is drawn only for a live probe, and handed the probe's own path", () => {
    const prop = expanded.slice(
      expanded.indexOf("<OrbitPlot"),
      expanded.indexOf("/>", expanded.indexOf("<OrbitPlot")),
    );

    expect(prop).toContain("orbit={probe.orbit}");
    expect(prop).toContain("info={probe.info}");
    expect(prop).toContain("fractalType={fractalType}");
    // The dots are painted in the scheme the picture is drawn in.
    expect(prop).toContain("scheme={colorScheme}");
    // It sits inside the block that is rendered for a probe at all.
    expect(expanded.indexOf("{probe && (")).toBeLessThan(
      expanded.indexOf("<OrbitPlot"),
    );
  });
});

describe("the plot", () => {
  it("is a labelled picture rather than a decoration", () => {
    expect(plot).toContain('role="img"');

    const svg = plot.slice(plot.indexOf("<svg"), plot.indexOf("</svg>"));
    expect(svg).toContain("aria-label={label}");
    expect(plot).toContain("describeOrbit(fractalType, info, steps)");
  });

  it("joins the points with a line and marks the two ends", () => {
    const svg = plot.slice(plot.indexOf("<svg"), plot.indexOf("</svg>"));

    expect(svg).toContain("data-orbit-path");
    expect(svg).toContain("<polyline");
    expect(svg).toContain("data-orbit-first");
    expect(svg).toContain("data-orbit-last");
  });

  it("carries the escape circle only for a fractal that escapes", () => {
    const svg = plot.slice(plot.indexOf("<svg"), plot.indexOf("</svg>"));

    expect(svg).toContain("hasEscapeCircle(fractalType)");
    expect(svg.indexOf("hasEscapeCircle(fractalType)")).toBeLessThan(
      svg.indexOf("data-orbit-escape-circle"),
    );
  });

  it("draws the axes and their unit ticks", () => {
    const svg = plot.slice(plot.indexOf("<svg"), plot.indexOf("</svg>"));

    expect(svg).toContain("data-orbit-axes");
    expect(svg).toContain("<line");
    expect(svg).toContain("{ticks.flatMap(");
    expect(plot).toContain("unitTicks(geometry.extent)");
  });

  it("colours every dot from the picture's own palette", () => {
    // The scheme and its two settings, which are what the picture's colours
    // are: a reversed or shifted picture has reversed or shifted dots.
    expect(plot).toContain(
      "orbitStepColour(step, orbit.length, scheme, colorOptions)",
    );
  });

  it("writes the last few points out in numbers", () => {
    expect(plot).toContain("formatComplex(point.real, point.imaginary)");
    expect(plot).toContain("LISTED_POINTS");
  });

  it("keeps its frame inside the plot for a point that has blown up", () => {
    // The scaling is the pure module's; the component must not do arithmetic
    // of its own that could put a NaN on the page.
    expect(plot).toContain("orbitToPlot(orbit, size, orbitMinExtent(fractalType))");
    expect(plot).not.toContain("Math.hypot");
  });
});

describe("the play control", () => {
  it("is off until it is asked for, and a step at the plot's own pace", () => {
    expect(plot).toContain("useState<");
    expect(plot).toContain("setPlay(animating ? null : { orbit, step: 1 })");
    expect(plot).toContain("ORBIT_PLAY_STEP_MS");
    expect(ORBIT_PLAY_STEP_MS).toBe(120);
  });

  it("is disabled when the reader has asked for less motion", () => {
    expect(plot).toContain("subscribeToReducedMotion");
    expect(plot).toContain("disabled={reducedMotion}");
  });

  it("draws the orbit whole, with nothing animated, without it", () => {
    // No CSS or SMIL animation anywhere: the picture is the picture, and Play
    // only decides how many dots of it are on screen.
    expect(plot).not.toContain("<animate");
    expect(plot).not.toContain("animation:");
  });

  it("is stopped by the orbit moving on rather than by a listener", () => {
    // A pointer move re-reads the point, so the plot is handed a new orbit; the
    // walk is tied to the orbit it started on. Nothing here adds a listener.
    expect(plot).toContain("play.orbit === orbit");
    expect(plot).not.toContain("addEventListener");
  });
});

describe("the probe's path", () => {
  it("is capped well short of an iteration count a deep view could have", () => {
    expect(ORBIT_MAX_STEPS).toBe(60);
    expect(probeSource).toContain("orbitFor(kind, point, ORBIT_MAX_STEPS)");
  });

  it("falls back to the point alone for a kind that cannot walk one", () => {
    expect(probeSource).toContain(
      "kind.orbit ? kind.orbit(point, maxSteps) : [{ ...point }]",
    );
  });
});
