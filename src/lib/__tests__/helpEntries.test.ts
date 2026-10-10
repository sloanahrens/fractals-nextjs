/**
 * The help text is data, so its shape can be checked without a browser
 *
 * A dialog is only as good as the list behind it: an entry with no keys names
 * a control the user cannot find, a section with no entries is a heading over
 * nothing, and two entries with one key in a section describe the same control
 * twice. The shortcut's one rule is checked here too, because whether a `?`
 * opens the overlay or belongs to the box it was typed in is a decision with
 * five inputs and no reason to need a DOM.
 *
 * What the help says about the canvas is checked against
 * `src/lib/canvasNavigation.ts` in `src/__tests__/help-overlay-panel.test.ts`,
 * which reads sources the way the other page tests do.
 */
import { describe, expect, it } from "vitest";

import {
  HELP_DIALOG_TITLE,
  HELP_SECTIONS,
  opensHelpShortcut,
} from "../helpEntries";

/** A keydown that really does open the overlay, for the cases below to vary. */
const CANVAS_PRESS = {
  key: "?",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  targetTagName: "CANVAS",
  targetIsContentEditable: false,
};

describe("the help sections", () => {
  it("is a list to walk at all", () => {
    expect(HELP_SECTIONS.length).toBeGreaterThan(0);
    expect(HELP_DIALOG_TITLE).not.toBe("");
  });

  it("gives every section a title and something under it", () => {
    for (const section of HELP_SECTIONS) {
      expect(section.title.trim()).not.toBe("");
      expect(section.entries.length).toBeGreaterThan(0);
    }
  });

  it("gives every entry a control and something it does", () => {
    for (const section of HELP_SECTIONS) {
      for (const entry of section.entries) {
        expect(entry.keys.trim(), section.title).not.toBe("");
        expect(entry.action.trim(), entry.keys).not.toBe("");
      }
    }
  });

  it("names no control twice within a section", () => {
    for (const section of HELP_SECTIONS) {
      const keys = section.entries.map((entry) => entry.keys);
      expect(new Set(keys).size, section.title).toBe(keys.length);
    }
  });

  it("lists both touch gestures, and says pinch zooms", () => {
    const touch = HELP_SECTIONS.find(
      (section) => section.title === "Mouse and touch",
    )!;
    const byKeys = new Map(touch.entries.map((e) => [e.keys, e.action]));

    expect(byKeys.get("One-finger drag")).toMatch(/pan/i);
    expect(byKeys.get("Two-finger pinch")).toMatch(/zoom/i);
  });

  it("no longer says pinch is missing", () => {
    const text = JSON.stringify(HELP_SECTIONS);

    expect(text).not.toMatch(/no pinch|not supported|unsupported/i);
  });
});

describe("the ? shortcut", () => {
  it("opens the overlay from the page", () => {
    expect(opensHelpShortcut(CANVAS_PRESS)).toBe(true);
    expect(opensHelpShortcut({ ...CANVAS_PRESS, targetTagName: "BODY" })).toBe(
      true,
    );
  });

  it("leaves the ? to the field it was typed into", () => {
    // A `?` in a coordinate box is a character, not a command, and so is one
    // in a select, a textarea or an editable region.
    for (const targetTagName of ["INPUT", "SELECT", "TEXTAREA"]) {
      expect(opensHelpShortcut({ ...CANVAS_PRESS, targetTagName })).toBe(false);
    }
    expect(
      opensHelpShortcut({ ...CANVAS_PRESS, targetIsContentEditable: true }),
    ).toBe(false);
  });

  it("leaves a modified key to the command it belongs to", () => {
    // Shift is how `?` is typed, so it is not among these three.
    expect(opensHelpShortcut({ ...CANVAS_PRESS, ctrlKey: true })).toBe(false);
    expect(opensHelpShortcut({ ...CANVAS_PRESS, metaKey: true })).toBe(false);
    expect(opensHelpShortcut({ ...CANVAS_PRESS, altKey: true })).toBe(false);
  });

  it("opens nothing but the help", () => {
    for (const key of ["Enter", "/", "Escape", "h"]) {
      expect(opensHelpShortcut({ ...CANVAS_PRESS, key })).toBe(false);
    }
  });
});
