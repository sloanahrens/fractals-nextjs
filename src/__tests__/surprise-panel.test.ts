/**
 * Surprise me and Auto-wander: the parts that live in markup
 *
 * Which place a press picks is `surprise.test.ts`'s business. What a Node suite
 * with no DOM cannot render is the button and the Settings card, so this reads
 * the sources the way the Nearby strip and canvas-first page tests here do: the
 * button and its accessible name in the top bar, the press going through the
 * tile's handler, the Random walk checkbox gone from Navigation, and the
 * Auto-wander card in the drawer.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/page.tsx");
const topBar = source("../components/ui/TopBar.tsx");
const help = source("../lib/helpEntries.ts");

/** The body of the page's handler `name`, up to the next top-level `const`. */
function handlerBody(name: string): string {
  const start = page.indexOf(`const ${name} = `);
  if (start === -1) throw new Error(`${name} is not in the page`);

  const end = page.indexOf("\n  const ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

describe("the Surprise me button", () => {
  it("is a button in the top bar whose name is 'Surprise me'", () => {
    expect(topBar).toMatch(
      /<button\s+type="button"\s+onClick=\{onSurprise\}[^>]*>\s*Surprise me\s*<\/button>/,
    );
  });

  it("sits between the title and the buttons on the right", () => {
    const title = topBar.search(/<h1[^>]*>Fractal Explorer<\/h1>/);
    const surprise = topBar.search(/>\s*Surprise me\s*<\/button>/);

    expect(title).toBeGreaterThan(-1);
    expect(surprise).toBeGreaterThan(title);
    expect(surprise).toBeLessThan(topBar.indexOf("onClick={onBack}"));
  });

  it("is disabled when there is no place to go, and reachable by Tab otherwise", () => {
    expect(topBar).toContain("disabled={!canSurprise}");
    // A native button is in the tab order; nothing may take it out.
    expect(topBar).not.toContain("tabIndex={-1}");
  });

  it("is wired to the page's handler and the availability it works out", () => {
    expect(page).toContain("onSurprise={handleSurprise}");
    expect(page).toContain("canSurprise={canSurprise}");
    expect(page).toContain(
      "const canSurprise = surpriseTarget(placeView, PLACES, () => 0) !== null;",
    );
  });

  it("goes to the place through the Nearby tile's handler", () => {
    const body = handlerBody("handleSurprise");

    expect(body).toContain("surpriseTarget(placeView, PLACES)");
    expect(body).toContain("handlePlaceSelect(target)");
    // The tile's handler is the crossfade and the one history entry; Surprise
    // me has no setters or push of its own to drift from it.
    expect(body).not.toContain("setCenterX");
    expect(body).not.toContain("pushState");
    expect(body).not.toContain("beginJump");
  });

  it("measures the view from the page's own state", () => {
    const start = page.indexOf("const placeView = {");
    const view = page.slice(start, page.indexOf("};", start));

    for (const field of [
      "fractal: fractalType",
      "juliaConstant",
      "centerX",
      "centerY",
      "zoom: zoomLevel",
    ]) {
      expect(view, field).toContain(field);
    }
  });
});

describe("Auto-wander", () => {
  const drawer = page.slice(
    page.indexOf("<SettingsDrawer"),
    page.indexOf("</SettingsDrawer>"),
  );
  const navigation = drawer.slice(
    drawer.indexOf(">Navigation<"),
    drawer.indexOf(">Auto-wander<"),
  );

  it("reads the drawer it is checking", () => {
    expect(drawer.length).toBeGreaterThan(1000);
    expect(navigation.length).toBeGreaterThan(100);
  });

  it("is a card of its own whose checkbox reads Auto-wander", () => {
    expect(drawer).toMatch(/<h3[^>]*>Auto-wander<\/h3>/);
    expect(drawer).toContain('label="Auto-wander"');
    expect(drawer.match(/label="Auto-wander"/g)).toHaveLength(1);
  });

  it("keeps the interval box, the handlers and the countdown line", () => {
    const card = drawer.slice(drawer.indexOf(">Auto-wander<"));

    expect(card).toContain("onChange={handleWanderChange}");
    expect(card).toContain('label="Seconds between steps"');
    expect(card).toContain("onChange={handleWanderIntervalChange}");
    expect(card).toContain("Next step in about");
  });

  it("is gone from the Navigation card, and Random walk is named nowhere", () => {
    expect(navigation).not.toContain("handleWanderChange");
    expect(navigation).not.toContain("Seconds between steps");
    expect(page).not.toContain("Random walk");
    expect(page).not.toContain('label="Random walk"');
  });

  it("is what the Help overlay calls it, and Help describes Surprise me", () => {
    expect(help).not.toMatch(/random walk/i);
    expect(help).toContain('keys: "Auto-wander"');
    expect(help).toContain('keys: "Surprise me"');
  });
});
