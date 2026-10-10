/**
 * Recolouring without recounting: the parts of it that live in the page
 *
 * That a repaint from kept counts is the picture a full render draws is
 * `FractalRenderer`'s own test's business, and that the two steps of the
 * pipeline compose to what one pass drew is `renderRgba`'s. What is decided
 * here — in `FractalExplorer.tsx` and nowhere else — is when the page may ask
 * for one at all: a full-quality draw of a view whose link is the one the
 * canvas is already showing, once the colours have been taken out of both, with
 * the full render still there as the answer when the renderer has kept
 * nothing.
 *
 * The suite runs in Node with no DOM to render into, so this reads the page
 * source, the way the other panel tests here do.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIRECTORY = fileURLToPath(new URL("..", import.meta.url));
const PAGE_PATH = fileURLToPath(
  new URL("../app/FractalExplorer.tsx", import.meta.url),
);
const page = readFileSync(PAGE_PATH, "utf8");

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

describe("the recolour path in the draw", () => {
  const draw = functionBody(page, "drawCanvas");

  it("reads the page it is checking", () => {
    expect(relative(SRC_DIRECTORY, PAGE_PATH)).toBe("app/FractalExplorer.tsx");
    expect(draw.length).toBeGreaterThan(1000);
  });

  it("is only for a full draw, after a preview's own path has returned", () => {
    const preview = draw.indexOf('quality === "preview"');
    const guard = draw.indexOf("linkWithoutColour(showing)");

    expect(preview).toBeGreaterThan(-1);
    // A gesture's step is a cheap low-resolution pass over a view that is
    // moving; there is nothing kept to repaint from at all.
    expect(guard).toBeGreaterThan(preview);
  });

  it("asks for a repaint only when nothing but the colours have moved", () => {
    // The canvas must be showing something, and the two links must agree once
    // each has had its colours taken out — the scheme, its reversal and its
    // shift — while fractal, variant, centre, zoom, iteration cap and canvas
    // size are all in the link, so agreeing on the rest is agreeing on every
    // input the counts depend on.
    expect(draw).toContain('showing !== ""');
    expect(draw).toContain(
      "linkWithoutColour(showing) === linkWithoutColour(link)",
    );
    // The rule lives in the codec, so the page and a link agree on what a
    // colour-free view is.
    expect(page).toContain("linkWithoutColour } from");
  });

  it("renders in full when the renderer has kept nothing", () => {
    const guard = draw.indexOf("linkWithoutColour(showing)");
    const render = draw.indexOf("renderFractal(");

    // The repaint is the condition of the same `if`, so a false answer falls
    // through to the render below rather than leaving the canvas alone: a
    // renderer that has not finished a render, was rebuilt for a new canvas or
    // fractal, or had its run cancelled is drawn exactly as it always was.
    expect(draw).toContain(
      "renderer.recolour(colorScheme, effectiveMaxIterations, colorOptions)",
    );
    expect(render).toBeGreaterThan(guard);
    expect(guard).toBeLessThan(draw.indexOf("renderer.recolour("));
  });

  it("counts no orbits and reports no progress of its own", () => {
    const branch = draw.slice(
      draw.indexOf("if ("),
      draw.indexOf("renderer.recolour("),
    );

    // A repaint is synchronous and is over before anything could watch it, so
    // it touches neither the progress bar nor the walk's clock.
    expect(branch).not.toContain("onProgress");
    expect(branch).not.toContain("notifyRender");
  });

  it("names the view it repainted, as a render does", () => {
    const repainted = draw.slice(
      draw.indexOf("renderer.recolour("),
      draw.indexOf("renderer.recolour(") + 700,
    );

    // The canvas is showing this view in the new colours, so it is the drawn
    // view the address bar may name.
    expect(repainted).toContain("setRenderedLink(link)");
  });

  it("reads the shown view through a ref, so the draw does not depend on it", () => {
    // As a value in `drawCanvas`'s dependencies the draw effect would run again
    // every time a render settled, redrawing what it had just drawn.
    expect(page).toContain("const renderedLinkRef = useRef(renderedLink);");
    expect(draw).toContain("renderedLinkRef.current");
    expect(page).toContain(
      "[bounds, effectiveMaxIterations, colorScheme, colorOptions, wander]",
    );
  });

  it("writes its record of the shown view wherever it writes the state", () => {
    const writes = draw.match(/renderedLinkRef\.current = link/g) ?? [];
    const sets = draw.match(/setRenderedLink\(link\)/g) ?? [];

    // One for the repaint, one for the render that finished: a record written
    // in fewer places than the state is a record that drifts.
    expect(writes).toHaveLength(2);
    expect(sets).toHaveLength(2);
  });
});
