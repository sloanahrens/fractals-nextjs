/**
 * Sharing a view: the parts of it that live in the page
 *
 * Four things about a shareable link are decided in `FractalExplorer.tsx` and nowhere
 * else: the fragment is read from `window.location.hash` in an effect rather
 * than during render, a fragment that changes while the page is open is read by
 * the same effect path through a `hashchange` listener, the address bar is
 * moved with `replaceState` rather than an assignment to it, and the Copy link
 * button falls back to a field the user can select from when the clipboard will
 * not take the URL. The suite runs in Node with no DOM to render into, so this
 * reads the page source instead, the way the manual coordinates and version
 * tests here do.
 *
 * What a link means once it is decoded is `viewLinkState`'s own test's
 * business, and what the codec writes is `viewLink`'s.
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
    expect(relative(SRC_DIRECTORY, PAGE_PATH)).toBe("app/FractalExplorer.tsx");
    expect(page.length).toBeGreaterThan(1000);
  });

  it("sits in the Navigation panel, under the buttons that move the view", () => {
    // The button's own text, not the words: "Reset View" and "Copy link" are
    // both said in comments further up the file, and an anchor that lands on
    // one of those would pass wherever the button was.
    const viewButtons = page.search(/>\s*Reset View\s*</);
    const copyButton = page.search(/>\s*Copy link\s*</);
    const autoWander = page.indexOf('label="Auto-wander"');

    expect(viewButtons).toBeGreaterThan(-1);
    expect(copyButton).toBeGreaterThan(viewButtons);
    expect(autoWander).toBeGreaterThan(copyButton);
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
    const applied = effectBody(page, "linkAppliedRef.current = true;");

    expect(applied).toContain("if (linkAppliedRef.current) return;");
    expect(applied).toContain("applyViewLink(link.fragment)");

    // The setters are not in this effect: they are in the one function both
    // reads of a fragment share.
    const apply = functionBody(page, "applyViewLink");

    for (const setter of [
      "setFractalType(",
      "setVariant(",
      "setCenterX(",
      "setCenterY(",
      "setZoomLevel(",
      "setColorScheme(",
      "setAutoIterationsOn(",
      "setMaxIterations(",
      "setCanvasWidth(",
      "setCanvasHeight(",
    ]) {
      expect(apply).toContain(setter);
    }
    // And what it reads a fragment through is the pure half, not a second
    // reading kept beside it.
    expect(apply).toContain("viewLinkUpdatesFrom(fragment)");
  });

  it("applies a fragment edited into it on a page already open", () => {
    // A fragment can change without the document reloading — a paste into the
    // address bar, a same-document link — and the mount read has already had
    // its turn by then. The event is the only notice, and it has to reach the
    // same apply path, or the page keeps its view and the follower writes that
    // view back over the fragment.
    const listener = effectBody(page, 'window.addEventListener("hashchange"');

    expect(listener).toContain("applyViewLink(window.location.hash)");
    // A listener an effect adds is a listener the effect takes away.
    expect(listener).toContain(
      'window.removeEventListener("hashchange", handleHashChange)',
    );
  });

  it("is moved with replaceState, so a view is not a place to go back to", () => {
    // Only a deliberate jump makes an entry, and that is `pushViewLink`'s one
    // call (journey-history-panel.test.ts); the follower and Copy link write
    // through `writeViewLink`, which only rewrites the current entry.
    expect(page).toContain("window.history.replaceState(");
    expect(page).not.toMatch(/location\.hash\s*=[^=]/);
    expect(functionBody(page, "writeViewLink")).not.toContain("pushState");
    expect(page.match(/pushState\(/g)).toHaveLength(1);
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
    // draw did not settle the canvas. The repaint from kept counts names its
    // view too (it is showing it), and needs no token: it is synchronous, so
    // there is nothing for a newer draw to overtake.
    const draw = functionBody(page, "drawCanvas");

    expect(draw).toContain("setRenderedLink(link)");
    expect(draw.indexOf("if (token === drawTokenRef.current)")).toBeLessThan(
      draw.lastIndexOf("setRenderedLink(link)"),
    );
    expect(page).toContain(
      "drawCanvas(renderPolicy.requestRender(), currentLink)",
    );
  });
});

describe("the query form", () => {
  it("is what Copy link copies, on this origin and path", () => {
    const copy = functionBody(page, "handleCopyLink");

    // The bar is still brought up to date in the hash form first — with the
    // palette the canvas is painted with, which is the view's own Shift unless
    // the palette is cycling — and nothing else in the page writes the query
    // form: the clipboard gets it, the bar does not.
    expect(copy).toContain("const link = viewLinkFor(cycleShiftRef.current);");
    expect(copy).toContain("writeViewLink(`#${link}`");
    expect(copy).toContain("copyLinkUrl(");
    expect(copy).toContain("window.location.origin");
    expect(copy).toContain("window.location.pathname");
    expect(copy).not.toContain("window.location.href");
    expect(page.match(/copyLinkUrl\(/g)).toHaveLength(1);
  });

  it("is read at mount through the one function that knows the two forms", () => {
    const applied = effectBody(page, "linkAppliedRef.current = true;");

    expect(applied.replace(/\s+/g, " ")).toContain(
      "readLocationLink(window.location.search, window.location.hash)",
    );
    // The query goes from the bar by replaceState, never by an assignment that
    // would reload the page, and a refusal does not stop the view being read.
    expect(applied).toContain("if (link.dropQuery)");
    expect(applied).toContain("window.history.replaceState(");
    expect(applied.indexOf("replaceState(")).toBeLessThan(
      applied.indexOf("applyViewLink(link.fragment)"),
    );
  });

  it("is not read by the hashchange listener: only a load has a query", () => {
    const listener = effectBody(page, 'window.addEventListener("hashchange"');

    expect(listener).not.toContain("readLocationLink");
  });
});
