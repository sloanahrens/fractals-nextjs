/**
 * The Nearby strip and the journey buttons: the parts that live in markup
 *
 * What the suggestions are, when they refresh and how the More tile pages is
 * `nearbyStrip.test.ts`'s business, and the thumbnail queue is
 * `placeThumbnails.test.ts`'s. What a Node suite with no DOM cannot render is
 * the component and the page wiring, so this reads the sources the way the
 * canvas-first page and journey tests here do: the label, the tile buttons and
 * their names, the More tile, the focus hold, the pause while a render runs,
 * what a click on a tile sets, the crossfade, and Back and Forward.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const strip = source("../components/ui/NearbyStrip.tsx");
const page = source("../app/page.tsx");
const topBar = source("../components/ui/TopBar.tsx");

/** The body of the page's handler `name`, up to the next top-level `const`. */
function handlerBody(name: string): string {
  const start = page.indexOf(`const ${name} = `);
  if (start === -1) throw new Error(`${name} is not in the page`);

  const end = page.indexOf("\n  const ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

describe("the Nearby strip", () => {
  it("is labelled 'Nearby, worth a look', visibly and for a screen reader", () => {
    expect(strip).toContain(
      'export const NEARBY_LABEL = "Nearby, worth a look"',
    );
    expect(strip).toContain("{NEARBY_LABEL}");
    expect(strip).toContain('aria-labelledby="nearby-strip-label"');
    expect(strip).toContain('id="nearby-strip-label"');
  });

  it("lies over the bottom of the canvas on a dark gradient", () => {
    expect(strip).toContain("absolute inset-x-0 bottom-0");
    expect(strip).toContain("bg-gradient-to-t from-black/");

    // It is inside the wrapper that is exactly the canvas's size.
    const wrapper = page.indexOf('<div className="relative">');
    expect(wrapper).toBeGreaterThan(-1);
    expect(page.indexOf("<NearbyStrip")).toBeGreaterThan(wrapper);
    expect(page.indexOf("<NearbyStrip")).toBeLessThan(page.indexOf("</main>"));
  });

  it("makes each place a button named for it, with a caption on hover and focus", () => {
    expect(strip).toContain('type="button"');
    expect(strip).toContain("aria-label={place.name}");
    expect(strip).toContain("onClick={() => onSelect(place)}");
    // The caption shows on hover and on keyboard focus, and all the time where
    // there is no hover.
    expect(strip).toContain("group-hover:opacity-100");
    expect(strip).toContain("group-focus-visible:opacity-100");
    expect(strip).toContain("[@media(hover:none)]:opacity-100");
    // It repeats the name for the eye, so it is hidden from the reader.
    expect(strip).toMatch(/<span\s+aria-hidden="true"[\s\S]*?\{place\.name\}/);
  });

  it("scrolls sideways on a narrow screen and lets the canvas under its gaps pan", () => {
    expect(strip).toContain("overflow-x-auto");
    expect(strip).toMatch(/pointer-events-none absolute inset-x-0 bottom-0/);
    expect(strip).toContain("pointer-events-auto");
  });

  it("has a More tile, only when there is something beyond the page", () => {
    expect(strip).toMatch(/onClick=\{onMore\}[\s\S]*?>\s*More\s*</);
    expect(strip).toContain("{onMore && (");
    expect(page).toContain(
      "hasMoreNearby(nearby.pool.length) ? handleNearbyMore : undefined",
    );
    expect(page).toContain("nextNearbyOffset(previous.pool.length");
  });

  it("fades on the top bar's idle clock and stays up while a tile has focus", () => {
    expect(strip).toContain("useIdleVisibility(false, listKey)");
    expect(strip).toContain("{...focusProps}");
    expect(strip).toContain('shown ? "opacity-100" : "opacity-0"');
    // A faded strip takes no pointer events on its tiles.
    expect(strip).toContain(
      'shown ? "pointer-events-auto" : "pointer-events-none"',
    );
  });

  it("draws its pictures in the page's colours, with the flat placeholder for a failure", () => {
    expect(page).toContain("colorScheme={colorScheme}");
    expect(strip).toContain("store.request(place, colorScheme");
    expect(strip).toContain('entry.status === "ready"');
    expect(strip).toContain("entry.placeholder");
  });

  it("holds the thumbnails back while the main render runs", () => {
    expect(page).toContain("paused={isRendering}");
    expect(strip).toContain("if (paused) store.pause();");
    expect(strip).toContain("else store.resume();");
  });

  it("drops what is queued when the list changes or the strip goes", () => {
    expect(strip).toMatch(
      /useEffect\(\(\) => \(\) => store\.cancelAll\(\), \[store, listKey\]\)/,
    );
    // Tiles are keyed by the list, so a changed list asks for its pictures again.
    expect(strip).toContain("key={`${listKey}|${place.id}`}");
  });

  it("renders nothing for an empty list", () => {
    expect(strip).toContain("if (places.length === 0) return null;");
  });
});

describe("the suggestions", () => {
  it("come from suggest() over the catalogue for the view on screen", () => {
    expect(page).toContain("suggest(");
    expect(page).toContain("PLACES,");
    expect(page).toContain("NEARBY_POOL_SIZE");
    expect(page).toContain("zoom: zoomLevel");
  });

  it("refresh by the policy, once a render has settled", () => {
    expect(page).toContain("nearbyRefreshDue({");
    expect(page).toContain(
      'settled: renderedLink !== "" && renderedLink === currentLink',
    );
    expect(page).toContain("refreshedAt: nearby.refreshedAt");
  });

  it("count jumps and arriving links as deliberate, and nothing a drag does", () => {
    expect(page).toContain(
      "const deliberateMoves = jumpSerial + linkArrivals;",
    );
    expect(page).toContain("setLinkArrivals((count) => count + 1)");

    // applyView is what wheel, drag, keys and walk steps share.
    const applyView = page.slice(
      page.indexOf("const applyView = useCallback("),
      page.indexOf("// What one step of the walk does"),
    );
    expect(applyView).not.toContain("setJumpSerial");
    expect(applyView).not.toContain("setLinkArrivals");
    expect(applyView).not.toContain("beginJump");
  });

  it("are shown a page at a time, from the offset the More tile moves", () => {
    expect(page).toContain("places={nearbyWindow(nearby.pool, nearby.offset)}");
  });
});

describe("a click on a tile", () => {
  const handler = () => handlerBody("handlePlaceSelect");

  it("is a deliberate move, through the setters a preset uses", () => {
    const body = handler();

    expect(body).toContain("beginJump();");
    for (const setter of [
      "setFractalType(place.fractal)",
      "setCenterX(place.centerX)",
      "setCenterY(place.centerY)",
      "setZoomLevel(zoom)",
      "setColorScheme(scheme)",
      'setCurrentPreset("")',
      "wander.notifyActivity()",
    ]) {
      expect(body, setter).toContain(setter);
    }
    expect(page).toContain("onSelect={handlePlaceSelect}");
  });

  it("sets the Julia constant for a Julia place and keeps the scheme when the place names none", () => {
    const body = handler();

    expect(body).toContain(
      'if (place.fractal === "julia") setJuliaConstant(constant)',
    );
    expect(body).toContain("place.colorScheme ?? colorScheme");
  });

  it("does nothing for a place that is already the view", () => {
    const body = handler();

    expect(body).toContain("if (target === currentLink) return;");
    expect(body.indexOf("if (target === currentLink) return;")).toBeLessThan(
      body.indexOf("beginJump();"),
    );
  });

  it("leaves one history entry through the follower, not a push of its own", () => {
    expect(handler()).not.toContain("pushState");
    expect(handler()).not.toContain("pushViewLink");
    expect(page.match(/pushState\(/g)).toHaveLength(1);
  });
});

describe("the crossfade", () => {
  it("holds the old frame in a second canvas layer over the first", () => {
    expect(page).toContain("ref={crossfadeRef}");
    expect(page).toMatch(
      /ref=\{crossfadeRef\}[\s\S]*?aria-hidden="true"[\s\S]*?pointer-events-none absolute inset-0/,
    );
    expect(page.indexOf("ref={crossfadeRef}")).toBeGreaterThan(
      page.indexOf("ref={canvasRef}"),
    );
    expect(page).toContain('overlay.getContext("2d")?.drawImage(canvas, 0, 0)');
  });

  it("is skipped under prefers-reduced-motion", () => {
    const start = page.indexOf("const startCrossfade");
    const body = page.slice(start, page.indexOf("useEffect(", start));

    expect(body).toContain(
      'window.matchMedia("(prefers-reduced-motion: reduce)").matches',
    );
    // The check comes before the old frame is copied or shown.
    expect(body.indexOf("prefers-reduced-motion")).toBeLessThan(
      body.indexOf("drawImage"),
    );
    expect(body.indexOf("prefers-reduced-motion")).toBeLessThan(
      body.indexOf('style.opacity = "1"'),
    );
  });

  it("fades out over 400 ms once the new view is drawn, or the user moves off it", () => {
    expect(page).toContain("CROSSFADE_MS");
    expect(page).toContain("renderedLink !== target");
    expect(page).toContain("currentLink === target");
    expect(page).toContain('overlay.style.opacity = "0"');
    expect(page).toMatch(/opacity \$\{CROSSFADE_MS\}ms/);
  });
});

describe("Back and Forward", () => {
  it("are buttons named Back and Forward in the top bar", () => {
    expect(topBar).toMatch(/>\s*Back\s*</);
    expect(topBar).toMatch(/>\s*Forward\s*</);
    expect(topBar).toContain("onClick={onBack}");
    expect(topBar).toContain("onClick={onForward}");
  });

  it("are disabled when the journey has nowhere to go", () => {
    expect(topBar).toContain("disabled={!canGoBack}");
    expect(topBar).toContain("disabled={!canGoForward}");
    expect(page).toContain("canGoBack={historyState.canGoBack}");
    expect(page).toContain("canGoForward={historyState.canGoForward}");
    expect(page).toContain("historyButtons(journey)");
  });

  it("call the browser's history, which the hashchange listener follows", () => {
    expect(page).toContain("const handleBack = () => window.history.back();");
    expect(page).toContain(
      "const handleForward = () => window.history.forward();",
    );
    expect(page).toContain("onBack={handleBack}");
    expect(page).toContain("onForward={handleForward}");
  });

  it("are brought up to date wherever the journey moves", () => {
    // A push by a jump, and an arrival by Back, Forward or a pasted link.
    const pushed = page.indexOf("journey.push(fragment);");
    expect(page.indexOf("syncHistoryButtons();", pushed)).toBeGreaterThan(
      pushed,
    );

    const arrived = page.indexOf("journey.arrive(window.location.hash);");
    expect(page.indexOf("syncHistoryButtons();", arrived)).toBeGreaterThan(
      arrived,
    );
  });
});
