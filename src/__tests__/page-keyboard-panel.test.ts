/**
 * Driving the view from the keyboard anywhere on the page: the page's half
 *
 * Which press belongs to the page, and which to the control under the
 * pointer's focus, is `pageKeys.ts` and is tested in Node without a browser
 * (`src/lib/__tests__/pageKeys.test.ts`). What this reads is the wiring in
 * `FractalExplorer.tsx` that a Node suite cannot render: the listener, the
 * facts about the focused element it hands the rule, and what the page does
 * with each answer.
 *
 * The step and the bounds maths are `canvasNavigation.ts`'s and unchanged, so
 * they are not re-checked here; that the page offers exactly the keys the
 * canvas's own switch reads is pinned with the rule itself.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/FractalExplorer.tsx");
const help = source("../lib/helpEntries.ts");

/** The body of a `const NAME = useCallback(...)` handler, braces and all. */
function callbackBody(name: string): string {
  const declaration = page.indexOf(`const ${name} = useCallback(`);
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

describe("the page's keyboard listener", () => {
  it("is on the window, so focus does not have to be on the picture", () => {
    const effect = effectContaining(
      'window.addEventListener("keydown", handlePageKeyDown)',
    );

    expect(effect).toContain(
      'window.addEventListener("keydown", handlePageKeyDown)',
    );
    expect(effect).toContain(
      'window.removeEventListener("keydown", handlePageKeyDown)',
    );
  });

  it("is the only thing that moves the view from a key", () => {
    // The canvas's own handler is gone: a key pressed with the picture focused
    // would otherwise be seen by both and move the view twice.
    expect(page).not.toContain("onKeyDown={handleCanvasKeyDown}");
    expect(page).not.toContain("handleCanvasKeyDown");
    expect(page.match(/keyNavigationBounds\(/g)).toHaveLength(1);
  });

  it("keeps the canvas's role, its label and its focus", () => {
    expect(page).toContain('role="img"');
    expect(page).toContain("aria-label={describeBounds(bounds, fractalLabel)}");
    expect(page).toContain("tabIndex={0}");
  });
});

describe("what the handler asks and does", () => {
  const handler = callbackBody("handlePageKeyDown");

  it("decides through the rule, with the facts about the focused element", () => {
    expect(handler).toContain("pageKeyAction({");
    for (const fact of [
      "key: event.key",
      "ctrlKey: event.ctrlKey",
      "metaKey: event.metaKey",
      "altKey: event.altKey",
      "targetTagName: target?.tagName ?? \"\"",
      "targetIsContentEditable: target?.isContentEditable ?? false",
      'targetInDialog: Boolean(target?.closest("dialog[open]"))',
      "targetInMathCard: mathCardPanelRef.current?.contains(target) ?? false",
      "tourPlaying: tourPlaying || keyEndedTourRef.current,",
    ]) {
      expect(handler, fact).toContain(fact);
    }
  });

  it("asks about the keypress, not about the page, for a tour", () => {
    // The tour's own listener reads every key first, in the capture phase,
    // and stops the tour as it goes: by the time this handler runs the tour is
    // already over, so `tourPlaying` alone would let the key that stopped the
    // tour move the picture as well. The ref is written by that listener
    // before it stops anything.
    const activity = effectContaining("const handleActivity =");
    const writes = activity.indexOf(
      "keyEndedTourRef.current = tourMode.state === \"playing\";",
    );
    const stops = activity.indexOf("if (tourMode.state === \"playing\") giveUpWalk();");

    expect(writes).toBeGreaterThan(-1);
    expect(stops).toBeGreaterThan(writes);
    // And it is written for every key, so a repeat cannot slip past it.
    expect(activity).toContain('if (event.type === "keydown") {');
  });

  it("does nothing at all when the rule declines", () => {
    const decides = handler.indexOf("if (!action) return;");

    expect(decides).toBeGreaterThan(-1);
    expect(decides).toBeLessThan(handler.indexOf("resetToDefault()"));
    expect(decides).toBeLessThan(handler.indexOf("keyNavigationBounds("));
  });

  it("resets exactly as the Reset View button does", () => {
    expect(handler).toContain('if (action === "reset")');
    expect(handler).toContain("resetToDefault()");

    // Reset View is `resetToDefault` and nothing else, so R and the button
    // cannot drift.
    expect(page).toContain("onClick={resetToDefault}");
  });

  it("pans and zooms with the canvas's own step and bounds maths", () => {
    expect(handler).toContain("keyNavigationBounds(event.key, boundsRef.current)");
    expect(handler).toContain("applyView(boundsToView(next))");
    // The live bounds ref rather than the committed state, so a held key's
    // repeats each step from the view the last one produced.
    expect(handler).not.toContain("keyNavigationBounds(event.key, bounds)");
  });

  it("takes the default away only from a key it acts on", () => {
    const preventions = handler.match(/event\.preventDefault\(\)/g) ?? [];

    expect(preventions).toHaveLength(2);
    // One after the reset branch is taken, one after the switch answered a
    // view: a key the page leaves alone keeps its browser behaviour, so page
    // scroll and the browser's own shortcuts are untouched.
    expect(handler.indexOf("event.preventDefault()")).toBeGreaterThan(
      handler.indexOf('if (action === "reset")'),
    );
    expect(handler.indexOf("if (!next) return;")).toBeGreaterThan(
      handler.indexOf("keyNavigationBounds("),
    );
    expect(handler.lastIndexOf("event.preventDefault()")).toBeLessThan(
      handler.indexOf("applyView(boundsToView(next))"),
    );
  });

  it("is rebuilt when the things it decides with change", () => {
    expect(handler.length).toBeGreaterThan(0);
    expect(page).toContain("[applyView, resetToDefault, tourPlaying],");
  });
});

describe("the keys, in the help", () => {
  it("names the pan, zoom and reset keys", () => {
    // From the Keyboard heading to the next section's, so a row that moved
    // into another group is not counted as this section's.
    const keyboard = help.slice(help.indexOf('title: "Keyboard"'));
    const section = keyboard.slice(0, keyboard.indexOf('title: "', 1));

    expect(section).toContain("ArrowLeft / ArrowRight / ArrowUp / ArrowDown");
    expect(section).toContain("+ / -");
    expect(section).toContain("R");
    // When they apply: anywhere on the page, without focusing the image first.
    expect(section).toContain("anywhere on the page");
    // The old "focus the image first" row must be gone: the keys no longer
    // need the canvas focused.
    expect(help).not.toContain("Focus the image, so the keys below reach it");
  });
});

describe("what this test reads", () => {
  it("is the app, not an empty directory", () => {
    expect(page.length).toBeGreaterThan(1000);
    expect(help.length).toBeGreaterThan(1000);
  });
});
