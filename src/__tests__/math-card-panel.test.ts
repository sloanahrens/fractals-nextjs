/**
 * The Math card: the parts that live in markup
 *
 * What the card says is `fractalMath.test.ts`'s business and how it counts is
 * `mathCard.test.ts`'s. What a Node suite with no DOM cannot render is the
 * button, the card and the page's wiring, so this reads the sources the way the
 * Nearby strip and switcher tests here do: the button in the top bar beside
 * Help, the card hidden for a tour and the dialogs, the region and its label,
 * Escape, no focus trap, native MathML with no injected markup, and the help
 * entry.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HELP_SECTIONS } from "../lib/helpEntries";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/page.tsx");
const topBar = source("../components/ui/TopBar.tsx");
const card = source("../components/ui/MathCard.tsx");
const view = source("../components/ui/MathView.tsx");
const typings = source("../types/mathml.d.ts");

describe("the Math button", () => {
  it("is a button in the top bar whose name is 'Math'", () => {
    expect(topBar).toMatch(
      /<button[^>]*onClick=\{onMath\}[^>]*>\s*Math\s*<\/button>/,
    );
  });

  it("sits beside Help, before it", () => {
    const math = topBar.search(/>\s*Math\s*<\/button>/);
    const help = topBar.search(/>\s*Help\s*<\/button>/);

    expect(math).toBeGreaterThan(topBar.indexOf("onClick={onForward}"));
    expect(help).toBeGreaterThan(math);
    // Nothing but the closing of one button and the opening of the next.
    expect(topBar.slice(math, help)).not.toMatch(
      />\s*(Back|Forward|Settings)\s*</,
    );
  });

  it("says whether the card is up, and is reachable by Tab", () => {
    expect(topBar).toContain("aria-pressed={mathOpen}");
    expect(topBar).not.toContain("tabIndex={-1}");
  });

  it("is wired to a toggle, so the button opens and closes the card", () => {
    expect(page).toContain("onMath={() => setMathOpen((open) => !open)}");
    expect(page).toContain("mathOpen={mathOpen}");
    expect(page).toContain("mathButtonRef={mathButtonRef}");
  });
});

describe("the card on the page", () => {
  it("is drawn only while open, and not during a tour or over a dialog", () => {
    expect(page).toMatch(
      /\{mathOpen && !tourPlaying && !tourOverlayOpen && \(\s*<MathCard/,
    );
  });

  it("is inside the canvas's wrapper, after the switcher and before the strip", () => {
    const switcher = page.indexOf("<FractalSwitcher");
    const mathCard = page.indexOf("<MathCard");
    const strip = page.indexOf("<NearbyStrip");

    expect(switcher).toBeGreaterThan(-1);
    expect(mathCard).toBeGreaterThan(switcher);
    expect(strip).toBeGreaterThan(mathCard);
  });

  it("is read from the state the renderer draws, not a copy of it", () => {
    const start = page.indexOf("<MathCard");
    const props = page.slice(start, page.indexOf("/>", start));

    expect(props).toContain("fractalType={fractalType}");
    expect(props).toContain("variant={variant}");
    expect(props).toContain("centerX,");
    expect(props).toContain("centerY,");
    expect(props).toContain("zoom: zoomLevel");
    // The cap in use: Auto's result when Auto is on, as the renderer is given.
    expect(props).toContain("iterations: effectiveMaxIterations");
    expect(props).toContain("autoIterations: autoIterationsOn");
    expect(props).toContain("colorScheme,");
  });

  it("moves down a row for the switcher's chips, as the blank hint does", () => {
    expect(page).toMatch(/<MathCard[\s\S]*?belowChips=\{variants !== null\}/);
    expect(card).toContain('belowChips ? "top-24" : "top-14"');
  });
});

describe("the card", () => {
  it("is a labelled region", () => {
    expect(card).toContain('role="region"');
    expect(card).toContain("aria-labelledby={headingId}");
    expect(card).toContain("id={headingId}");
  });

  it("collapses and expands with a button that says which it is", () => {
    expect(card).toContain("aria-expanded={expanded}");
    expect(card).toContain("setExpanded(!expanded)");
  });

  it("keeps the choice through the session store, not in browser storage of its own", () => {
    expect(card).toContain("useSyncExternalStore(");
    expect(card).not.toMatch(/sessionStorage|localStorage/);
  });

  it("closes on Escape, on the window, and gives focus back to the Math button", () => {
    expect(card).toContain('event.key !== "Escape"');
    expect(card).toContain('window.addEventListener("keydown", handleKeyDown)');
    expect(card).toContain(
      'window.removeEventListener("keydown", handleKeyDown)',
    );
    expect(card).toContain("returnFocusRef?.current?.focus()");
  });

  it("traps no focus: no tab stops of its own and no key handler but Escape", () => {
    expect(card).not.toMatch(/tabIndex|autoFocus/);
    expect(card).not.toContain('"Tab"');
    expect(card).not.toContain("onKeyDown");
  });

  it("stays clear of the strip and lets the canvas around it pan", () => {
    // The wrapper takes no pointer events; only the card does.
    expect(card).toContain("pointer-events-none absolute bottom-[9.75rem]");
    expect(card).toContain("pointer-events-auto");
    // The strip is 150 px (9.375rem) tall; the card stops short of it.
    expect(card).toContain("max-h-full");
    expect(card).toContain("overflow-y-auto");
  });

  it("refreshes the view's numbers at the link writer's cadence, not on every step", () => {
    expect(card).toContain("mathCardDelayMs(");
    expect(card).toContain("window.setTimeout(");
    expect(card).toContain("window.clearTimeout(timer)");
  });

  it("is read-only: no input, select or textarea", () => {
    expect(card).not.toMatch(/<(input|select|textarea)\b/i);
  });

  it("names the place the view is on", () => {
    expect(card).toContain("placeAtView(");
    expect(card).toContain("place.name");
  });
});

describe("the typeset formula", () => {
  it("is native MathML, labelled in plain text from the same tree", () => {
    expect(view).toContain("<math");
    expect(view).toContain('role="img"');
    expect(view).toContain("aria-label={toPlainText(expr)}");
  });

  it("injects no markup and pulls in no maths library", () => {
    for (const file of [view, card, typings]) {
      expect(file).not.toContain("dangerouslySetInnerHTML");
      expect(file).not.toMatch(/katex|mathjax/i);
    }
  });

  it("draws every kind of node the descriptors can build", () => {
    for (const kind of [
      "number",
      "identifier",
      "operator",
      "text",
      "row",
      "superscript",
      "subscript",
      "fraction",
      "conjugate",
      "abs",
    ]) {
      expect(view, kind).toContain(`case "${kind}"`);
    }
  });

  it("has typings for each MathML element it uses", () => {
    const used = new Set(
      [...view.matchAll(/<(m[a-z]+)[\s>]/g)].map((match) => match[1]),
    );

    expect(used.size).toBeGreaterThan(0);
    for (const element of used) {
      expect(typings, element).toMatch(new RegExp(`\\b${element}:`));
    }
  });
});

describe("the help entry", () => {
  it("describes the Math button", () => {
    const entries = HELP_SECTIONS.flatMap((section) => section.entries);
    const math = entries.find((entry) => entry.keys === "Math");

    expect(math).toBeDefined();
    expect(math?.action).toMatch(/Escape/);
    expect(math?.action).toMatch(/tour/i);
  });
});
