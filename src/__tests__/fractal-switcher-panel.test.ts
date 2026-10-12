/**
 * The fractal switcher: the parts that live in markup and in the page's wiring
 *
 * Where a button lands is `places.test.ts`'s business (`featuredPlace`,
 * `wholeSetPlaceFor`). What a Node suite with no DOM cannot render is the
 * component and the page, so this reads the sources the way the Nearby strip
 * and Tour tests here do: five buttons that say which is pressed, the chips
 * for a fractal that takes a variant, a switch that goes through the tile's
 * handler, the Custom chip's trip to the Real box, and the places it hides.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FRACTAL_TYPES } from "../lib/fractalTypes";
import { JULIA_CONSTANTS } from "../lib/julia";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/FractalExplorer.tsx");
const switcher = source("../components/ui/FractalSwitcher.tsx");
const hint = source("../components/ui/BlankHint.tsx");
const help = source("../lib/helpEntries.ts");

/** The body of the page's handler `name`, up to the next top-level `const`. */
function handlerBody(name: string): string {
  const start = page.indexOf(`const ${name} = `);
  if (start === -1) throw new Error(`${name} is not in the page`);

  const end = page.indexOf("\n  const ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

describe("the switcher's buttons", () => {
  it("are the picker's eight fractals, mapped from FRACTAL_TYPES", () => {
    expect(FRACTAL_TYPES.map((type) => type.label)).toEqual([
      "Mandelbrot",
      "Julia",
      "Burning Ship",
      "Tricorn",
      "Multibrot",
      "Newton",
      "Celtic",
      "Perp. Ship",
    ]);
    expect(switcher).toContain("FRACTAL_TYPES.map((type)");
    expect(switcher).toContain("{type.label}");
  });

  it("bring the lit button into view, since the row scrolls on a narrow screen", () => {
    expect(switcher).toContain("ref={current ? currentButton : undefined}");
    expect(switcher).toMatch(
      /currentButton\.current\?\.scrollIntoView\(\{\s*inline: "nearest",\s*block: "nearest",?\s*\}\)/,
    );
    expect(switcher).toContain("[fractalType, hidden]");
  });

  it("say which one is current with aria-pressed, in a labelled group", () => {
    expect(switcher).toContain('aria-label="Fractal"');
    expect(switcher).toContain("aria-pressed={current}");
    expect(switcher).toContain("const current = type.id === fractalType");
  });

  it("are real buttons with a visible focus ring, and the current one does nothing", () => {
    expect(switcher).toContain('type="button"');
    expect(switcher).toMatch(/focus-visible:ring-2/);
    expect(switcher).toContain("if (!current) onSelectFractal(type.id)");
  });

  it("scroll sideways in a narrow picture instead of wrapping over it", () => {
    // The eight labels are wider than 375 px at text-xs with px-1.5 (six were
    // 375 px when measured in headless Chrome with a DevTools session at 375
    // and 320: 351 and 296 px of room inside the gutters), so the row scrolls
    // on both. The group is capped at the picture's width and scrolls, and a
    // button keeps its label on one line at its own width, so a narrower
    // picture cannot wrap it.
    const group = switcher.slice(
      switcher.indexOf('aria-label="Fractal"') - 40,
      switcher.indexOf("FRACTAL_TYPES.map"),
    );

    expect(group).toContain("max-w-full");
    expect(group).toContain("overflow-x-auto");
    expect(group).not.toMatch(/flex-wrap/);

    const buttonClasses = switcher.slice(
      switcher.indexOf("const BUTTON_CLASSES"),
      switcher.indexOf("const CHIP_CLASSES"),
    );
    expect(buttonClasses).toContain("shrink-0");
    expect(buttonClasses).toContain("whitespace-nowrap");
  });

  it("keep their full names: no abbreviated label is in the markup", () => {
    expect(switcher).not.toMatch(/Mandel["<]|>\s*Ship\s*</);
  });
});

describe("the Julia chips", () => {
  it("show only while the fractal on the canvas takes a variant, and name it in a caption", () => {
    expect(switcher).toMatch(/\{variants !== null && \(/);
    expect(switcher).toContain("const variants = fractalVariants(fractalType)");
    expect(switcher).not.toContain('"julia"');
    expect(switcher).toContain("{variants.label}");
  });

  it("are the descriptor's options then Custom when it allows one, pressed like the Settings select", () => {
    expect(JULIA_CONSTANTS).toHaveLength(4);
    expect(switcher).toContain("variants.options.map((option)");
    expect(switcher).toContain("{option.label}");
    expect(switcher).toContain("{variants.allowsCustom && (");
    expect(switcher).toContain("{CUSTOM_OPTION_LABEL}");
    expect(switcher.indexOf("{option.label}")).toBeLessThan(
      switcher.indexOf("{CUSTOM_OPTION_LABEL}"),
    );
    expect(switcher).toContain("const current = option.value === variant");
    expect(switcher).toContain("aria-pressed={customCurrent}");
    expect(switcher).toContain("isCustomVariant(fractalType, variant)");
  });

  it("scroll sideways and never wrap over the picture", () => {
    expect(switcher).toContain("aria-label={variants.label}");
    expect(switcher).toMatch(/overflow-x-auto/);
    expect(switcher).toMatch(/shrink-0 whitespace-nowrap/);
    expect(switcher).not.toMatch(/flex-wrap/);
  });
});

describe("the switcher's place on the page", () => {
  it("is drawn inside the canvas's wrapper, over the picture, and never fades", () => {
    const wrapper = page.slice(
      page.indexOf('<div className="relative">'),
      page.indexOf("</main>"),
    );

    expect(wrapper).toContain("<FractalSwitcher");
    expect(switcher).toMatch(/absolute inset-x-3 top-3 z-10/);
    expect(switcher).not.toContain("useIdleVisibility");
    expect(switcher).not.toMatch(/opacity-0|transition-opacity/);
  });

  it("takes no pointer events outside its buttons, so the canvas still pans", () => {
    expect(switcher).toMatch(/pointer-events-none absolute/);
    expect(
      switcher.match(/pointer-events-auto/g)?.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("stays under the top bar's stacking level", () => {
    const topBar = source("../components/ui/TopBar.tsx");
    const bar = Number(topBar.match(/fixed inset-x-0 top-0 z-(\d+)/)?.[1]);
    const mine = Number(
      switcher.match(/absolute inset-x-3 top-3 z-(\d+)/)?.[1],
    );

    expect(mine).toBeLessThan(bar);
  });

  it("is hidden while a tour plays and while the drawer or the help is open", () => {
    expect(page).toContain("hidden={tourPlaying || tourOverlayOpen}");
    expect(page).toContain("const tourOverlayOpen = settingsOpen || helpOpen");
    expect(switcher).toContain("if (hidden) return null");
  });

  it("is cleared by the blank-picture hint, one row lower for the chips", () => {
    expect(hint).toContain('belowChips ? "top-24" : "top-14"');
    expect(page).toContain("belowChips={variants !== null}");
  });
});

describe("a click on the switcher", () => {
  it("switches fractal by going to its featured place through the tile's handler", () => {
    const body = handlerBody("handleSwitchFractal");

    expect(body).toContain("handlePlaceSelect(featuredPlace(typeId))");
    // The one place that makes the history entry, the crossfade and the scheme.
    expect(body).not.toContain("beginJump");
    expect(body).not.toContain("setFractalType");
  });

  it("does nothing for the fractal already shown", () => {
    expect(handlerBody("handleSwitchFractal")).toContain(
      "if (typeId === fractalType) return",
    );
  });

  it("sends a named chip (a constant or a power) to its whole set, and only changes the variant without one", () => {
    const body = handlerBody("handleSwitchVariant");

    expect(body).toContain("wholeSetPlaceFor(name, fractalType)");
    expect(body).toContain("handlePlaceSelect(whole)");
    expect(body).toContain("setVariant(name)");
    expect(body).toContain("if (name === variant) return");
    // Without a place the view stays put: no reframing to the default.
    expect(body).not.toContain("applyDefaultView");
    expect(body).not.toContain("setCenterX");
  });

  it("makes Custom the select's own pick, then opens Settings with focus bound for the Real box", () => {
    const body = handlerBody("handleSwitchCustom");

    expect(body).toContain("handleVariantSelect(CUSTOM_OPTION_VALUE)");
    expect(body).toContain("focusJuliaRealRef.current = true");
    expect(body).toContain("setSettingsOpen(true)");
  });

  it("moves focus to the Real box once the drawer is open, and only then", () => {
    expect(page).toMatch(
      /if \(!settingsOpen \|\| !focusJuliaRealRef\.current\) return;\s+focusJuliaRealRef\.current = false;\s+juliaRealInputRef\.current\?\.focus\(\)/,
    );
    expect(page).toMatch(/label="Real"\s+inputRef=\{juliaRealInputRef\}/);
  });

  it("hands the switcher the three handlers and the page's own two values", () => {
    expect(page).toMatch(
      /<FractalSwitcher\s+fractalType=\{fractalType\}\s+variant=\{variant\}\s+onSelectFractal=\{handleSwitchFractal\}\s+onSelectVariant=\{handleSwitchVariant\}\s+onSelectCustom=\{handleSwitchCustom\}/,
    );
  });
});

describe("the Settings selects", () => {
  it("stay, on the same two pieces of state as the switcher", () => {
    expect(page).toContain('label="Fractal"');
    expect(page).toContain("value={fractalType}");
    expect(page).toContain("onChange={handleFractalTypeChange}");
    expect(page).toContain("label={variants.label}");
    expect(page).toContain("onChange={handleVariantSelect}");
  });
});

describe("the Help overlay", () => {
  it("has a row for the switcher", () => {
    expect(help).toMatch(/keys: "Fractal buttons"/);
    expect(help).toContain("Custom");
  });
});
