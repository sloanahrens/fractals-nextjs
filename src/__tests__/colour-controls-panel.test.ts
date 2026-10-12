/**
 * The colour controls in the page: the half of them a Node suite cannot render.
 *
 * That the percent and the fraction of a turn are each other, that a link
 * writes and reads the two keys, and that a repaint colours kept counts are the
 * pure modules' own tests' business. What is decided here — in
 * `FractalExplorer.tsx`, `CustomPresetManager.tsx` and the drawer — is that the
 * Settings drawer gives a visitor a Reverse checkbox and a Shift slider under
 * the scheme they belong to, that moving either repaints rather than counts the
 * view again, that a drag is one history entry and not one per step, that the
 * Reset button puts both back, that a saved view carries them, and that a hop
 * nobody aimed at a place lands on the place's own colours.
 *
 * The suite runs in Node with no DOM to render into, so this reads the sources,
 * the way the other panel tests here do.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PAGE_PATH = fileURLToPath(
  new URL("../app/FractalExplorer.tsx", import.meta.url),
);
const PAGE = readFileSync(PAGE_PATH, "utf8");
const MANAGER_PATH = fileURLToPath(
  new URL("../components/ui/CustomPresetManager.tsx", import.meta.url),
);
const MANAGER = readFileSync(MANAGER_PATH, "utf8");

/**
 * A whole `const NAME = ...` declaration in a source: its signature and its
 * body.
 *
 * The `=>` is found first, because a handler may take a destructured argument
 * (`handlePlaceSelect`), whose braces are not the function's body. A body that
 * is a block is matched brace for brace; one that is a single expression is
 * taken to the end of its line.
 */
function functionBody(source: string, name: string): string {
  const declaration = source.indexOf(`const ${name} = `);
  if (declaration === -1) throw new Error(`${name} is not in the source`);

  const arrow = source.indexOf("=>", declaration);
  if (arrow === -1) throw new Error(`${name} is not an arrow function`);

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

/** A JSX element's own text, from its tag to the tag that closes it. */
function element(source: string, tag: string): string {
  const start = source.indexOf(tag);
  if (start === -1) throw new Error(`${tag} is not in the source`);

  return source.slice(start, source.indexOf("/>", start));
}

/**
 * The JSX element around a piece of markup: the tag it opens with, up to the
 * `/>` that closes it. `lastIndexOf` from the needle, because the tag the
 * needle is in is the one that opened most recently.
 */
function elementAround(source: string, needle: string, tag: string): string {
  const at = source.indexOf(needle);
  if (at === -1) throw new Error(`${needle} is not in the source`);

  const open = source.lastIndexOf(tag, at);
  if (open === -1) throw new Error(`${needle} is not inside ${tag}`);

  const close = source.indexOf("/>", at);

  return source.slice(open, close === -1 ? undefined : close + 2);
}

/** The drawer's Rendering Parameters card, where the controls live. */
function renderingParametersCard(): string {
  const start = PAGE.indexOf(">Rendering Parameters<");
  if (start === -1) throw new Error("the Rendering Parameters card is gone");

  const end = PAGE.indexOf("{/* Canvas Resolution */}", start);
  if (end === -1) throw new Error("the Rendering Parameters card is unbounded");

  return PAGE.slice(start, end);
}

describe("the colour controls", () => {
  it("reads the sources it is checking", () => {
    expect(PAGE.length).toBeGreaterThan(10_000);
    expect(MANAGER).toContain("CustomPresetManager");
  });

  it("sit in the drawer, under the scheme they belong to", () => {
    const card = renderingParametersCard();
    const where = (needle: string) => card.indexOf(needle);

    // Under the select, in order, and all three inside the one card: the
    // palette belongs to the scheme, and a visitor who has just picked one
    // finds its settings right below it.
    expect(where('label="Color Scheme"')).toBeGreaterThan(-1);
    expect(where('label="Color Scheme"')).toBeLessThan(
      where('label="Reverse"'),
    );
    expect(where('label="Reverse"')).toBeLessThan(where('label="Shift"'));
    expect(where('label="Shift"')).toBeLessThan(where("Reset colours"));
    // Nothing was added to the picture: the controls are in the drawer, which
    // opens after them in the page's markup.
    expect(where('label="Reverse"')).toBeGreaterThan(-1);
    expect(PAGE.indexOf("<SettingsDrawer")).toBeLessThan(
      PAGE.indexOf('label="Reverse"'),
    );

    const reverse = elementAround(card, 'label="Reverse"', "<Checkbox");
    expect(reverse).toContain("checked={reverse}");
    expect(reverse).toContain("onChange={handleReverseChange}");
  });

  it("is a native slider with a percent readout and the page's own travel", () => {
    const shift = elementAround(
      renderingParametersCard(),
      'label="Shift"',
      "<Slider",
    );

    expect(shift).toContain("value={shiftToPercent(shift)}");
    expect(shift).toContain("min={SHIFT_PERCENT_MIN}");
    expect(shift).toContain("max={SHIFT_PERCENT_MAX}");
    // Step 1, as a percent, with the readout the module words.
    expect(shift).toContain("step={1}");
    expect(shift).toContain("formatValue={formatShiftPercent}");
    expect(shift).toContain("onChange={handleShiftChange}");
  });

  it("puts both back with a button that is disabled when there is nothing to put back", () => {
    const card = renderingParametersCard();
    const reset = card.slice(card.indexOf("Reset colours"));
    const button = card.slice(
      card.lastIndexOf("<Button", card.indexOf("Reset colours")),
      card.indexOf("Reset colours"),
    );

    expect(reset).toContain("Reset colours");
    expect(button).toContain("onClick={handleResetColours}");
    expect(button).toContain(
      "disabled={isDefaultColorOptions(reverse, shift, trap)}",
    );

    const body = functionBody(PAGE, "handleResetColours");
    expect(body).toContain("setReverse(DEFAULT_REVERSE);");
    expect(body).toContain("setShift(DEFAULT_SHIFT);");
  });
});

describe("a change of either setting", () => {
  it("repaints from kept counts, and starts no render of its own", () => {
    // The picture's counts are unchanged by a colour, so the draw repaints
    // them — the same path a colour scheme change takes (`palette-options-panel`
    // holds the draw's half of it). Neither handler asks for a render: a
    // settings change is a state change, and the draw effect is what follows.
    const card = renderingParametersCard();

    for (const handler of ["handleReverseChange", "handleShiftChange"]) {
      const body = functionBody(PAGE, handler);
      for (const render of [
        "drawCanvas",
        "renderFractal",
        "renderPreview",
        "setIsRendering",
        "notifyRenderStart",
      ]) {
        expect(body, `${handler} calls ${render}`).not.toContain(render);
      }
    }

    expect(card).toContain("handleReverseChange");
    expect(card).toContain("handleShiftChange");
    // A step of the drag is the percent the control reports, as the fraction of
    // a turn the view holds.
    expect(functionBody(PAGE, "handleShiftChange")).toContain(
      "handleParameterChange(() => setShift(next));",
    );
    expect(functionBody(PAGE, "handleShiftChange")).toContain(
      "const next = percentToShift(percent);",
    );
  });

  it("clears the selected preset, which the view has moved off", () => {
    for (const handler of [
      "handleReverseChange",
      "handleShiftChange",
      "handleResetColours",
    ]) {
      expect(functionBody(PAGE, handler), handler).toContain(
        "handleParameterChange(",
      );
    }
  });
});

describe("one history entry per gesture", () => {
  it("marks the entry on the first step of the drag, and on no other step", () => {
    // The mark is made on the change rather than on the pointer going down:
    // a jump is taken by the render that first sees the count go up, and only
    // takes one if the view has moved by then, so a jump marked at pointer-down
    // would be spent on the view already on screen and the drag would leave no
    // entry at all. `shiftEntryMarkedRef` is what makes it once per gesture.
    const step = functionBody(PAGE, "handleShiftChange");

    expect(step).toContain("if (!shiftEntryMarkedRef.current) {");
    expect(step).toContain("shiftEntryMarkedRef.current = true;");
    expect(step).toContain("beginJump();");
    // And the jump comes before the setter that moves off the view it names.
    expect(step.indexOf("beginJump();")).toBeLessThan(
      step.indexOf("handleParameterChange("),
    );
  });

  it("puts the mark back when a gesture begins", () => {
    const shift = elementAround(
      renderingParametersCard(),
      'label="Shift"',
      "<Slider",
    );

    expect(shift).toContain("onGestureStart={handleShiftGestureStart}");
    expect(functionBody(PAGE, "handleShiftGestureStart")).toContain(
      "beginShiftGesture();",
    );
    expect(functionBody(PAGE, "beginShiftGesture")).toContain(
      "shiftEntryMarkedRef.current = false;",
    );
  });

  it("puts it back on the first key press that moves the slider, and not on the repeats or on a key that does not", () => {
    const shift = elementAround(
      renderingParametersCard(),
      'label="Shift"',
      "<Slider",
    );
    const body = functionBody(PAGE, "handleShiftKeyDown");

    expect(shift).toContain("onKeyDown={handleShiftKeyDown}");
    // A held key repeats its `keydown`; the repeats are the one gesture's steps.
    expect(body).toContain("if (event.repeat) return;");
    // Tab walking through the drawer is not a change of the value.
    expect(body).toContain("shiftSliderKeyChangesValue(event.key)");
    expect(body).toContain("beginShiftGesture();");
  });

  it("gives the checkbox and the Reset button one entry each", () => {
    for (const handler of ["handleReverseChange", "handleResetColours"]) {
      const body = functionBody(PAGE, handler);
      const jump = body.indexOf("beginJump()");

      expect(jump, handler).toBeGreaterThan(-1);
      // The entry names the view being left, so it is marked before the setters
      // that move off it — the render this handler still sees is the old one.
      expect(jump, handler).toBeLessThan(
        body.indexOf("handleParameterChange("),
      );
    }
  });
});

describe("a hop that lands on a place", () => {
  it("keeps the visitor's palette by default and puts it back when the hop was nobody's aim", () => {
    const select = functionBody(PAGE, "handlePlaceSelect");

    expect(select).toContain("resetColour = false");
    expect(select).toContain(
      "? { reverse: DEFAULT_REVERSE, shift: DEFAULT_SHIFT, trap: DEFAULT_TRAP }",
    );
    // The settings are applied either way, so the tile's picture and the
    // picture a click shows are the one picture.
    expect(select).toContain("setReverse(options.reverse);");
    expect(select).toContain("setShift(options.shift);");
  });

  it("aims the crossfade at the picture the setters will leave, settings and all", () => {
    // Without them the flight would wait for a picture that never comes, and
    // "this place is already the view" would never be true once the palette
    // had been moved.
    const select = functionBody(PAGE, "handlePlaceSelect");

    expect(select).toContain("reverse: options.reverse,");
    expect(select).toContain("shift: options.shift,");
  });

  it("is reset by Surprise me and by a tour hop, and by nothing the visitor aimed at a tile", () => {
    expect(functionBody(PAGE, "handleSurprise")).toContain(
      "handlePlaceSelect(target, { resetColour: true })",
    );

    const hop = PAGE.slice(
      PAGE.indexOf("tourMode.setHopHandler"),
      PAGE.indexOf("Whether a full render has drawn"),
    );
    expect(hop).toContain(
      "handlePlaceSelect(place, { tour: true, resetColour: true })",
    );

    // A tile, a fractal button and an Auto-wander hop keep the palette: none
    // of them passes `resetColour`.
    expect(PAGE).toContain("onSelect={handlePlaceSelect}");
    expect(functionBody(PAGE, "handleSwitchFractal")).not.toContain(
      "resetColour",
    );
    expect(PAGE).toContain("handlePlaceSelect(place, { replace: true })");
  });
});

describe("a saved view", () => {
  it("is handed the page's palette when it is saved", () => {
    const manager = element(PAGE, "<CustomPresetManager");

    expect(manager).toContain("currentReverse={reverse}");
    expect(manager).toContain("currentShift={shift}");
    expect(MANAGER).toContain("currentReverse: boolean;");
    expect(MANAGER).toContain("currentShift: number;");
    expect(MANAGER).toContain(
      "...presetColorFields(currentReverse, currentShift, currentTrap),",
    );
  });

  it("brings it back with the scheme it was saved in", () => {
    const body = functionBody(PAGE, "handlePresetSelect");

    expect(body).toContain("const colors = presetColorOptions(preset);");
    expect(body).toContain("setReverse(colors.reverse);");
    expect(body).toContain("setShift(colors.shift);");
  });
});
