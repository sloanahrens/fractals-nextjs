/**
 * The Look control on the picture: the half of it a Node suite cannot render.
 *
 * The words, the menu keys and the placement arithmetic are `lookControl.test.ts`'s
 * business; what a trap is and which changes render or repaint are
 * `trapPaths.test.ts`'s and `trap-controls-panel.test.ts`'s. What is decided
 * here is that the button is another view of the Settings select's one state and
 * handler, that it rides in the Auto-wander pill's row and hides with it, that it
 * has the accessible behaviour the bead names, and that the words about it are in
 * Settings, Help, the README and CLAUDE.md. A Node suite has no DOM, so this
 * reads the sources, as the other panel tests here do.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const PAGE = read("../app/FractalExplorer.tsx");
const LOOK = read("../components/ui/LookControl.tsx");
const PILL = read("../components/ui/WanderControl.tsx");
const HELP = read("../lib/helpEntries.ts");
const README = read("../../README.md");
const CLAUDE = read("../../CLAUDE.md");

/** A JSX element's own text, from its tag to the `/>` that closes it. */
function element(source: string, tag: string): string {
  const start = source.indexOf(tag);
  if (start === -1) throw new Error(`${tag} is not in the source`);

  return source.slice(start, source.indexOf("/>", start));
}

/** The page's `<WanderControl ... />`, with the Look element inside it. */
function pillElement(): string {
  const start = PAGE.indexOf("<WanderControl");
  if (start === -1) throw new Error("the page does not draw the pill");

  return PAGE.slice(start, PAGE.indexOf("</WanderControl>", start) + 1 || undefined);
}

describe("the Look button reads the one state the Settings select reads", () => {
  const button = () => element(PAGE, "<LookControl");
  const select = () => element(PAGE, '<Select\n              label="Look"');

  it("is given the select's own value and the select's own handler", () => {
    expect(button()).toContain("value={trapToControl(trap)}");
    expect(button()).toContain("onChange={handleTrapChange}");
    expect(select()).toContain("value={trapToControl(trap)}");
    expect(select()).toContain("onChange={handleTrapChange}");
  });

  it("has its own copy of no look: the component keeps only whether its menu is open", () => {
    expect(LOOK).toContain("const [open, setOpen] = useState(false);");
    expect(LOOK).not.toMatch(/useState<[^>]*Trap/);
    expect(LOOK).not.toContain("setTrap");
    expect(PAGE.match(/const handleTrapChange = /g)).toHaveLength(1);
  });

  it("is told whether a render is in flight, with the page's own flag", () => {
    expect(button()).toContain("rendering={isRendering}");
  });

  it("adds no history entry and starts no render of its own", () => {
    for (const forbidden of [
      "beginJump",
      "pushState",
      "drawCanvas",
      "renderFractal",
      "recolour",
    ]) {
      expect(LOOK, forbidden).not.toContain(forbidden);
    }

    const handler = PAGE.slice(
      PAGE.indexOf("const handleTrapChange = "),
      PAGE.indexOf("// A control that moves the view by hand."),
    );

    expect(handler).not.toContain("beginJump");
    expect(handler).toContain("handleParameterChange(() => setTrap(next));");
  });
});

describe("where it sits", () => {
  it("is the leading slot of the Auto-wander pill, so it hides with the pill and shares its measure", () => {
    const pill = pillElement();

    expect(pill).toContain("hidden={tourPlaying || tourOverlayOpen}");
    expect(pill).toContain("leading={");
    expect(pill).toContain("<LookControl");
    expect(pill).toContain("leadingWidth={LOOK_PILL_MAX_WIDTH}");
    expect(PAGE.match(/<LookControl/g)).toHaveLength(1);
  });

  it("is placed by the pill's one placement function, with its width reserved", () => {
    expect(PILL).toContain("wanderPlacement(root.clientWidth, leadingWidth)");
    expect(PILL).toContain("{leading}");
    expect(PILL).toContain("stacked");
  });

  it("is drawn after the strip, as the pill is, and takes pointer events only on its own parts", () => {
    expect(PAGE.indexOf("<LookControl")).toBeGreaterThan(
      PAGE.indexOf("<NearbyStrip"),
    );
    expect(LOOK).toContain("pointer-events-auto");
  });
});

describe("its accessible behaviour", () => {
  it("is a button with a popup, an expanded state and a name made of its visible words", () => {
    expect(LOOK).toContain('type="button"');
    expect(LOOK).toContain('aria-haspopup="menu"');
    expect(LOOK).toContain("aria-expanded={open}");
    expect(LOOK).toContain("aria-controls={open ? menuId : undefined}");
    expect(LOOK).toContain("{lookButtonText(value)}");
    expect(LOOK).not.toMatch(/aria-label=\{LOOK_CONTROL_NAME\}\s*\n\s*aria-haspopup/);
  });

  it("is a 44 px touch target with a visible focus ring", () => {
    // min-h-11 is 2.75rem, which is 44 px.
    expect(LOOK).toMatch(/BUTTON_CLASSES =\s*"[^"]*min-h-11[^"]*min-w-11/);
    expect(LOOK).toContain("focus-visible:ring-2");
    expect(LOOK).toMatch(/ITEM_CLASSES =\s*"[^"]*min-h-11/);
  });

  it("opens a menu of the four looks as radio items, the one that is on checked", () => {
    expect(LOOK).toContain('role="menu"');
    expect(LOOK).toContain('role="menuitemradio"');
    expect(LOOK).toContain("aria-checked={checked}");
    expect(LOOK).toContain("TRAP_CONTROL_OPTIONS.map(");
  });

  it("walks the menu by keyboard through the pure rule, and picks with Enter or Space on the item button", () => {
    expect(LOOK).toContain("lookMenuTarget(");
    expect(LOOK).toContain("event.preventDefault();");
    expect(LOOK).toContain('type="button"');
    expect(LOOK).toContain("onClick={() => onPick(choice.value)}");
  });

  it("closes on Escape and gives focus back to the button", () => {
    expect(LOOK).toContain('event.key === "Escape"');
    expect(LOOK).toContain("onEscape();");
    expect(LOOK).toContain("onEscape={closeToButton}");
    expect(LOOK).toMatch(/closeToButton = \(\) => \{\s*setOpen\(false\);\s*buttonRef\.current\?\.focus\(\);/);
  });

  it("gives focus back to the button after a pick", () => {
    expect(LOOK).toMatch(/onPick=\{\(picked\) => \{\s*onChange\(picked\);\s*closeToButton\(\);/);
  });

  it("closes on a press outside, and only while open", () => {
    expect(LOOK).toContain('document.addEventListener("pointerdown", handlePointerDown)');
    expect(LOOK).toContain('document.removeEventListener("pointerdown", handlePointerDown)');
    expect(LOOK).toContain("rootRef.current?.contains(target)");
    // The listener lives in the menu, which exists only while open.
    expect(LOOK).toContain("{open && (");
  });

  it("closes when Tab moves on to another element, without stealing focus", () => {
    expect(LOOK).toContain("onBlur={(event) => {");
    expect(LOOK).toContain("!event.currentTarget.contains(next)");
  });

  it("opens with focus on the look that is on, once, and not again when the look changes underneath", () => {
    expect(LOOK).toContain("const [openedOn] = useState(value);");
    expect(LOOK).toContain("[openedOn, rootRef, onDismiss]");
    expect(LOOK).toContain("const dismiss = useCallback(");
  });

  it("stays usable during a render and shows the page's busy cue", () => {
    expect(LOOK).toContain("aria-busy={rendering}");
    expect(LOOK).toContain("motion-safe:animate-pulse");
    expect(LOOK).not.toContain("disabled");
  });
});

describe("the words", () => {
  it("renames the Settings select to Look, and leaves no Orbit trap label", () => {
    expect(PAGE.match(/label="Look"/g)).toHaveLength(1);
    expect(PAGE).not.toContain('label="Orbit trap"');
  });

  it("keeps the option values and the link key as they were", () => {
    const palette = read("../lib/paletteControls.ts");
    const link = read("../lib/viewLink.ts");

    expect(palette).toContain("value: TRAP_OFF_VALUE, label: \"Normal\"");
    expect(palette).toContain("label: `Glass: ");
    expect(link).toContain('"m"');
  });

  it("Help names the Look control, what Glass does, that it is slower, and that previews are Normal", () => {
    expect(HELP).toContain('keys: "Look"');
    expect(HELP).toMatch(/Glass colours each point by how close its orbit comes/);
    expect(HELP).toMatch(/Glass renders more slowly than Normal/);
    expect(HELP).toMatch(/preview[\s\S]{0,160}always the Normal picture/);
    expect(HELP).toMatch(/bottom right of the picture, beside the Auto-wander pill/);
  });

  it("the README names the Look control, Glass, its slowness and the Normal previews", () => {
    expect(README).toContain("**Look**");
    expect(README).toContain("Glass: Point, Glass: Line and Glass: Circle");
    expect(README).toContain("Glass renders more slowly than Normal");
    expect(README).toContain("always previews as the Normal picture");
    expect(README).toContain("LookControl.tsx");
    expect(README).toContain("lookControl.ts");
  });

  it("CLAUDE.md names the Look control and keeps its note", () => {
    expect(CLAUDE).toContain("**Look control**");
    expect(CLAUDE).toContain("(fr-02s)");
    expect(CLAUDE).toContain("Look: the orbit trap on the picture");
  });
});
