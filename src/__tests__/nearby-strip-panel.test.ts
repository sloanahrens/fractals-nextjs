/**
 * The Nearby strip and the journey buttons: the parts that live in markup
 *
 * What the suggestions are, when they refresh and how the More tile pages is
 * `nearbyStrip.test.ts`'s business, and the thumbnail queue is
 * `placeThumbnails.test.ts`'s. What a Node suite with no DOM cannot render is
 * the component and the page wiring, so this reads the sources the way the
 * canvas-first page and journey tests here do: the label, the tile buttons and
 * their names, the More tile, no fade and the `hidden` prop, the pause while a render runs,
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

  it("never fades: only the top bar does", () => {
    expect(strip).toContain('data-visible="true"');
    expect(strip).not.toContain("useIdleVisibility");
    expect(strip).not.toContain("idleFade");
    expect(strip).not.toContain("focusProps");
    expect(strip).not.toContain("shown");
    expect(strip).not.toContain("transitionDuration");
    // The tiles' row takes pointer events all the time.
    expect(strip).toContain(
      '<div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1">',
    );
    // The bar keeps its own fade.
    expect(topBar).toContain("useIdleVisibility(settingsOpen)");
  });

  it("takes an optional hidden prop that renders nothing and asks for no pictures", () => {
    expect(strip).toContain("hidden?: boolean;");
    expect(strip).toContain("hidden = false,");
    // Hooks run first, then the early return, so no tile mounts and no tile
    // can ask the store for a picture.
    expect(strip).toContain("if (hidden || places.length === 0) return null;");
    expect(strip.indexOf("if (hidden ||")).toBeLessThan(strip.indexOf("<Tile"));
    // What was queued before it was hidden is dropped.
    expect(strip).toContain(
      "useEffect(() => () => store.cancelAll(), [store, listKey, hidden]);",
    );
    // Only the tiles ask the store.
    expect(strip.match(/store\.request\(/g)).toHaveLength(1);
  });

  it("draws each picture in the scheme its click applies, with the flat placeholder for a failure", () => {
    // The page hands over its own scheme for the places that name none.
    expect(page).toContain("colorScheme={colorScheme}");
    // The tile and the click ask the one rule, and the tile asks the store for
    // the scheme that rule gave, never for the page's directly.
    expect(strip).toContain(
      "const scheme = placeColorScheme(place, colorScheme);",
    );
    expect(strip).toContain("store.request(place, scheme,");
    expect(strip).not.toContain("store.request(place, colorScheme");
    expect(handlerBody("handlePlaceSelect")).toContain(
      "const scheme = placeColorScheme(place, colorScheme);",
    );
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
      /useEffect\(\(\) => \(\) => store\.cancelAll\(\), \[store, listKey, hidden\]\)/,
    );
    // Tiles are keyed by the list, so a changed list asks for its pictures again.
    expect(strip).toContain("key={`${listKey}|${place.id}`}");
  });

  it("does not repaint a tile whose place keeps its own scheme when the page's changes", () => {
    // The list key is the places alone: with the page's scheme in it, a colour
    // change would cancel the queue and remount every tile.
    expect(strip).toContain(
      'const listKey = places.map((place) => place.id).join(",");',
    );
    // The request effect depends on the resolved scheme, which a place that
    // names its own never changes.
    expect(strip).toContain("}, [store, place, scheme]);");
  });

  it("renders nothing for an empty list", () => {
    expect(strip).toContain("places.length === 0) return null;");
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

  it("sets the Julia constant for a Julia place and takes the scheme from the shared rule", () => {
    const body = handler();

    expect(body).toContain(
      'if (place.fractal === "julia") setJuliaConstant(constant)',
    );
    expect(body).toContain("placeColorScheme(place, colorScheme)");
    // The rule lives in places.ts alone, so the click cannot drift from the tile.
    expect(body).not.toContain("place.colorScheme");
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
    // A tile's fade is the default; a tour's hop asks for its own.
    expect(page).toMatch(/durationMs = CROSSFADE_MS/);
    expect(page).toContain("renderedLink !== target");
    expect(page).toContain("currentLink === target");
    expect(page).toContain('overlay.style.opacity = "0"');
    expect(page).toMatch(/opacity \$\{crossfadeMsRef\.current\}ms/);
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
