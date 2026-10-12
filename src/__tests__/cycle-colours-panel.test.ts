/**
 * Cycling the palette: the parts of it that live in the page
 *
 * That the palette is a point on a turn after so long, and that a frame is due
 * another repaint, is `cycleColours`'s own test's business; that a repaint from
 * kept counts is the picture a full render draws is `FractalRenderer`'s. What
 * is decided in `FractalExplorer.tsx` and nowhere else is the rest of it: that
 * the switch and its speed sit in the Settings drawer with the palette they
 * belong to, that the animation runs on frames and paints through `recolour`
 * and never starts a render, that it holds whenever the visitor or the browser
 * has the picture, that it writes nothing to the address bar or the history
 * while it runs, and that switching it off is one history entry and one move of
 * the view's own Shift.
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

/**
 * The body of a `const NAME = ...` function in a source, braces and all.
 *
 * What a handler does, and in what order, is part of what makes it correct —
 * the jump marked before the setter that moves off the view it names, the
 * release clearing the drag — and a source walk is the only way to see it
 * without a browser.
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

/**
 * The body of the effect that contains the first `marker` in a source, from its
 * `useEffect(` to the dep list that closes it.
 *
 * Where a frame is asked for, and what a frame is allowed to do, is the whole
 * of what makes the animation safe on a canvas a render may be drawing.
 */
function effectBody(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at === -1) throw new Error(`${marker} is not in the page`);

  const start = source.lastIndexOf("useEffect(", at);
  const end = source.indexOf("}, [", at);
  if (start === -1 || end === -1) throw new Error(`no effect around ${marker}`);

  return source.slice(start, end);
}

/** The drawer's Rendering Parameters card, where the palette controls live. */
function renderingParametersCard(): string {
  const start = page.indexOf(">Rendering Parameters<");
  if (start === -1) throw new Error("the Rendering Parameters card is gone");

  const end = page.indexOf("{/* Canvas Resolution */}", start);
  if (end === -1) throw new Error("the Rendering Parameters card is unbounded");

  return page.slice(start, end);
}

describe("the cycling controls", () => {
  it("reads the page it is checking", () => {
    expect(relative(SRC_DIRECTORY, PAGE_PATH)).toBe("app/FractalExplorer.tsx");
    expect(page.length).toBeGreaterThan(10_000);
  });

  it("sit in the drawer under the palette they belong to", () => {
    const card = renderingParametersCard();
    const where = (needle: string) => card.indexOf(needle);

    // The palette's own settings come first — the scheme, its reversal, its
    // shift and the way back to the scheme's colours — and the animation that
    // walks the shift is offered after them, in the same card.
    expect(where('label="Shift"')).toBeGreaterThan(-1);
    expect(where('label="Shift"')).toBeLessThan(where('label="Cycle colours"'));
    expect(where('label="Cycle colours"')).toBeLessThan(
      where('label="Cycle speed"'),
    );
    expect(where("Reset colours")).toBeLessThan(
      where('label="Cycle colours"'),
    );

    // The three speeds are the catalogue's, read through the resolver, so the
    // select can never show a list the page cannot draw at.
    expect(card).toContain("options={CYCLE_SPEEDS.map((speed) => ({");
    expect(card).toContain("value: speed.id,");
    expect(card).toContain("value={cycleSpeed}");
    expect(card).toContain("onChange={handleCycleSpeedChange}");
    expect(card).toContain("checked={cycling}");

    // And nothing was added to the picture: the controls are in the drawer,
    // which opens after them in the page's markup.
    for (const surface of ["<TopBar", "<FractalSwitcher", "<NearbyStrip", "<canvas"]) {
      expect(page.indexOf(surface), surface).toBeLessThan(
        page.indexOf(">Rendering Parameters<"),
      );
    }
  });

  it("start off, at the slowest speed, and are remembered for the session only", () => {
    expect(page).toContain("const [cycling, setCycling] = useState(false);");
    expect(page).toContain("const [cycleSpeed, setCycleSpeed] = useState<CycleSpeedId>(");
    expect(page).toContain("DEFAULT_CYCLE_SPEED,");

    // The speed is read through `cycleSpeedFor`, so a value from outside lands
    // on the default rather than on nothing at all.
    const change = functionBody(page, "handleCycleSpeedChange");
    expect(change).toContain("setCycleSpeed(cycleSpeedFor(value).id);");
  });

  it("is a mode and not part of the view: a link neither carries it nor starts it", () => {
    // The link is spelled once, in `viewLinkFor`, and names nothing about the
    // animation — nor does putting a link into effect.
    expect(functionBody(page, "viewLinkFor")).not.toContain("cycling");
    expect(functionBody(page, "viewLinkFor")).not.toContain("cycleSpeed");

    const applied = functionBody(page, "applyViewLink");
    expect(applied).not.toContain("setCycling");
    expect(applied).not.toContain("Cycle");

    // Nor is it a field a saved view writes: the manager is handed the
    // palette's two settings and nothing of the animation.
    expect(page).not.toContain("currentCycling");
    expect(page).not.toContain("currentCycleSpeed");
  });
});

describe("the animation", () => {
  const clock = effectBody(page, "requestAnimationFrame(animate)");

  it("runs only while the mode is on and nothing holds it, and stops cleanly", () => {
    expect(clock).toContain("if (!cycling || cyclePausedNow) return;");
    expect(clock).toContain("frame = requestAnimationFrame(animate);");
    expect(clock).toContain("return () => cancelAnimationFrame(frame);");
    // The request is made once by the effect and then by the frame itself, so
    // there is always one outstanding request for the cleanup to cancel.
    expect(clock.match(/requestAnimationFrame\(animate\)/g)).toHaveLength(2);
  });

  it("repaints kept counts, and never counts the view again", () => {
    expect(clock).toMatch(
      /renderer\.recolour\(\s*colorScheme,\s*effectiveMaxIterations,\s*\{ reverse, shift: next \},\s*trap \?\? undefined,\s*\)/,
    );

    // Every way the page starts a render, and every way it says one has
    // started: a frame of the animation is none of them.
    for (const render of [
      "drawCanvas",
      "renderFractal",
      "renderPreview",
      "setIsRendering",
      "notifyRenderStart",
      "notifyRenderDone",
      "setFullRenderNonce",
      "cancelRender",
    ]) {
      expect(clock, `the clock calls ${render}`).not.toContain(render);
    }
  });

  it("skips a frame there is nothing to repaint from rather than queueing one", () => {
    expect(clock).toContain("const repainted = renderer.recolour(");
    expect(clock).toMatch(/at = now;\s*if \(!repainted\) return;/);
    // The palette does not move on a frame that painted nothing: the clock is
    // moved by the frame, and the shift only by a picture.
    expect(clock.indexOf("if (!repainted) return;")).toBeLessThan(
      clock.indexOf("cycleShiftRef.current = next;"),
    );
  });

  it("advances by elapsed time, at most twenty times a second", () => {
    expect(clock).toContain(
      "cycleShift(cycleShiftRef.current, now - at, cycleLoopMs)",
    );
    expect(clock).toContain(
      "shouldPaint(now, lastPaint, CYCLE_MIN_PAINT_GAP_MS)",
    );
    // The clock is the frames' own, and it starts again at the top of the
    // effect, which is what makes time spent held no part of the loop.
    expect(clock).toContain("let at = performance.now();");
    expect(page).toContain(
      "const cycleLoopMs = cycleSpeedFor(cycleSpeed).loopMs;",
    );
  });

  it("holds for a hidden tab, a render, a hand on the picture or the slider, the Help overlay, a tour, and reduced motion", () => {
    const held = page.slice(
      page.indexOf("const cyclePausedNow = cyclePaused({"),
      page.indexOf("});", page.indexOf("const cyclePausedNow = cyclePaused({")),
    );

    for (const condition of [
      "tabHidden,",
      "rendering: isRendering,",
      "gesturing: gestureActive,",
      "draggingShift,",
      "helpOpen,",
      "tourPlaying,",
      "reducedMotion,",
    ]) {
      expect(held, condition).toContain(condition);
    }
  });

  it("is held by a pointer down on the picture, and set free by the end of the gesture", () => {
    // The canvas's own gesture callbacks, which already own the preview/full
    // decision, are where a hand on the picture is noticed.
    expect(page).toContain("setGestureActive(true);");
    expect(page).toContain("setGestureActive(false);");
  });

  it("writes nothing to the address bar or the history, frame or not", () => {
    for (const write of [
      "writeViewLink",
      "pushViewLink",
      "replaceState",
      "pushState",
      "location.hash",
      "beginJump",
    ]) {
      expect(clock, `the clock calls ${write}`).not.toContain(write);
    }
  });

  it("does not touch the view's own Shift while it runs", () => {
    expect(clock).not.toContain("setShift");
    expect(clock).not.toContain("handleParameterChange");
    expect(clock).not.toContain("setCurrentPreset");
  });

  it("keeps the palette's position in a ref, which a move of the view's own Shift resets", () => {
    expect(page).toContain("const cycleShiftRef = useRef(shift);");
    expect(page).toContain("cycleShiftRef.current = shift;");
    expect(page).toContain("}, [shift]);");
  });
});

describe("switching it off", () => {
  it("leaves the Shift where the palette stopped, as one history entry", () => {
    const change = functionBody(page, "handleCycleChange");

    // The entry is marked before the setter that moves off the view it names,
    // and the Shift the view takes is the one the palette reached.
    expect(change).toContain("beginJump();");
    expect(change).toContain("setShift(cycleShiftRef.current);");
    expect(change.indexOf("beginJump();")).toBeLessThan(
      change.indexOf("setShift(cycleShiftRef.current);"),
    );
    expect(change).toContain("setCycling(enabled);");
  });

  it("is the one place the animation writes the view's Shift at all", () => {
    expect(page.match(/setShift\(cycleShiftRef\.current\)/g)).toHaveLength(1);
  });

  it("puts the palette where the drag left it, and holds while the drag lasts", () => {
    // The slider's pointer-down marks the drag for the history and holds the
    // animation...
    expect(functionBody(page, "handleShiftGestureStart")).toContain(
      "setDraggingShift(true);",
    );
    // ...a step of the drag carries the animation's own starting point with
    // it, so releasing does not snap the picture back...
    expect(functionBody(page, "handleShiftChange")).toContain(
      "cycleShiftRef.current = next;",
    );
    // ...and the release is watched for on the window, wherever it lands.
    const release = effectBody(page, "pointercancel");
    expect(release).toContain('window.addEventListener("pointerup", end);');
    expect(release).toContain('window.addEventListener("pointercancel", end);');
    expect(release).toContain("setDraggingShift(false);");
  });
});

describe("reduced motion", () => {
  it("is not offered the animation at all, and is told why", () => {
    const card = renderingParametersCard();

    expect(card).toContain("disabled={reducedMotion}");
    expect(card).toContain("Your system asks for reduced motion");

    // The one media query store, shared with the orbit plot's Play control.
    expect(page).toContain("useSyncExternalStore(");
    expect(page).toContain("subscribeToReducedMotion,");
    expect(page).toContain("prefersReducedMotion,");
  });

  it("holds the animation as one of the conditions, not as a second switch", () => {
    expect(page).toContain("reducedMotion,");
    // The checkbox is disabled rather than the mode being secretly off: a
    // visitor whose system asks for less motion is told so and cannot turn it
    // on.
    expect(page).toMatch(/disabled=\{reducedMotion\}/);
  });
});

describe("the rest of the page", () => {
  it("takes the palette cycling as no reason to call a picture blank", () => {
    const blank = page.slice(
      page.indexOf("const [blankLink, setBlankLink]"),
      page.indexOf("The address bar follows", page.indexOf("const [blankLink")),
    );

    expect(blank).toContain("isRendering ||");
    expect(blank).toContain("cycling ||");
  });

  it("copies the palette the canvas is painted with, which is the animated one while it flows", () => {
    const copy = functionBody(page, "handleCopyLink");

    expect(copy).toContain("const link = viewLinkFor(cycleShiftRef.current);");
    expect(copy).toContain("copyLinkUrl(");
    // The URL is that link, on this origin and path.
    expect(copy).toContain("window.location.pathname, link");
    // The offer of a field to copy from still belongs to the view, so a palette
    // that is still flowing does not take it away. It is made where the URL is
    // handed over, which is the path both copy buttons share.
    expect(functionBody(page, "copyUrl")).toContain("link: currentLink,");
  });

  it("names the feature in the Help overlay", () => {
    const help = readFileSync(
      fileURLToPath(new URL("../lib/helpEntries.ts", import.meta.url)),
      "utf8",
    );

    expect(help).toContain("Cycle colours");
  });
});
