/**
 * Sharing a view: the parts of it that live in the page
 *
 * Three things about a shareable link are decided in `page.tsx` and nowhere
 * else: the fragment is read from `window.location.hash` in an effect rather
 * than during render, the address bar is moved with `replaceState` rather than
 * an assignment to it, and the Copy link button falls back to a field the user
 * can select from when the clipboard will not take the URL. The suite runs in
 * Node with no DOM to render into, so this reads the page source instead, the
 * way the manual coordinates and version tests here do.
 *
 * What a link means once it is decoded is `viewLinkState`'s own test's
 * business, and what the codec writes is `viewLink`'s.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIRECTORY = fileURLToPath(new URL("..", import.meta.url));
const PAGE_PATH = fileURLToPath(new URL("../app/page.tsx", import.meta.url));
const page = readFileSync(PAGE_PATH, "utf8");

/**
 * The body of the effect that contains the first `marker` in a source, from its
 * `useEffect(` to the dep list that closes it.
 *
 * Where a read of `window` happens — in an effect and not in the render — is
 * the whole of what makes it safe, and a source walk is the only way to see it
 * without a browser.
 */
function effectBody(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at === -1) throw new Error(`${marker} is not in the page`);

  const start = source.lastIndexOf("useEffect(", at);
  const end = source.indexOf("}, [", at);
  if (start === -1 || end === -1) throw new Error(`no effect around ${marker}`);

  return source.slice(start, end);
}

/**
 * The body of a `const NAME = ...` function in a source, braces and all.
 *
 * What a handler does in order — and only the newest draw may say which view
 * the canvas settled on — is part of what makes it correct, and a source walk
 * is the only way to see it without a browser.
 */
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

describe("the copy link control", () => {
  it("reads the page it is checking", () => {
    expect(relative(SRC_DIRECTORY, PAGE_PATH)).toBe("app/page.tsx");
    expect(page.length).toBeGreaterThan(1000);
  });

  it("sits in the Navigation panel, under the buttons that move the view", () => {
    // The button's own text, not the words: "Reset View" and "Copy link" are
    // both said in comments further up the file, and an anchor that lands on
    // one of those would pass wherever the button was.
    const viewButtons = page.search(/>\s*Reset View\s*</);
    const copyButton = page.search(/>\s*Copy link\s*</);
    const randomWalk = page.indexOf('label="Random walk"');

    expect(viewButtons).toBeGreaterThan(-1);
    expect(copyButton).toBeGreaterThan(viewButtons);
    expect(randomWalk).toBeGreaterThan(copyButton);
    // The button fires the handler the rest of this file follows.
    expect(page).toContain("onClick={handleCopyLink}");
    expect(page).toContain("const handleCopyLink = ");
  });

  it("says what it did in a status region, and offers the URL when it cannot", () => {
    expect(page).toContain('role="status"');
    expect(page).toContain('"Link copied"');
    expect(page).toContain('"Press Ctrl+C to copy"');

    // The URL to copy by hand is a read-only field, selectable and reachable
    // by a screen reader, and it is only in the page while it is wanted.
    expect(page).toContain("readOnly");
    expect(page).toContain('aria-label="View link"');
    expect(page).toContain('copy.kind === "manual"');
  });

  it("falls back when the clipboard is missing or refuses the write", () => {
    // Both failures reach the same field: a navigator with no clipboard at all
    // takes the branch, and a rejected write is the rejection handler of the
    // same promise.
    const fallback = page.indexOf("const offerToSelect =");
    const missingClipboard = page.indexOf("if (!clipboard) {");
    const rejected = page.indexOf("}, offerToSelect)");

    expect(fallback).toBeGreaterThan(-1);
    expect(missingClipboard).toBeGreaterThan(fallback);
    expect(rejected).toBeGreaterThan(missingClipboard);
  });
});

describe("the address bar", () => {
  it("is read in an effect after mount, once, never while rendering", () => {
    // The read is inside an effect, it happens once however often the page
    // renders, and it moves the view through the setters every other control
    // uses. Reading `window` while rendering would be markup that differs from
    // the server's.
    const applied = effectBody(page, "decodeView(window.location.hash)");

    expect(applied).toContain("if (linkAppliedRef.current) return;");

    for (const setter of [
      "setFractalType(",
      "setJuliaConstant(",
      "setCenterX(",
      "setCenterY(",
      "setZoomLevel(",
      "setColorScheme(",
      "setAutoIterationsOn(",
      "setMaxIterations(",
      "setCanvasWidth(",
      "setCanvasHeight(",
    ]) {
      expect(applied).toContain(setter);
    }
  });

  it("is moved with replaceState, so a view is not a place to go back to", () => {
    expect(page).toContain("window.history.replaceState(");
    expect(page).not.toContain("location.hash =");
    expect(page).not.toContain("pushState");
  });

  it("is written for a drawn view only, and only as often as the throttle allows", () => {
    const writer = effectBody(page, "shouldWriteLink(window.location.hash");
    // The gate is the view the last finished render drew: a view still being
    // drawn, or one no render has produced, is not written.
    const drawn = writer.indexOf("if (currentLink !== renderedLink) return;");
    const written = writer.indexOf("writeViewLink(next, now)");

    expect(drawn).toBeGreaterThan(-1);
    expect(written).toBeGreaterThan(drawn);
    // A write the interval holds back is scheduled rather than dropped, or the
    // address bar would keep a view the page has left.
    expect(writer).toContain("setTimeout");
    expect(writer).toContain("linkWriteDelayMs(");
  });

  it("keeps the drawn view's place in the URL, and no other", () => {
    // A finished render is what makes a view the address bar may name, so the
    // draw is handed the link it is drawing and hands it back when it is done —
    // and only the draw that is still the newest one does, since a superseded
    // draw did not settle the canvas.
    const draw = functionBody(page, "drawCanvas");

    expect(draw).toContain("setRenderedLink(link)");
    expect(draw.indexOf("if (token === drawTokenRef.current)")).toBeLessThan(
      draw.indexOf("setRenderedLink(link)"),
    );
    expect(page).toContain(
      "drawCanvas(renderPolicy.requestRender(), currentLink)",
    );
  });
});
