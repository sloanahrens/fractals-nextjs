/**
 * The Julia map: the parts that live in markup and in the page's wiring
 *
 * What a pick means in the plane is `juliaMap.test.ts`'s business, and what a
 * pick does to the state is the page's. What a Node suite with no DOM cannot
 * render is the control itself and the page's use of it, so this reads the
 * sources the way the other panel tests here do: the inset is in the Settings
 * drawer and only for Julia, it draws after the main picture has settled and
 * keeps what it drew, it is focusable and stepable from the keyboard, and a
 * gesture leaves one history entry rather than one per pointer move.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HELP_SECTIONS } from "../lib/helpEntries";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/FractalExplorer.tsx");
const map = source("../components/ui/JuliaMap.tsx");

/** The page's whole pick block: the point the ring marks and what a pick does. */
const pick = page.slice(
  page.indexOf("const juliaConstantPoint"),
  page.indexOf("const resetToDefault"),
);

/** The component's drawing effect. */
const draw = map.slice(
  map.indexOf("useEffect(() =>"),
  map.indexOf("const pointAt"),
);

describe("where the map is", () => {
  it("is in the Settings drawer, not over the picture", () => {
    const drawer = page.indexOf("<SettingsDrawer");
    const drawn = page.indexOf("<JuliaMap");

    expect(drawn).toBeGreaterThan(drawer);
    expect(drawn).toBeLessThan(page.indexOf("</SettingsDrawer>"));
  });

  it("sits under the constant select and above the two boxes", () => {
    // The order matters, and not for looks: a pick makes the constant a custom
    // one, the Real and Imaginary boxes then appear, and boxes appearing above
    // the map would push it down under a pointer that is mid-drag — the pick
    // would land where the map used to be. Only what is below it may change.
    expect(page.indexOf("<JuliaMap")).toBeGreaterThan(
      page.indexOf("onChange={handleVariantSelect}"),
    );
    expect(page.indexOf("<JuliaMap")).toBeLessThan(
      page.indexOf("isCustomVariant(fractalType, variant) &&"),
    );
  });

  it("is drawn only while the fractal is Julia", () => {
    // The map of constants is the Mandelbrot set's parameter plane: the Julia
    // family is indexed by a point of it, the Multibrot's setting is a power.
    expect(page).toMatch(/fractalType === "julia" && \(\s*<JuliaMap/);
  });

  it("is described in the help overlay", () => {
    const rows = HELP_SECTIONS.flatMap((section) => section.entries);

    expect(rows.some((entry) => entry.keys === "Julia map")).toBe(true);
  });
});

describe("what the page hands it", () => {
  it("the point the constant is, falling back as the renderer does", () => {
    expect(pick).toContain(
      "parseJuliaConstant(variant) ?? JULIA_CONSTANTS[0].constant",
    );
  });

  it("the scheme the picture is drawn in, so the two cannot disagree", () => {
    expect(page).toContain("colorScheme={colorScheme}");
  });

  it("the settled picture, which is the tour's own signal", () => {
    expect(page).toContain("settled={pictureSettled}");
    expect(page).toContain(
      "const pictureSettled =\n    !isRendering && renderedLink !== \"\" && renderedLink === currentLink;",
    );
  });

  it("one jump per gesture, and the pick itself", () => {
    expect(page).toContain("onGestureStart={beginJump}");
    expect(page).toContain("onPick={handleJuliaMapPick}");
  });
});

describe("what a pick does", () => {
  it("sets the constant the way a typed one is set", () => {
    expect(pick).toContain(
      "const name = customConstantName(point.real, point.imaginary);",
    );
    expect(pick).toContain("setVariant(name);");
  });

  it("leaves the view where it is, so the picture follows the pointer live", () => {
    // Reframing on every pointer move would throw the visitor's zoom away
    // between one move and the next, which is the whole picture of this
    // control: it changes c and not the view.
    expect(pick).not.toContain("applyDefaultView");
    expect(pick).not.toContain("handleVariantChange");
  });

  it("is no new render for the constant already drawn", () => {
    expect(pick).toContain("if (name === null || name === variant) return;");
  });

  it("restarts the walk's countdown, as every hand-made move does", () => {
    expect(pick).toContain("wander.notifyActivity();");
  });
});

describe("the control", () => {
  it("is a 160 x 120 canvas of the map's own frame", () => {
    expect(map).toContain("width={JULIA_MAP_WIDTH}");
    expect(map).toContain("height={JULIA_MAP_HEIGHT}");
    expect(map).toContain("viewBox={`0 0 ${JULIA_MAP_WIDTH} ${JULIA_MAP_HEIGHT}`}");
  });

  it("draws the Mandelbrot set with the shared pixel pipeline", () => {
    expect(map).toContain("renderRgba(");
    expect(map).toContain("mandelbrotKind");
    expect(map).toContain("JULIA_MAP_ITERATIONS");
    // Whole counts, as a chart is drawn: the smooth shading is the picture's
    // business and costs more than it shows at this size.
    expect(map).toMatch(/mandelbrotKind,\s*false,/);
  });

  it("waits for the main picture to settle, then takes a macrotask of its own", () => {
    const settled = draw.indexOf("if (!settled) return;");

    expect(settled).toBeGreaterThan(-1);
    expect(settled).toBeLessThan(draw.indexOf("renderRgba("));
    expect(draw).toContain("window.setTimeout(");
    expect(draw).toContain("window.clearTimeout(timer)");
  });

  it("keeps each scheme's picture rather than drawing it again", () => {
    expect(draw).toContain("cacheRef.current.get(colorScheme)");
    expect(draw).toContain("cacheRef.current.set(colorScheme, image)");
  });

  it("holds no state at all: the picture is drawn straight onto the canvas", () => {
    expect(map).not.toContain("useState");
    expect(draw).toContain("putImageData");
  });

  it("marks the current constant with a ring", () => {
    expect(map).toContain("data-julia-map-ring");
    expect(map).toContain("complexToInsetPoint(");
    expect(map).toContain("RING_RADIUS");
    // Two circles, because one stroke cannot be seen on every colour scheme.
    expect(map.match(/<circle/g)?.length).toBe(2);
  });

  it("is focusable, with a name that says what it is for", () => {
    expect(map).toContain("tabIndex={0}");
    expect(map).toContain("aria-label={JULIA_MAP_LABEL}");
  });

  it("steps the constant with the arrow keys", () => {
    expect(map).toContain("onKeyDown={handleKeyDown}");
    expect(map).toContain("event.preventDefault();");
    expect(map).toContain("stepJuliaMapPoint(");
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      expect(map).toContain(`${key}: [`);
    }
  });

  it("picks under the pointer, and only while a gesture is on", () => {
    expect(map).toContain("onPointerDown={handlePointerDown}");
    expect(map).toContain("onPointerMove={handlePointerMove}");
    expect(map).toContain("draggingRef.current = true;");
    expect(map).toContain("if (!draggingRef.current) return;");
    expect(map).toContain("setPointerCapture(event.pointerId)");
    // A cancelled gesture and a finished one both end the drag.
    expect(map.match(/draggingRef\.current = false;/g)?.length).toBe(2);
  });

  it("takes a touch, so a drag on a touch screen picks rather than scrolls", () => {
    expect(map).toContain("touch-none");
  });

  it("starts the one jump the gesture makes", () => {
    // One call, on the way in: the drag itself only rewrites the constant
    // inside the entry that call began, so Back returns to the view before it.
    const down = map.slice(
      map.indexOf("const handlePointerDown"),
      map.indexOf("const handlePointerMove"),
    );

    expect(down.match(/onGestureStart\(\)/g)?.length).toBe(1);
    expect(map.match(/onGestureStart\(\)/g)?.length).toBe(1);
  });
});
