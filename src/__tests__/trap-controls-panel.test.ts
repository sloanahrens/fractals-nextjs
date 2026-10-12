/**
 * The orbit-trap control in the page: the half of it a Node suite cannot render.
 *
 * What a trap is, how its distance becomes a colour, that a repaint after a
 * trap render is the full render byte for byte, and what a link, a tour stop and
 * a saved view make of `m` are the pure modules' own tests' business
 * (`orbitTrap`, `trapDistance`, `fractalRendererTrap`, `viewLink`, `tourLink`,
 * `presets`). What is decided here, in `FractalExplorer.tsx`, is that the
 * Settings drawer gives a visitor an Orbit trap select beside the colour
 * controls, that choosing one is a render and leaves no history entry of its
 * own, that Reverse, Shift, the scheme and cycling keep repainting while a trap
 * is on, that Reset colours turns it off, that a hop nobody aimed at a place
 * drops it, and that the link, the saved view, the export, the probe and the
 * strip all carry it.
 *
 * The suite runs in Node with no DOM to render into, so this reads the sources,
 * the way the other panel tests here do.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const PAGE = read("../app/FractalExplorer.tsx");
const MANAGER = read("../components/ui/CustomPresetManager.tsx");
const STRIP = read("../components/ui/NearbyStrip.tsx");
const SELECT = read("../components/ui/Select.tsx");
const HELP = read("../lib/helpEntries.ts");
const README = read("../../README.md");

/** A whole `const NAME = ...` declaration: its signature and its body. */
function functionBody(source: string, name: string): string {
  const declaration = source.indexOf(`const ${name} = `);
  if (declaration === -1) throw new Error(`${name} is not in the source`);

  const arrow = source.indexOf("=>", declaration);
  const open = source.indexOf("{", arrow);
  const line = source.indexOf("\n", arrow);

  if (open === -1 || open > line) return source.slice(declaration, line);

  let depth = 0;

  for (let index = open; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) {
      return source.slice(declaration, index + 1);
    }
  }

  throw new Error(`unbalanced braces in ${name}`);
}

/** The drawer's Rendering Parameters card, where the controls live. */
function renderingParametersCard(): string {
  const start = PAGE.indexOf(">Rendering Parameters<");
  const end = PAGE.indexOf("{/* Canvas Resolution */}", start);
  if (start === -1 || end === -1) throw new Error("the card is gone");

  return PAGE.slice(start, end);
}

/** A JSX element's own text, from its tag to the `/>` that closes it. */
function element(source: string, tag: string): string {
  const start = source.indexOf(tag);
  if (start === -1) throw new Error(`${tag} is not in the source`);

  return source.slice(start, source.indexOf("/>", start));
}

describe("the Look select", () => {
  it("is in the Rendering Parameters card, between the scheme and the Shift slider, and nowhere else", () => {
    const card = renderingParametersCard();
    const where = (needle: string) => card.indexOf(needle);

    expect(where('label="Color Scheme"')).toBeGreaterThan(-1);
    expect(where('label="Reverse"')).toBeGreaterThan(where('label="Color Scheme"'));
    expect(where('label="Look"')).toBeGreaterThan(where('label="Reverse"'));
    expect(where('label="Look"')).toBeLessThan(where('label="Shift"'));
    expect(PAGE.match(/label="Look"/g)).toHaveLength(1);

    // Nothing was added to the picture: the control is in the drawer, which
    // opens after the bar, the switcher, the strip and the canvas in the markup.
    for (const surface of ["<TopBar", "<FractalSwitcher", "<NearbyStrip", "<canvas"]) {
      expect(PAGE.indexOf(surface), surface).toBeLessThan(
        PAGE.indexOf('label="Look"'),
      );
    }
  });

  it("offers Off and the three shapes by name, and shows the state the page holds", () => {
    const select = element(PAGE, '<Select\n              label="Look"');

    expect(select).toContain("value={trapToControl(trap)}");
    expect(select).toContain("options={[...TRAP_CONTROL_OPTIONS]}");
    expect(select).toContain("onChange={handleTrapChange}");
  });

  it("is a touch target of at least 44 px, through the select's own class prop", () => {
    const select = element(PAGE, '<Select\n              label="Look"');

    expect(select).toContain('selectClassName="min-h-11"');
    expect(SELECT).toContain("selectClassName");
    // min-h-11 is 2.75rem, which is 44 px; it must be Tailwind's own class.
    expect(select).toContain("min-h-11");
  });

  it("is a labelled form control, so it has an accessible name", () => {
    // The shared Select pairs its <label> with the <select> by id.
    expect(SELECT).toContain("htmlFor={selectId}");
    expect(SELECT).toContain("id={selectId}");
  });

  it("starts off", () => {
    expect(PAGE).toContain("const [trap, setTrap] = useState<TrapShape | null>(");
    expect(PAGE).toContain("DEFAULT_VIEW_LINK_UPDATES.trap,");
  });
});

describe("choosing a trap", () => {
  const body = () => functionBody(PAGE, "handleTrapChange");

  it("only sets the state: the draw effect that follows is the render", () => {
    for (const render of [
      "drawCanvas",
      "renderFractal",
      "renderPreview",
      "setIsRendering",
      "notifyRenderStart",
    ]) {
      expect(body(), render).not.toContain(render);
    }

    expect(body()).toContain("handleParameterChange(() => setTrap(next));");
    // Read through the one reading of the select's value, so a value from
    // outside is off and never a shape the renderer does not know.
    expect(body()).toContain("controlToTrap(value)");
  });

  it("leaves no history entry of its own: it rewrites the entry the view is on", () => {
    // A jump is what makes an entry (`beginJump`); a trap choice is a way of
    // colouring the view the visitor is on, so the address bar follows it and
    // Back still returns to the place before.
    expect(body()).not.toContain("beginJump");
  });

  it("does nothing for the choice already made", () => {
    expect(body()).toContain("if (next === trap) return;");
  });

  it("clears the selected preset, which the view has moved off", () => {
    expect(body()).toContain("handleParameterChange(");
    expect(functionBody(PAGE, "handleParameterChange")).toContain(
      'setCurrentPreset("")',
    );
  });
});

describe("the draw", () => {
  const draw = () => {
    const start = PAGE.indexOf("const drawCanvas = useCallback(");
    return PAGE.slice(start, PAGE.indexOf("// Initialize canvas and renderer", start));
  };

  it("puts the trap in the render config, and nowhere in a preview's way", () => {
    expect(draw()).toContain("...(trap ? { trap } : {}),");
  });

  it("asks recolour for a repaint in the trap it was drawn in, and falls through to a render when it cannot", () => {
    // The repaint is the condition of the same `if` as the equal-links test,
    // and `m` is not a colour-only key, so a new trap or a new shape is two
    // links that differ and the page renders; a scheme, Reverse or Shift inside
    // one trap compares equal and repaints from the kept distances.
    expect(draw()).toMatch(
      /linkWithoutColour\(showing\) === linkWithoutColour\(link\) &&\s*renderer\.recolour\(\s*colorScheme,\s*effectiveMaxIterations,\s*colorOptions,\s*trap \?\? undefined,\s*\)/,
    );
    expect(draw().indexOf("renderer.recolour(")).toBeLessThan(
      draw().indexOf("renderFractal("),
    );
  });

  it("re-runs when the trap moves", () => {
    expect(PAGE).toContain(
      "[bounds, effectiveMaxIterations, colorScheme, colorOptions, trap, wander]",
    );
  });
});

describe("Reverse, Shift, the scheme and cycling inside a trap", () => {
  it("cycling repaints from the kept distances: its frame passes the trap, and restarts when it changes", () => {
    const start = PAGE.indexOf("const cycleLoopMs = ");
    const loop = PAGE.slice(start, PAGE.indexOf("// Helper functions for manual", start));

    expect(loop).toMatch(
      /renderer\.recolour\(\s*colorScheme,\s*effectiveMaxIterations,\s*\{ reverse, shift: next \},\s*trap \?\? undefined,\s*\)/,
    );
    expect(loop).toMatch(/\[\s*cycling,[\s\S]*reverse,\s*trap,\s*effectiveMaxIterations,\s*\]/);
    // Still no render from a frame.
    for (const render of ["drawCanvas", "renderFractal", "setIsRendering"]) {
      expect(loop, render).not.toContain(render);
    }
  });

  it("Reverse and Shift stay the handlers they were: set state, draw effect repaints", () => {
    expect(functionBody(PAGE, "handleReverseChange")).not.toContain("setTrap");
    expect(functionBody(PAGE, "handleShiftChange")).not.toContain("setTrap");
  });
});

describe("Reset colours", () => {
  it("turns the trap off with Reverse and Shift, and is enabled while one is on", () => {
    const body = functionBody(PAGE, "handleResetColours");

    expect(body).toContain("setReverse(DEFAULT_REVERSE);");
    expect(body).toContain("setShift(DEFAULT_SHIFT);");
    expect(body).toContain("setTrap(DEFAULT_TRAP);");
    expect(PAGE).toContain("disabled={isDefaultColorOptions(reverse, shift, trap)}");
  });

  it("is also what Reset View puts back", () => {
    expect(functionBody(PAGE, "resetToDefault")).toContain(
      "setTrap(DEFAULT_VIEW_LINK_UPDATES.trap);",
    );
  });
});

describe("a hop that lands on a place", () => {
  it("keeps the trap by default and drops it when the hop was nobody's aim", () => {
    const select = functionBody(PAGE, "handlePlaceSelect");

    expect(select).toContain(
      "? { reverse: DEFAULT_REVERSE, shift: DEFAULT_SHIFT, trap: DEFAULT_TRAP }",
    );
    // An Auto-wander hop names its Look; any other caller leaves it as it was.
    expect(select).toContain(
      "trap: lookOverride === undefined ? trap : lookOverride,",
    );
    expect(select).toContain("setTrap(options.trap);");
    // The crossfade aims at the picture the setters will leave, trap and all.
    expect(select).toContain("trap: options.trap,");
  });

  it("is reset by Surprise me and a tour hop, and by nothing the visitor aimed", () => {
    expect(functionBody(PAGE, "handleSurprise")).toContain(
      "handlePlaceSelect(target, { resetColour: true })",
    );
    expect(PAGE).toContain(
      "handlePlaceSelect(place, { tour: true, resetColour: true })",
    );
    expect(functionBody(PAGE, "handleSwitchFractal")).not.toContain("resetColour");
  });
});

describe("what carries the trap", () => {
  it("the link: encoded by viewLinkFor, read by applyViewLink, so Copy link, the address bar and Share follow", () => {
    const encode = PAGE.slice(
      PAGE.indexOf("const viewLinkFor = "),
      PAGE.indexOf("const currentLink = "),
    );
    expect(encode).toContain("        trap,\n");
    expect(encode).toMatch(/\[\s*fractalType,[\s\S]*reverse,\s*trap,\s*autoIterationsOn/);

    expect(PAGE).toContain("setTrap(updates.trap);");
    // Still the one place the page builds a link.
    expect(PAGE.match(/encodeView\(\{\s*fractalType,/g)).toHaveLength(1);
  });

  it("a tour stop applies its trap, or turns it off", () => {
    const stop = functionBody(PAGE, "showStop");

    expect(stop).toContain("setTrap(stop.trap);");
  });

  it("a saved view: written by the manager and read by a preset load", () => {
    expect(PAGE).toContain("currentTrap={trap}");
    expect(MANAGER).toContain("currentTrap: TrapShape | null;");
    expect(MANAGER).toContain(
      "...presetColorFields(currentReverse, currentShift, currentTrap),",
    );
    expect(functionBody(PAGE, "handlePresetSelect")).toContain(
      "setTrap(presetTrap(preset));",
    );
  });

  it("an export is drawn in it", () => {
    const run = functionBody(PAGE, "runExport");

    expect(run).toContain("...(trap ? { trap } : {}),");
    expect(PAGE).toMatch(
      /\[\s*effectiveMaxIterations,\s*colorScheme,\s*colorOptions,\s*trap,\s*fractalKind,\s*releaseExport,\s*\]/,
    );
  });

  it("the Math card's swatch is the trap's colour", () => {
    const probe = PAGE.indexOf("probeAtPointer(");

    expect(PAGE.slice(probe, probe + 400)).toContain("trap,");
  });

  it("the strip's tiles are drawn in it, so a tile is the picture a click shows", () => {
    expect(element(PAGE, "<NearbyStrip")).toContain("colorOptions={thumbnailLook}");
    expect(PAGE).toContain("() => ({ reverse, shift, trap }),");
    expect(STRIP).toContain("colorOptions?: ThumbnailLook;");
  });
});

describe("the previews do not change", () => {
  it("the page metadata and the static previews read no trap", () => {
    for (const path of [
      "../lib/viewPreview.ts",
      "../lib/pageMetadata.ts",
      "../lib/ogImage.ts",
      "../lib/ogView.ts",
      "../app/api/og/route.ts",
      "../../scripts/make-og-previews.mjs",
    ]) {
      const source = read(path);

      expect(source, path).not.toMatch(/\btrap\b/i);
    }
  });
});

describe("the words", () => {
  it("the Help overlay has a Look entry that says previews show the normal picture", () => {
    expect(HELP).toContain('keys: "Look"');
    expect(HELP).toMatch(/preview[\s\S]{0,120}Normal/);
  });

  it("the README has a short Orbit traps paragraph in the colour section", () => {
    expect(README).toMatch(/Orbit Traps/);
    expect(README).toContain("`m=");
  });
});
