/**
 * The built-in preset buttons show their whole label
 *
 * From the `lg` breakpoint the Presets card is a fixed `w-96` column beside
 * the canvas, and the button grid asked for six columns there: about 26px of
 * text per button, so "Julia: Classic" read "Classi". The suite has no DOM to
 * lay out, so this reads the `PresetSelector` source for the classes that
 * decide the clipping: a column count that outgrows the card, a button that is
 * not allowed to wrap, and a width or overflow rule that hides what does not
 * fit.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SELECTOR = readFileSync(
  fileURLToPath(
    new URL("../components/ui/PresetSelector.tsx", import.meta.url),
  ),
  "utf8",
);

/** The class string of the element that holds the built-in view buttons. */
function gridClasses(): string {
  const match = SELECTOR.match(/className="(grid [^"]*)"/);
  if (!match) throw new Error("PresetSelector has no grid of preset buttons");
  return match[1];
}

/** The class string handed to the `Button` that renders one built-in view. */
function buttonClasses(): string {
  const match = SELECTOR.match(/<Button\s[\s\S]*?className="([^"]*)"/);
  if (!match) throw new Error("PresetSelector has no preset Button");
  return match[1];
}

describe("preset button labels", () => {
  it("never asks for more than three columns at any width", () => {
    const counts = [...gridClasses().matchAll(/grid-cols-(\d+)/g)].map((m) =>
      Number(m[1]),
    );
    expect(counts.length).toBeGreaterThan(0);
    expect(Math.max(...counts)).toBeLessThanOrEqual(3);
  });

  it("keeps two columns from lg up, where the card is a fixed width", () => {
    expect(gridClasses()).toMatch(/\blg:grid-cols-2\b/);
  });

  it("lets a button shrink and wrap its label", () => {
    expect(buttonClasses()).toMatch(/\bmin-w-0\b/);
    expect(buttonClasses()).toMatch(/\bbreak-words\b/);
  });

  it("does not clip, truncate or fix the width of a button", () => {
    const classes = `${gridClasses()} ${buttonClasses()}`;
    expect(classes).not.toMatch(
      /(^|\s)(truncate|whitespace-nowrap|text-ellipsis|overflow-(hidden|clip)|w-\d+|w-\[[^\]]+\]|max-w-\S+)(\s|$)/,
    );
  });
});
