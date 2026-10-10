/**
 * Sharing a walk, and playing one: the parts that live in the page
 *
 * The button that copies a tour link, the load that reads one, the tour that
 * walks its stops and the input that gives the walk up are all decided in
 * `FractalExplorer.tsx`. The suite runs in Node with no DOM to render into, so
 * this reads the sources the way the tour mode and share link tests here do.
 *
 * Which stop comes next is `tourPlaylist.test.ts`'s business, what a tour link
 * is on the wire is `tourLink.test.ts`'s, and what a copied URL is is
 * `viewQuery.test.ts`'s.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/FractalExplorer.tsx");
const help = source("../lib/helpEntries.ts");
const readme = source("../../README.md");

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

/** The text of the effect whose body contains `marker`, up to its deps. */
function effectContaining(marker: string): string {
  const at = page.indexOf(marker);
  if (at === -1) throw new Error(`${marker} is not in the page`);

  const start = page.lastIndexOf("useEffect(", at);
  const end = page.indexOf("\n  }, [", at);
  return page.slice(start, end === -1 ? undefined : end);
}

describe("the Copy tour link button", () => {
  it("sits beside Copy link in the Navigation card, and only there", () => {
    const copy = page.search(/>\s*Copy link\s*</);
    const tour = page.search(/>\s*Copy tour link\s*</);
    const autoWander = page.indexOf('label="Auto-wander"');

    expect(copy).toBeGreaterThan(-1);
    expect(tour).toBeGreaterThan(copy);
    expect(tour).toBeLessThan(autoWander);
    expect(page.match(/>\s*Copy tour link\s*</g)).toHaveLength(1);
    expect(page).toContain("onClick={handleCopyTourLink}");
  });

  it("is off, and says why, until there are two places to walk", () => {
    // A walk is at least two stops, and the page opens on one, so the button is
    // disabled — with the reason under it rather than a control that quietly
    // does nothing.
    const onClick = page.indexOf("onClick={handleCopyTourLink}");
    const button = page.slice(
      page.lastIndexOf("<Button", onClick),
      page.indexOf("</Button>", onClick),
    );

    expect(button).toContain("disabled={!canCopyTourLink}");
    expect(button).toContain("Copy tour link");
    expect(page).toContain(
      "const canCopyTourLink = tourStops.length >= MIN_TOUR_STOPS;",
    );
    expect(page).toContain("{!canCopyTourLink && (");
    expect(page).toContain(
      'const COPY_TOUR_HINT = "Visit a couple of places first";',
    );
  });

  it("is built from the places the journey has walked, the view on screen last", () => {
    const stops = page.slice(
      page.indexOf("const tourStops = useMemo("),
      page.indexOf("const canCopyTourLink"),
    );

    expect(stops).toContain("playlistStops(journey.visited,");
    expect(stops).toContain("viewLinkUpdatesFrom(");
    expect(stops).toContain("currentLink");
  });

  it("is a query URL, and reuses Copy link's clipboard path", () => {
    const tour = functionBody("handleCopyTourLink");

    // The URL is the walk as a query on this origin and path, and it goes to
    // the clipboard through the one function both buttons share: the page has
    // no second clipboard write, and the "Link copied" confirmation is that
    // function's.
    expect(tour).toContain("copyTourUrl(");
    expect(tour).toContain("window.location.origin");
    expect(tour).toContain("window.location.pathname");
    expect(tour).toContain("copyUrl(url)");
    expect(tour).not.toContain("navigator.clipboard");
    // The address bar is left alone: it names the view on screen, and this link
    // names several.
    expect(tour).not.toContain("writeViewLink");

    const copy = functionBody("copyUrl");
    expect(copy).toContain("navigator.clipboard");
    expect(page.match(/clipboard\.writeText\(/g)).toHaveLength(1);

    // Copy link keeps the address bar up to date first, then copies the same
    // way.
    const link = functionBody("handleCopyLink");
    expect(link).toContain("writeViewLink(`#${link}`");
    expect(link).toContain("copyLinkUrl(");
    expect(link).toContain("copyUrl(");
    expect(page.match(/copyLinkUrl\(/g)).toHaveLength(1);
  });
});

describe("opening a tour link", () => {
  it("is read before the view codec, which would see none of its columns", () => {
    const apply = functionBody("applyViewLink");

    expect(apply).toContain("decodeTourLink(fragment)");
    expect(apply.indexOf("decodeTourLink(fragment)")).toBeLessThan(
      apply.indexOf("viewLinkUpdatesFrom(fragment)"),
    );
    // The walk's first stop is the view it opens on.
    expect(apply).toMatch(
      /stops === null \? viewLinkUpdatesFrom\(fragment\) : stops\[0\]/,
    );
  });

  it("keeps the page's own canvas: a stop carries no size", () => {
    const apply = functionBody("applyViewLink");

    expect(apply).toMatch(
      /if \(stops === null\) \{\s*setCanvasWidth\(updates\.canvasWidth\);\s*setCanvasHeight\(updates\.canvasHeight\);/,
    );
  });

  it("starts the tour at once, and keeps the walk only if it did", () => {
    const apply = functionBody("applyViewLink");

    expect(apply).toContain("createPlaylist(stops, stops[0])");
    expect(apply).toContain(
      "if (!tourMode.hashTour()) playlistRef.current = null;",
    );
    // The view is on screen before the tour is asked for, as it is for `#tour`.
    expect(apply.indexOf("setFractalType(")).toBeLessThan(
      apply.indexOf("tourMode.hashTour()"),
    );
  });

  it("is read on a load and on a fragment pasted into an open page alike", () => {
    // Both go through `applyViewLink`, so the mount read and the hashchange
    // listener pick a tour link up with no second path.
    expect(page).toContain("applyViewLink(link.fragment)");
    expect(effectContaining('addEventListener("hashchange"')).toContain(
      "applyViewLink(window.location.hash)",
    );
  });
});

describe("walking the stops", () => {
  const hop = () => effectContaining("tourMode.setHopHandler");

  it("shows the next stop, through the walk's own reader", () => {
    expect(hop()).toContain("nextPlaylistStop(");
    expect(hop()).toContain("showStop(step.stop)");
    expect(hop()).toContain("playlistRef.current = step.state");
  });

  it("hands the tour over when the walk runs out", () => {
    const body = hop();

    // Nothing left of the walk means the ordinary tour, from where the walk
    // stopped — which is the same handler the wandering tour already used.
    expect(body).toContain("playlistRef.current = null;");
    expect(body).toContain("nextTourStop(");
  });

  it("holds the walk's first stop for its dwell instead of skipping past it", () => {
    const body = hop();
    const first = body.indexOf("if (first) writeLeavingView();");

    expect(first).toBeGreaterThan(-1);
    // The first stop is the view the link put on screen, so the tour's first
    // hop only gives the address bar that view and the dwell runs from there.
    expect(body).toMatch(
      /if \(first\) \{\s*if \(walk\.stops\.length > 0\) return;/,
    );
  });

  it("fades between stops with the tour's own crossfade, as a hop to a place does", () => {
    const show = functionBody("showStop");

    expect(show).toContain("startCrossfade(target, TOUR_CROSSFADE_MS)");
    expect(show).toContain(
      "encodeView({ ...stop, canvasWidth, canvasHeight })",
    );
    // A stop is nobody's jump: the end of the tour counts the one entry, as it
    // does for a hop to a place.
    expect(show).not.toContain("beginJump");
    expect(show).not.toContain("writeViewLink");
  });

  it("gives the walk up when the tour is taken back, so it is not taken up again", () => {
    expect(functionBody("giveUpWalk")).toContain(
      "stopPlaylist(playlistRef.current)",
    );

    // Every way a tour ends is one the page sees: input, and a change of
    // fragment. (A dialog opening ends one too, and a dialog is opened by
    // input, which is the first of the two.)
    const activity = effectContaining('if (tourMode.state === "playing")');
    expect(activity).toContain(
      'if (tourMode.state === "playing") giveUpWalk();',
    );
    expect(activity.indexOf("giveUpWalk()")).toBeLessThan(
      activity.indexOf("tourMode.activity();"),
    );

    const listener = effectContaining('addEventListener("hashchange"');
    expect(listener.indexOf("giveUpWalk()")).toBeGreaterThan(
      listener.indexOf("tourMode.stop();"),
    );
    // Before the fragment is applied, which may name a walk of its own.
    expect(listener.indexOf("giveUpWalk()")).toBeLessThan(
      listener.indexOf("applyViewLink("),
    );
  });
});

describe("the docs", () => {
  it("name the button and the walk in the Help overlay and the README", () => {
    expect(help).toContain("Copy tour link");
    expect(readme).toContain("Copy tour link");
  });
});
