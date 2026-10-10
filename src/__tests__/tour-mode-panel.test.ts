/**
 * Tour mode: the parts that live in markup and in the page's wiring
 *
 * When a tour starts, hops and gives way is `tourMode.test.ts`'s business, and
 * what a `#tour` link means is `viewLink.test.ts`'s. What a Node suite with no
 * DOM cannot render is the page, so this reads the sources the way the Nearby
 * strip and canvas-first page tests here do: the Tour button, one flag hiding
 * every control and the same flag giving them back, the strip's `hidden` prop,
 * the hop going through the tile's handler, the address bar left alone while a
 * tour plays and one entry made when it ends, the `#tour` link, and the rules
 * about input, motion and the screen lock.
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
const css = source("../app/globals.css");

/** The body of the page's handler `name`, up to the next top-level `const`. */
function handlerBody(name: string): string {
  const start = page.indexOf(`const ${name} = `);
  if (start === -1) throw new Error(`${name} is not in the page`);

  const end = page.indexOf("\n  const ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

/** The text of the effect whose body contains `marker`, up to its deps. */
function effectContaining(marker: string): string {
  const at = page.indexOf(marker);
  if (at === -1) throw new Error(`${marker} is not in the page`);

  const start = page.lastIndexOf("useEffect(", at);
  const end = page.indexOf("\n  }, [", at);
  return page.slice(start, end === -1 ? undefined : end);
}

describe("the Tour button", () => {
  it("is a button in the top bar whose name is 'Tour'", () => {
    expect(topBar).toMatch(
      /<button type="button" onClick=\{onTour\} className=\{BUTTON_CLASSES\}>\s*Tour\s*<\/button>/,
    );
  });

  it("sits beside Surprise me, before the buttons on the right", () => {
    const surprise = topBar.search(/>\s*Surprise me\s*<\/button>/);
    const tour = topBar.search(/>\s*Tour\s*<\/button>/);

    expect(tour).toBeGreaterThan(surprise);
    expect(tour).toBeLessThan(topBar.indexOf("onClick={onBack}"));
  });

  it("is a native button, so Tab reaches it and nothing disables it", () => {
    expect(topBar).not.toMatch(/Tour[\s\S]{0,80}disabled/);
    expect(topBar).not.toContain("tabIndex={-1}");
  });

  it("starts a tour at once through the clock", () => {
    expect(page).toContain("onTour={() => tourMode.buttonStart()}");
  });
});

describe("hiding every control while a tour plays", () => {
  it("has one flag, read off the clock's state", () => {
    expect(page).toContain('const tourPlaying = tourState === "playing";');
    // The state is the clock's own report and nothing else sets it.
    expect(page).toContain("onChange: (next) => setTourState(next)");
    expect(page.match(/setTourState\(/g)).toHaveLength(1);
  });

  it("does not render the top bar while it plays", () => {
    expect(page).toMatch(/\{!tourPlaying && \(\s*<TopBar/);
  });

  it("passes the strip hidden", () => {
    expect(page).toMatch(/<NearbyStrip[\s\S]*?hidden=\{tourPlaying\}/);
  });

  it("hides the progress line and the blank-picture hint too", () => {
    expect(page).toContain("{isRendering && !tourPlaying && (");
    expect(page).toMatch(/<BlankHint\s+show=\{\s*!tourPlaying/);
  });

  it("marks the stage so the pointer and the focus ring go too", () => {
    expect(page).toContain("data-tour={tourPlaying}");
    expect(css).toContain('.fractal-stage[data-tour="true"]');
    expect(css).toMatch(/\[data-tour="true"\][^{]*\{\s*cursor: none;/);
    expect(css).toMatch(
      /\[data-tour="true"\] \.fractal-canvas:focus-visible\s*\{\s*outline: none;/,
    );
  });

  it("says so to a screen reader, which cannot see the controls go", () => {
    expect(page).toContain("Tour playing. Press any key to stop.");
  });

  it("gives every control back on stop: nothing but the flag hides them", () => {
    // Each hider reads `tourPlaying` and no second piece of state of its own,
    // so the flag going false is the whole of putting the page back.
    for (const hider of [
      /\{!tourPlaying && \(\s*<TopBar/,
      /hidden=\{tourPlaying\}/,
      /\{isRendering && !tourPlaying && \(/,
    ]) {
      expect(page).toMatch(hider);
    }
    expect(page).not.toMatch(/tourHidden|hideControls|setControlsHidden/);

    // The drawer and the help are closed dialogs: a tour never opens or closes
    // them, so they are as the user left them.
    const hop = effectContaining("tourMode.setHopHandler");
    expect(hop).not.toContain("setSettingsOpen");
    expect(hop).not.toContain("setHelpOpen");
  });

  it("stands the Auto-wander clock down while it plays", () => {
    expect(page).toContain("wander.setHidden(document.hidden || tourPlaying)");
    expect(page).toContain("document.hidden || tourPlayingRef.current");
  });
});

describe("a hop", () => {
  const hop = () => effectContaining("tourMode.setHopHandler");

  it("asks the engine and goes through the tile's handler", () => {
    expect(hop()).toContain("nextTourStop(");
    expect(hop()).toContain("PLACES");
    expect(hop()).toContain("handlePlaceSelect(place, { tour: true })");
  });

  it("starts the engine from the view on screen at the first hop", () => {
    expect(hop()).toContain("initialTourState(placeView)");
    expect(hop()).toMatch(/first \|\| tourEngineRef\.current === null/);
  });

  it("writes the view being left into the address bar before it moves", () => {
    expect(hop().indexOf("writeLeavingView()")).toBeGreaterThan(-1);
    expect(hop().indexOf("writeLeavingView()")).toBeLessThan(
      hop().indexOf("handlePlaceSelect("),
    );
  });

  it("fades for the tour's time, is no jump, and adds no entry", () => {
    const select = handlerBody("handlePlaceSelect");

    expect(select).toContain("tour ? TOUR_CROSSFADE_MS : CROSSFADE_MS");
    expect(select).toContain("if (!tour) beginJump();");
    // Nothing else a hop does writes history.
    expect(select).not.toContain("pushState");
    expect(select).not.toContain("pushViewLink");
    expect(select).not.toContain("writeViewLink");
  });

  it("keeps a reduced-motion visitor's crossfade a cut, whatever its length", () => {
    const start = handlerBody("startCrossfade");

    expect(start.indexOf("prefers-reduced-motion")).toBeGreaterThan(-1);
    expect(start.indexOf("prefers-reduced-motion")).toBeLessThan(
      start.indexOf("drawImage"),
    );
    // The dwell is the clock's, which knows nothing of motion.
    expect(source("../lib/tourMode.ts")).not.toContain("reduced-motion");
  });
});

describe("history", () => {
  it("leaves the address bar alone while a tour plays", () => {
    const follower = effectContaining("pushViewLink(next, now)");

    expect(follower).toMatch(/if \(tourPlaying\) return;/);
    expect(follower.indexOf("if (tourPlaying) return;")).toBeLessThan(
      follower.indexOf("writeViewLink("),
    );
    expect(page).toMatch(/tourPlaying,\s*\]\);/);
  });

  it("counts the end of a tour as one jump, so one entry is pushed", () => {
    expect(page).toContain("const [seenTourState, setSeenTourState]");
    expect(page).toMatch(
      /if \(seenTourState !== tourState\) \{\s*setSeenTourState\(tourState\);\s*if \(seenTourState === "playing"\) setJumpSerial\(/,
    );
  });

  it("does not write the view being left over the entry the tour ends on", () => {
    // `beginJump` writes the current view into the current entry, which at the
    // end of a tour would be the place on screen over the view before it.
    const adjust = page.slice(
      page.indexOf("const [seenTourState"),
      page.indexOf("const [seenTourState") + 400,
    );

    expect(adjust).not.toContain("beginJump");
    expect(adjust).not.toContain("writeLeavingView");
  });
});

describe("starting and stopping", () => {
  it("reads #tour and tour=1 when a link is put into effect", () => {
    const apply = effectContaining("applyViewLink(window.location.hash)");
    expect(apply).toContain("applyViewLink(window.location.hash)");

    const body = page.slice(
      page.indexOf("const applyViewLink = useCallback("),
      page.indexOf("const linkAppliedRef"),
    );
    expect(body).toContain("if (decodeTour(fragment)) tourMode.hashTour();");
    // After the view is set, so the tour starts from the link's view.
    expect(body.indexOf("setFractalType(")).toBeLessThan(
      body.indexOf("tourMode.hashTour()"),
    );
  });

  it("ends a tour when the fragment changes under it", () => {
    const listener = effectContaining('addEventListener("hashchange"');

    expect(listener).toContain("tourMode.stop();");
    expect(listener.indexOf("tourMode.stop()")).toBeLessThan(
      listener.indexOf("applyViewLink("),
    );
  });

  it("listens for input on the window, in the capture phase, for every kind", () => {
    const listeners = effectContaining("const handleActivity");

    expect(listeners).toContain("for (const name of TOUR_ACTIVITY_EVENTS)");
    expect(listeners).toContain("capture: true");
    expect(listeners).toContain("tourMode.activity();");
    expect(listeners).toContain("window.removeEventListener(name");
  });

  it("does not take a move event at a resting pointer for someone", () => {
    const listeners = effectContaining("const handleActivity");

    expect(listeners).toContain("pointerMoved(lastPointer, clientX, clientY)");
    expect(listeners).toMatch(/if \(!moved\) return;/);
  });

  it("does not take a key held from before for someone", () => {
    const listeners = effectContaining("const handleActivity");

    expect(listeners).toMatch(/\.repeat\s*&&\s*tourMode\.state === "playing"/);
  });

  it("tells the clock what only the browser knows", () => {
    const listeners = effectContaining("const handleActivity");

    expect(listeners).toContain('document.visibilityState !== "visible"');
    expect(listeners).toContain("document.hasFocus()");
    expect(listeners).toContain('"focusin"');
    expect(listeners).toContain('"focusout"');
    expect(listeners).toContain("isTextEntry(");
    expect(listeners).toContain("tourMode.dispose()");
  });

  it("tells the clock the drawer or help is open and whether the picture is settled", () => {
    expect(page).toContain("const tourOverlayOpen = settingsOpen || helpOpen;");
    expect(page).toContain(
      '!isRendering && renderedLink !== "" && renderedLink === currentLink',
    );
    expect(page).toContain("tourMode.setConditions({ settled: tourSettled })");
  });
});

describe("the screen lock", () => {
  it("is held while a tour plays and released when it ends", () => {
    const hold = effectContaining("holdScreenAwake(");

    expect(hold).toContain("if (!tourPlaying) return;");
    expect(hold).toMatch(/return holdScreenAwake\(/);
    expect(page).toMatch(/\[tourPlaying\]\);/);
  });

  it("is asked of the browser only where it has one", () => {
    expect(page).toContain('"wakeLock" in navigator');
  });
});

describe("the Help overlay", () => {
  it("names the idle start, the Tour button and the #tour link", () => {
    expect(help).toContain("Tour");
    expect(help).toContain("#tour");
    expect(help).toMatch(/20 seconds/);
  });
});
