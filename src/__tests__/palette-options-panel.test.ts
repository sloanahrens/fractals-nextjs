/**
 * The palette options in the page: the half of them a Node suite cannot render.
 *
 * That the mapping reverses and shifts a colour, that a link writes and reads
 * the two keys, and that a render or a repaint draws them are the pure
 * modules' own tests' business. What is decided here — in
 * `FractalExplorer.tsx` and nowhere else — is that the page holds the two
 * settings as part of the view, that a link moves them like every other field,
 * that the picture on the canvas and the picture an export draws are drawn with
 * them, and that the two surfaces that show a picture of this view — the
 * Nearby strip's tiles and the Math card's plot — are told about them too.
 *
 * The suite runs in Node with no DOM to render into, so this reads the page
 * source, the way the other panel tests here do.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PAGE_PATH = fileURLToPath(
  new URL("../app/FractalExplorer.tsx", import.meta.url),
);
const PAGE = readFileSync(PAGE_PATH, "utf8");

/** The body of a `const NAME = ...` function in a source, braces and all. */
function functionBody(source: string, name: string): string {
  const declaration = source.indexOf(`const ${name} = `);
  if (declaration === -1) throw new Error(`${name} is not in the page`);

  const open = source.indexOf("{", declaration);
  let depth = 0;

  for (let index = open; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) {
      return source.slice(open, index + 1);
    }
  }

  throw new Error(`unbalanced braces in ${name}`);
}

describe("the palette options in the page", () => {
  it("reads the page it is checking", () => {
    expect(PAGE_PATH.endsWith("app/FractalExplorer.tsx")).toBe(true);
    expect(PAGE.length).toBeGreaterThan(10_000);
    expect(PAGE).toContain("export default function Home()");
  });

  it("holds the two settings as part of the view, opened on the page's defaults", () => {
    // Initialised from the one object a link's missing fields fall back on, so
    // a fresh visit and a link that says nothing about them are one view.
    expect(PAGE).toContain(
      "const [reverse, setReverse] = useState(DEFAULT_VIEW_LINK_UPDATES.reverse);",
    );
    expect(PAGE).toContain(
      "const [shift, setShift] = useState(DEFAULT_VIEW_LINK_UPDATES.shift);",
    );
  });

  it("passes them on as one memoized object, so its identity holds while they do", () => {
    // A fresh object a render would have every surface that takes it in a
    // dependency list asking for a picture again on every render.
    expect(PAGE).toContain("const colorOptions = useMemo<ColorOptions>(");
    expect(PAGE).toContain("() => ({ reverse, shift }),");
    expect(PAGE).toContain("[reverse, shift],");
  });

  it("moves both when a link is put into effect, like every other field", () => {
    const apply = functionBody(PAGE, "applyViewLink");

    expect(apply).toContain("setReverse(updates.reverse);");
    expect(apply).toContain("setShift(updates.shift);");
  });

  it("writes them into the link the address bar follows", () => {
    // The fields are spelled once, in `viewLinkFor`, which takes the Shift to
    // write: the view's own for everything that follows the view, and the
    // palette actually on the canvas for a link the visitor copies while the
    // palette is cycling.
    const link = functionBody(PAGE, "viewLinkFor");

    expect(link).toContain("reverse,");
    expect(link).toContain("shift: shiftValue,");
    expect(PAGE).toContain(
      "const currentLink = useMemo(() => viewLinkFor(shift), [viewLinkFor, shift]);",
    );
  });

  it("draws the canvas with them, and repaints from kept counts with them", () => {
    const draw = functionBody(PAGE, "drawCanvas");

    // The config every render is made of carries them...
    expect(draw).toContain("colorOptions,");
    // ...and the repaint a colour change is, which colours the counts the last
    // render left, is asked for in the same settings: a repaint without them
    // would put the scheme's plain colours over a picture drawn reversed.
    expect(draw).toMatch(
      /renderer\.recolour\(\s*colorScheme,\s*effectiveMaxIterations,\s*colorOptions,\s*trap \?\? undefined,\s*\)/,
    );
    // The draw re-runs when they move, which is what a settings change is.
    expect(PAGE).toContain(
      "[bounds, effectiveMaxIterations, colorScheme, colorOptions, trap, wander]",
    );
  });

  it("draws an export with them, so a saved picture is the picture on screen", () => {
    const run = functionBody(PAGE, "runExport");

    expect(run).toContain("colorOptions,");
    // The export re-runs when they move, so a picture saved after a settings
    // change is the picture the change made.
    expect(PAGE).toMatch(
      /\[\s*effectiveMaxIterations,\s*colorScheme,\s*colorOptions,\s*trap,\s*fractalKind,\s*releaseExport,\s*\]/,
    );
  });

  it("probes the picture with them, so the swatch is the colour on screen", () => {
    const probe = PAGE.indexOf("probeAtPointer(");
    const call = PAGE.slice(probe, probe + 400);

    expect(call).toContain("colorOptions,");
  });

  it("tells the strip and the Math card about them, which show this view's colours", () => {
    /** A JSX element's own text, from its tag to the tag that closes it. */
    const element = (tag: string) => {
      const start = PAGE.indexOf(tag);
      if (start === -1) throw new Error(`${tag} is not in the page`);

      return PAGE.slice(start, PAGE.indexOf("/>", start));
    };

    // The tiles are drawn in the colours a click applies (the palette's two
    // settings and the trap, `thumbnailLook`), and the plot's dots in the
    // picture's own palette.
    expect(element("<NearbyStrip")).toContain("colorOptions={thumbnailLook}");
    expect(element("<MathCard")).toContain("colorOptions={colorOptions}");
  });

  it("puts them back when Reset View does", () => {
    const reset = functionBody(PAGE, "resetToDefault");

    expect(reset).toContain("setReverse(DEFAULT_VIEW_LINK_UPDATES.reverse);");
    expect(reset).toContain("setShift(DEFAULT_VIEW_LINK_UPDATES.shift);");
  });
});
