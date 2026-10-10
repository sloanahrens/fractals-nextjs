/**
 * The help overlay: the parts of it that live in the page and the component
 *
 * Two things here cannot be seen from a Node suite with no DOM. The first is
 * that the overlay is a native `<dialog>` shown with `showModal()`: that is
 * what gives the browser's own Escape handling, the inert page behind it, and
 * focus returning to whatever opened it, and a `<div>` that looked the same
 * would have none of them. The second is the `?` listener: whether it is on
 * the window, whether it asks the pure rule before it opens anything, and
 * whether the help's key names are keys the canvas really reads.
 *
 * The suite runs in Node with no DOM to render into, so this reads the sources
 * the way the manual coordinates and share link tests here do.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HELP_SECTIONS } from "../lib/helpEntries";

const SRC_DIRECTORY = fileURLToPath(new URL("..", import.meta.url));
const PAGE_PATH = fileURLToPath(new URL("../app/page.tsx", import.meta.url));
const DIALOG_PATH = fileURLToPath(
  new URL("../components/ui/HelpDialog.tsx", import.meta.url),
);
const TOP_BAR_PATH = fileURLToPath(
  new URL("../components/ui/TopBar.tsx", import.meta.url),
);
const CANVAS_NAVIGATION_PATH = fileURLToPath(
  new URL("../lib/canvasNavigation.ts", import.meta.url),
);

const page = readFileSync(PAGE_PATH, "utf8");
const dialog = readFileSync(DIALOG_PATH, "utf8");
const topBar = readFileSync(TOP_BAR_PATH, "utf8");
const canvasNavigation = readFileSync(CANVAS_NAVIGATION_PATH, "utf8");

/**
 * The keys the canvas reads, and the help therefore has to name.
 *
 * `canvasNavigation.ts` handles each of these in a `case` of
 * `keyNavigationBounds`; the help lists them under Keyboard. A key dropped
 * from the canvas while the help still offers it is a user pressing a key
 * that does nothing, which is what this pair of checks catches.
 */
const CANVAS_KEYS = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "+",
  "-",
];

/** Everything the help says, as one string to search. */
const HELP_TEXT = HELP_SECTIONS.flatMap((section) =>
  section.entries.map((entry) => entry.keys),
).join("\n");

/** The body of the first `useEffect(` in a source containing `marker`. */
function effectBody(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at === -1) throw new Error(`${marker} is not in the source`);

  const start = source.lastIndexOf("useEffect(", at);
  const end = source.indexOf("}, [", at);
  if (start === -1 || end === -1) throw new Error(`no effect around ${marker}`);

  return source.slice(start, end);
}

describe("the help button", () => {
  it("sits in the top bar beside the title, above the canvas it explains", () => {
    const heading = topBar.indexOf(">Fractal Explorer<");
    const button = topBar.search(/>\s*Help\s*</);

    expect(heading).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(heading);
    expect(page.indexOf("<canvas")).toBeGreaterThan(page.indexOf("<TopBar"));
    // It opens the same overlay the `?` key does, rather than a second one.
    expect(page).toContain("onHelp={() => setHelpOpen(true)}");
    expect(topBar).toContain("onClick={onHelp}");
  });
});

describe("the ? shortcut", () => {
  it("is read off the window, so it works away from the canvas", () => {
    const listener = effectBody(page, 'window.addEventListener("keydown"');

    expect(listener).toContain("opensHelpShortcut({");
    // The rule decides, and only then does anything open.
    const decides = listener.indexOf("if (!opens) return;");
    const opens = listener.indexOf("setHelpOpen(true)");

    expect(decides).toBeGreaterThan(-1);
    expect(opens).toBeGreaterThan(decides);
    // A listener an effect adds is a listener the effect takes away.
    expect(listener).toContain(
      'window.removeEventListener("keydown", handleKeyDown)',
    );
  });

  it("names keys the canvas really reads", () => {
    for (const key of CANVAS_KEYS) {
      expect(canvasNavigation, key).toContain(`case "${key}":`);
      expect(HELP_TEXT, key).toContain(key);
    }
  });
});

describe("the dialog", () => {
  it("is a native dialog, shown modally", () => {
    expect(dialog).toContain("<dialog");
    expect(dialog).toContain("dialog.showModal()");
    expect(dialog).toContain("dialog.close()");
  });

  it("is labelled by its title and closes by every way out", () => {
    expect(dialog).toContain("aria-labelledby={TITLE_ID}");
    expect(dialog).toContain("id={TITLE_ID}");
    // Escape fires the element's own close event, the Close button calls the
    // same handler, and a click on the backdrop — the dialog element rather
    // than the panel inside it — does too.
    expect(dialog).toContain("onClose={onClose}");
    expect(dialog).toContain("<Button onClick={onClose}");
    expect(dialog).toContain("event.target === dialogRef.current");
  });

  it("renders the sections the help data holds", () => {
    expect(dialog).toContain("HELP_SECTIONS.map(");
    expect(dialog).toContain("{entry.keys}");
    expect(dialog).toContain("{entry.action}");
  });

  it("is in the page, driven by the one piece of state", () => {
    expect(page).toContain(
      "<HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />",
    );
    expect(page).toContain("const [helpOpen, setHelpOpen] = useState(false)");
  });
});

describe("what this test reads", () => {
  it("is the app, not an empty directory", () => {
    expect(relative(SRC_DIRECTORY, PAGE_PATH)).toBe("app/page.tsx");
    expect(page.length).toBeGreaterThan(1000);
    expect(dialog.length).toBeGreaterThan(1000);
    expect(canvasNavigation.length).toBeGreaterThan(1000);
  });
});
