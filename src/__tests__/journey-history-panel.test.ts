/**
 * The journey history: the parts of it that live in the page
 *
 * Which handlers make a history entry, that the entry is written once the jump
 * has been drawn and not before, that Back and Forward come in by the same path
 * a pasted link does, and that a refused `pushState` is not an error are all
 * decided in `page.tsx`. The suite runs in Node with no DOM to render into, so
 * this reads the page source, the way the share link tests here do. What the
 * journey itself does is `journey.test.ts`'s business.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const page = readFileSync(
  fileURLToPath(new URL("../app/page.tsx", import.meta.url)),
  "utf8",
);

/** The body of a `const NAME = ...` function in the page, braces and all. */
function functionBody(name: string): string {
  const declaration = page.indexOf(`const ${name} = `);
  if (declaration === -1) throw new Error(`${name} is not in the page`);

  const open = page.indexOf("{", declaration);
  let depth = 0;

  for (let index = open; index < page.length; index++) {
    if (page[index] === "{") depth++;
    if (page[index] === "}" && --depth === 0) {
      return page.slice(open, index + 1);
    }
  }

  throw new Error(`unbalanced braces in ${name}`);
}

describe("the handlers that make a history entry", () => {
  it.each([
    "applyManualCoordinates",
    "handleFractalTypeChange",
    "handleVariantSelect",
    "handlePresetSelect",
  ])("%s begins a jump", (handler) => {
    expect(functionBody(handler)).toContain("beginJump()");
  });

  it("begins a jump for a named constant but not for a custom one typed in", () => {
    const select = functionBody("handleVariantSelect");

    // The named pick is a jump; the Custom option changes the controls and not
    // the picture, so it is not one.
    expect(select.indexOf("beginJump()")).toBeLessThan(
      select.indexOf("handleVariantChange(value)"),
    );
    // Every readable keystroke reaches this handler, so it makes no entry.
    expect(functionBody("handleVariantChange")).not.toContain("beginJump");
    expect(functionBody("editJuliaInput")).not.toContain("beginJump");
  });

  it("does not begin a jump for a gesture, a zoom button or a walk step", () => {
    expect(functionBody("applyView")).not.toContain("beginJump");
    expect(functionBody("handleViewChange")).not.toContain("beginJump");
    expect(functionBody("handleCenterChange")).not.toContain("beginJump");
    expect(functionBody("resetToDefault")).not.toContain("beginJump");
  });

  it("does not begin a jump when Apply Coordinates refuses its boxes", () => {
    const apply = functionBody("applyManualCoordinates");

    expect(apply.indexOf("if (!checked.ok)")).toBeLessThan(
      apply.indexOf("beginJump()"),
    );
  });
});

describe("the entry a jump makes", () => {
  it("is pushed once, when the jump's view has been drawn, and past the throttle", () => {
    const writer = page.slice(
      page.indexOf("if (currentLink !== renderedLink) return;"),
      page.indexOf("shouldWriteLink(window.location.hash"),
    );
    const drawn = writer.indexOf("if (currentLink !== renderedLink) return;");
    const handled = writer.indexOf("jumpSerial !== handledJumpRef.current");
    const pushed = writer.indexOf("pushViewLink(next, now)");

    expect(drawn).toBeGreaterThan(-1);
    expect(handled).toBeGreaterThan(drawn);
    expect(pushed).toBeGreaterThan(handled);
    // The jump is marked handled before it is written, so it is one push.
    expect(writer.indexOf("handledJumpRef.current = jumpSerial")).toBeLessThan(
      pushed,
    );
  });

  it("leaves the view being left in the entry before it", () => {
    const begin = functionBody("beginJump");
    const leaving = functionBody("writeLeavingView");

    // The write is only of a view that has been drawn.
    expect(leaving).toContain("renderedLink === currentLink");
    expect(leaving).toContain("writeViewLink(");
    expect(begin.indexOf("writeLeavingView()")).toBeGreaterThan(-1);
    expect(begin.indexOf("writeLeavingView()")).toBeLessThan(
      begin.indexOf("setJumpSerial("),
    );
  });

  it("is a replace, with the journey still told, when pushState throws", () => {
    const push = functionBody("pushViewLink");

    expect(push).toContain("window.history.pushState(null");
    expect(push.indexOf("try {")).toBeLessThan(push.indexOf("pushState"));
    expect(push.indexOf("catch")).toBeGreaterThan(push.indexOf("pushState"));
    expect(push.indexOf("replaceAddressBar(fragment)")).toBeGreaterThan(
      push.indexOf("catch"),
    );
    expect(push).toContain("journey.push(fragment)");
    // Nothing in the catch rethrows.
    expect(push).not.toMatch(/\bthrow\b/);
  });

  it("is not made for a fragment the address bar already holds", () => {
    expect(functionBody("pushViewLink")).toContain(
      "if (window.location.hash === fragment) return;",
    );
  });
});

describe("Back and Forward", () => {
  it("tell the journey, then apply the fragment by the path a paste takes", () => {
    const start = page.indexOf('window.addEventListener("hashchange"');
    const listener = page.slice(
      page.lastIndexOf("useEffect(", start),
      page.indexOf("}, [", start),
    );

    expect(
      listener.indexOf("journey.arrive(window.location.hash)"),
    ).toBeGreaterThan(-1);
    expect(listener.indexOf("journey.arrive(")).toBeLessThan(
      listener.indexOf("applyViewLink(window.location.hash)"),
    );
    // One path: there is no popstate listener beside it.
    expect(page).not.toContain('"popstate"');
  });

  it("start from the entry the page opened on", () => {
    expect(page).toContain("journey.replace(window.location.hash)");
  });

  it("see the follower's rewrites as the current entry changing", () => {
    expect(functionBody("writeViewLink")).toContain(
      "journey.replace(fragment)",
    );
  });
});
