/**
 * The canvas-first page: the parts of it that live in markup
 *
 * The page is a canvas under a floating top bar, with every control in a
 * Settings drawer. What the drawer does when it is open — Escape, focus, the
 * inert page behind it — is the browser's, because it is a native `<dialog>`
 * shown with `showModal()`; what a Node suite with no DOM can check is that the
 * components are built that way and that the page puts the right things in
 * them. This reads the sources the way the help overlay and share link tests
 * here do. The fade's timing is `idleFade.test.ts`'s business.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/page.tsx");
const drawer = source("../components/ui/SettingsDrawer.tsx");
const topBar = source("../components/ui/TopBar.tsx");
const css = source("../app/globals.css");

/** The cards the right-hand column held, in the order it held them. */
const CARDS_IN_ORDER = [
  "<PresetSelector",
  'label="Zoom Level"',
  "describeView(bounds)",
  'label="Fractal"',
  "Canvas Resolution",
  "Manual Coordinates",
  "<CustomPresetManager",
];

describe("the Settings drawer", () => {
  it("is a native dialog shown modally, labelled by its title", () => {
    expect(drawer).toContain("<dialog");
    expect(drawer).toContain("dialog.showModal()");
    expect(drawer).toContain("dialog.close()");
    expect(drawer).toContain("aria-labelledby={TITLE_ID}");
    expect(drawer).toContain("id={TITLE_ID}");
  });

  it("closes on Escape, the Close button and the backdrop", () => {
    // Escape fires the element's own close event; `close()` fires it too.
    expect(drawer).toContain("onClose={() => {");
    expect(drawer).toContain("<Button onClick={onClose}");
    expect(drawer).toContain("event.target === dialogRef.current");
  });

  it("hands focus back to the Settings button", () => {
    expect(drawer).toContain("returnFocusRef?.current?.focus()");
    expect(page).toContain("returnFocusRef={settingsButtonRef}");
    expect(page).toContain("settingsButtonRef={settingsButtonRef}");
    expect(topBar).toContain("ref={settingsButtonRef}");
  });

  it("is a right-hand panel on a wide screen and a bottom sheet under 768 px", () => {
    expect(drawer).toContain("right-0");
    expect(drawer).toContain("max-md:bottom-0");
    expect(drawer).toContain("max-md:max-h-[85vh]");
    expect(drawer).toContain("overflow-y-auto");
  });

  it("leaves the dialog's own display alone, so closed means hidden", () => {
    const element = drawer.slice(drawer.indexOf("<dialog"));
    const classes = element.slice(
      element.indexOf("className="),
      element.indexOf(">", element.indexOf("className=")),
    );

    expect(classes).not.toMatch(
      /(^|[\s"])(flex|block|grid|inline-flex)([\s"]|$)/,
    );
  });

  it("renders its children whether or not it is open", () => {
    // Mounted-and-hidden is what lets the cards keep their state and the
    // render carry on while the drawer opens and closes.
    expect(drawer).toContain("{children}");
    expect(drawer).not.toMatch(/open\s*&&\s*\(/);
    expect(drawer).not.toContain("{open ?");
  });

  it("holds every card the page had, in the order it had them", () => {
    const start = page.indexOf("<SettingsDrawer");
    const end = page.indexOf("</SettingsDrawer>");
    const body = page.slice(start, end);

    let last = -1;
    for (const marker of CARDS_IN_ORDER) {
      const at = body.indexOf(marker);
      expect(at, marker).toBeGreaterThan(last);
      last = at;
    }
  });

  it("offers position and zoom once: no Center sliders, no View Info card", () => {
    const body = page.slice(
      page.indexOf("<SettingsDrawer"),
      page.indexOf("</SettingsDrawer>"),
    );

    expect(body).not.toContain("Center X");
    expect(body).not.toContain("Center Y");
    expect(body).not.toContain("View Info");
    expect(page).not.toContain("ZoomDisplay");
    // The Zoom Level slider is the one slider left for the view, and the
    // read-out sits above the Center Coordinates boxes it reports on.
    expect(body.match(/label="Zoom Level"/g)).toHaveLength(1);
    expect(body).toMatch(
      /<p role="status"[^>]*>\s*\{describeView\(bounds\)\}\s*<\/p>\s*<CenterControls/,
    );
  });

  it("holds Download PNG and the build footer", () => {
    const body = page.slice(
      page.indexOf("<SettingsDrawer"),
      page.indexOf("</SettingsDrawer>"),
    );

    expect(body).toContain("onClick={handleDownload}");
    expect(body).toContain("<VersionFooter />");
    // Nothing else on the page offers it.
    expect(page.match(/handleDownload}/g)).toHaveLength(1);
  });

  it("is driven by one piece of state that no render depends on", () => {
    expect(page).toContain(
      "const [settingsOpen, setSettingsOpen] = useState(false)",
    );
    expect(page).toContain("onClose={() => setSettingsOpen(false)}");
    // The drawer's state stays out of everything that draws.
    expect(page).not.toMatch(/\[[^\]]*settingsOpen[^\]]*\]\)/);
  });
});

describe("the top bar", () => {
  it("holds the title as the page's h1, and Help and Settings", () => {
    expect(topBar).toMatch(/<h1[^>]*>Fractal Explorer<\/h1>/);
    expect(topBar).toMatch(/>\s*Help\s*</);
    expect(topBar).toMatch(/>\s*Settings\s*</);
    expect(page).not.toContain("<h1");
  });

  it("opens the same overlay and drawer the page already has", () => {
    expect(page).toContain("onHelp={() => setHelpOpen(true)}");
    expect(page).toContain("onSettings={() => setSettingsOpen(true)}");
  });

  it("sits above the canvas in the page, so tab reaches it first", () => {
    expect(page.indexOf("<TopBar")).toBeGreaterThan(-1);
    expect(page.indexOf("<canvas")).toBeGreaterThan(page.indexOf("<TopBar"));
  });

  it("fades on the idle clock and listens for input on the window", () => {
    expect(topBar).toContain("createIdleFade({ onChange: setVisible, held })");
    expect(topBar).toContain("TOP_BAR_ACTIVITY_EVENTS");
    expect(topBar).toContain("window.addEventListener(name, handleActivity");
    expect(topBar).toContain(
      "window.removeEventListener(name, handleActivity)",
    );
    expect(topBar).toContain("fade.dispose()");
  });

  it("stays up while the drawer is open or a control in it has focus", () => {
    expect(topBar).toContain("const held = settingsOpen || focusWithin;");
    expect(topBar).toContain("const shown = held || visible;");
    expect(topBar).toContain("onFocus={");
    expect(topBar).toContain("onBlur={");
    expect(page).toContain("settingsOpen={settingsOpen}");
  });

  it("takes no pointer events while faded", () => {
    expect(topBar).toContain("pointer-events-none opacity-0");
  });
});

describe("the canvas", () => {
  it("is the page: a stage as tall as the viewport, no scroll", () => {
    expect(page).toContain('className="fractal-stage');
    expect(css).toMatch(/\.fractal-stage\s*{[^}]*height: 100dvh/);
    expect(css).toMatch(/\.fractal-stage\s*{[^}]*overflow: hidden/);
    expect(css).toMatch(
      /\.fractal-stage\s*{[^}]*padding-top: var\(--top-bar-height\)/,
    );
  });

  it("fits both axes, in the shape of its own resolution", () => {
    expect(page).toContain('"--canvas-aspect": canvasWidth / canvasHeight');
    expect(css).toContain("100vw");
    expect(css).toMatch(
      /calc\(\(100dvh - var\(--top-bar-height\)\) \* var\(--canvas-aspect/,
    );
    expect(css).toContain("aspect-ratio: var(--canvas-aspect");
  });

  it("keeps its role, its label, its focus and its keys", () => {
    expect(page).toContain('role="img"');
    expect(page).toContain("aria-label={describeBounds(bounds, fractalLabel)}");
    expect(page).toContain("tabIndex={0}");
    expect(page).toContain("onKeyDown={handleCanvasKeyDown}");
  });

  it("shows render progress as a line on its top edge, and says it as text", () => {
    expect(page).toContain("absolute inset-x-0 top-0 h-1");
    expect(page).toMatch(
      /<p role="status" className="sr-only">[\s\S]*Rendering\.\.\. \$\{Math\.round\(progress \* 100\)\}%/,
    );
  });
});
