/**
 * The Auto-wander pill: the parts that live in markup and in the page's wiring
 *
 * What the pill says, where it sits and when it nudges are
 * `wanderControl.test.ts`'s business. A Node suite has no DOM, so this reads the
 * sources the way the fractal switcher and Nearby strip tests do: a pressed
 * button with a fixed name, one handler shared with the Settings checkbox, the
 * places it hides, the nudge's storage and reduced-motion handling.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/FractalExplorer.tsx");
const pill = source("../components/ui/WanderControl.tsx");
const nudge = source("../components/ui/useWanderNudge.ts");
const css = source("../app/globals.css");
const help = source("../lib/helpEntries.ts");

/** The page's `<WanderControl ... />` element. */
function pillElement(): string {
  const start = page.indexOf("<WanderControl");
  if (start === -1) throw new Error("the page does not draw the pill");

  return page.slice(start, page.indexOf("/>", start) + 2);
}

describe("the pill", () => {
  it("is a pressed-state button with the same accessible name on and off", () => {
    expect(pill).toContain('type="button"');
    expect(pill).toContain("aria-pressed={label.pressed}");
    expect(pill).toContain("aria-label={label.name}");
    expect(pill).toContain("wanderPillLabel(");
  });

  it("has a visible focus ring and a hit area of at least 44 x 32", () => {
    expect(pill).toMatch(/focus-visible:ring-2/);
    // min-h-9 is 36 px and min-w-11 is 44 px.
    expect(pill).toContain("min-h-9");
    expect(pill).toContain("min-w-11");
  });

  it("draws inline SVG glyphs and imports no icon package", () => {
    expect(pill).toContain("<svg");
    expect(pill).not.toMatch(/from "(lucide|react-icons|@heroicons|@radix)/);
  });

  it("never fades: no idle hook, no opacity transition", () => {
    expect(pill).not.toContain("useIdleVisibility");
    expect(pill).not.toMatch(/opacity-0|transition-opacity/);
  });

  it("takes pointer events only on the pill, so the canvas around it still pans", () => {
    expect(pill).toContain("pointer-events-none absolute inset-0");
    expect(pill).toContain("pointer-events-auto");
  });

  it("measures the picture and stacks above the strip rather than over a tile", () => {
    expect(pill).toContain("ResizeObserver");
    expect(pill).toContain("wanderPlacement(root.clientWidth, leadingWidth)");
    expect(pill).toContain('useState<WanderPlacement>("above")');
  });
});

describe("the page's wiring", () => {
  it("gives the pill and the Settings checkbox the one handler and the one state", () => {
    expect(pillElement()).toContain("onToggle={handleWanderChange}");
    expect(pillElement()).toContain("on={wanderOn}");
    expect(pillElement()).toContain("countdown={wanderCountdown}");
    expect(pillElement()).toContain("rendering={isRendering}");
    expect(page).toContain("onChange={handleWanderChange}");
    expect(page.match(/const handleWanderChange = /g)).toHaveLength(1);
  });

  it("hides the pill for a tour and while Settings or Help is open, as the switcher is", () => {
    expect(pillElement()).toContain("hidden={tourPlaying || tourOverlayOpen}");
  });

  it("draws the pill after the Nearby strip, so it paints over the strip's gradient", () => {
    expect(page.indexOf("<WanderControl")).toBeGreaterThan(
      page.indexOf("<NearbyStrip"),
    );
  });

  it("keeps the checkbox and the seconds box in Settings and says the switch is on the picture", () => {
    expect(page).toContain('label="Auto-wander"');
    expect(page).toContain('label="Seconds between steps"');
    expect(page).toContain("The same switch is on the picture");
  });

  it("hands the nudge the same hiding conditions the pill has", () => {
    const call = page.slice(page.indexOf("useWanderNudge({"));

    expect(call.slice(0, call.indexOf("});"))).toContain("wanderOn");
    expect(call.slice(0, call.indexOf("});"))).toContain("tourPlaying");
    expect(call.slice(0, call.indexOf("});"))).toContain(
      "overlayOpen: tourOverlayOpen",
    );
    expect(pillElement()).toContain("nudge={wanderNudge}");
  });
});

describe("the first-run nudge", () => {
  it("keeps its flag in localStorage behind try/catch, through the pure helpers", () => {
    expect(nudge).toContain("window.localStorage");
    expect(nudge).toMatch(/try \{\s*return window\.localStorage;\s*\} catch/);
    expect(nudge).toContain("readNudgeSeen(browserStorage())");
    expect(nudge).toContain("markNudgeSeen(browserStorage())");
  });

  it("is shown for the 6 s the pure module names, or until any press or key", () => {
    expect(nudge).toContain("WANDER_NUDGE_SHOW_MS");
    expect(nudge).toContain('"pointerdown"');
    expect(nudge).toContain('"keydown"');
  });

  it("pulses by a CSS animation that reduced motion switches off, leaving the tooltip", () => {
    expect(pill).toContain("wander-nudge-pulse");
    expect(pill).toContain('role="tooltip"');
    expect(css).toMatch(
      /\.wander-nudge-pulse \{\s*animation: wander-nudge-pulse 1s ease-in-out 2;/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.wander-nudge-pulse \{\s*animation: none;/,
    );
  });
});

describe("the Help overlay", () => {
  it("names the pill", () => {
    expect(help).toContain("Auto-wander pill at the bottom right");
  });
});
