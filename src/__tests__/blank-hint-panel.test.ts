/**
 * The blank-picture hint: the parts that live in markup and effects
 *
 * Whether a picture is blank is `blankView.test.ts`'s business. A Node suite
 * with no DOM cannot render the pill or run the page's effect, so this reads
 * the sources the way the other panel tests here do: the hint wired to the
 * same Back as the bar, shown only for the view it was found blank on, asked
 * only of a settled full render after the delay, and cleared when that goes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/FractalExplorer.tsx");
const hint = source("../components/ui/BlankHint.tsx");
const help = source("../lib/helpEntries.ts");

describe("the hint's markup", () => {
  it("is a polite status region that takes no pointer events outside its pill", () => {
    expect(hint).toContain('role="status"');
    expect(hint).toContain('aria-live="polite"');
    expect(hint).toMatch(/className=\{`pointer-events-none absolute/);
    expect(hint).toMatch(/pointer-events-auto/);
  });

  it("says the sentence and offers a Back button only where there is somewhere to go", () => {
    expect(hint).toContain(
      "Nothing to see here. Try a nearby place, or go back.",
    );
    expect(hint).toMatch(
      /\{canGoBack && \(\s*<button[\s\S]*?onClick=\{onBack\}/,
    );
  });
});

describe("the page's wiring", () => {
  it("gives the hint the bar's Back handler and the bar's can-go-back", () => {
    expect(page).toMatch(
      /<BlankHint[\s\S]*?onBack=\{handleBack\}[\s\S]*?canGoBack=\{historyState\.canGoBack\}/,
    );
    expect(page).toMatch(/<TopBar[\s\S]*?onBack=\{handleBack\}/);
  });

  it("shows it only for the view it was found blank on, and not during a tour", () => {
    expect(page).toMatch(
      /const blankHintShown =\s*!tourPlaying &&\s*blankLink !== null &&\s*blankLink === currentLink;/,
    );
    expect(page).toMatch(/<BlankHint\s+show=\{blankHintShown\}/);
  });

  it("asks only of a settled full render, after the delay, and clears on cleanup", () => {
    const start = page.indexOf("const [blankLink, setBlankLink]");
    const body = page.slice(
      start,
      page.indexOf("The address bar follows", start),
    );

    expect(body).toMatch(
      /isRendering \|\| renderedLink === "" \|\| renderedLink !== currentLink/,
    );
    expect(body).toContain("BLANK_HINT_DELAY_MS");
    expect(body).toMatch(
      /return \(\) => \{\s*window\.clearTimeout\(timer\);\s*setBlankLink\(null\);/,
    );
  });
});

describe("the Help overlay", () => {
  it("names the hint", () => {
    expect(help).toContain('keys: "Blank picture"');
  });
});
