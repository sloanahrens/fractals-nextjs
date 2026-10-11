import { describe, expect, it } from "vitest";

import {
  PAGE_VIEW_KEYS,
  pageKeyAction,
  type PageKeyEvent,
} from "../pageKeys";
import { keyNavigationBounds } from "../canvasNavigation";
import { calculateZoomBounds } from "../mandelbrot";

/** A press on the body, with nothing else about it that matters. */
function press(overrides: Partial<PageKeyEvent> = {}): PageKeyEvent {
  return {
    key: "ArrowLeft",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    targetTagName: "BODY",
    targetIsContentEditable: false,
    targetInDialog: false,
    targetInMathCard: false,
    tourPlaying: false,
    ...overrides,
  };
}

describe("pageKeyAction", () => {
  it("takes the pan and zoom keys", () => {
    for (const key of PAGE_VIEW_KEYS) {
      expect(pageKeyAction(press({ key })), key).toBe("view");
    }
  });

  it("takes R in either case", () => {
    expect(pageKeyAction(press({ key: "r" }))).toBe("reset");
    expect(pageKeyAction(press({ key: "R" }))).toBe("reset");
  });

  it("leaves every other key to the page it is on", () => {
    for (const key of [
      "a",
      "0",
      "Enter",
      "Escape",
      "Tab",
      " ",
      "?",
      "h",
      "Home",
      "PageUp",
      "F5",
    ]) {
      expect(pageKeyAction(press({ key })), key).toBeNull();
    }
  });

  it("leaves Control, Meta and Alt alone", () => {
    expect(pageKeyAction(press({ key: "ArrowLeft", ctrlKey: true }))).toBeNull();
    expect(pageKeyAction(press({ key: "ArrowLeft", metaKey: true }))).toBeNull();
    expect(pageKeyAction(press({ key: "ArrowLeft", altKey: true }))).toBeNull();
    expect(pageKeyAction(press({ key: "r", ctrlKey: true }))).toBeNull();
    expect(pageKeyAction(press({ key: "r", metaKey: true }))).toBeNull();
    expect(pageKeyAction(press({ key: "r", altKey: true }))).toBeNull();
  });

  it("leaves Shift alone, since it is how +, _ and R are typed", () => {
    // Shift is not in the descriptor at all: the keys it produces arrive as
    // `+`, `_` and `R`, and each of those is actioned.
    expect(pageKeyAction(press({ key: "+" }))).toBe("view");
    expect(pageKeyAction(press({ key: "_" }))).toBe("view");
    expect(pageKeyAction(press({ key: "R" }))).toBe("reset");
  });

  it("leaves a field its own keys", () => {
    for (const targetTagName of ["INPUT", "SELECT", "TEXTAREA"]) {
      expect(pageKeyAction(press({ targetTagName }))).toBeNull();
      expect(pageKeyAction(press({ targetTagName, key: "R" }))).toBeNull();
    }
  });

  it("leaves a slider its own keys, since a slider is an input", () => {
    expect(pageKeyAction(press({ key: "ArrowUp", targetTagName: "INPUT" })))
      .toBeNull();
  });

  it("leaves a button and a link their own keys", () => {
    for (const targetTagName of ["BUTTON", "A"]) {
      expect(pageKeyAction(press({ targetTagName }))).toBeNull();
      expect(pageKeyAction(press({ targetTagName, key: "r" }))).toBeNull();
    }
  });

  it("leaves an editable region its own keys", () => {
    expect(pageKeyAction(press({ targetIsContentEditable: true }))).toBeNull();
    expect(
      pageKeyAction(press({ targetIsContentEditable: true, key: "R" })),
    ).toBeNull();
  });

  it("leaves an open dialog its keys — the drawer and the help", () => {
    expect(pageKeyAction(press({ targetInDialog: true }))).toBeNull();
    expect(pageKeyAction(press({ targetInDialog: true, key: "r" }))).toBeNull();
  });

  it("leaves the Math card its keys", () => {
    expect(pageKeyAction(press({ targetInMathCard: true }))).toBeNull();
    expect(pageKeyAction(press({ targetInMathCard: true, key: "R" }))).toBeNull();
  });

  it("leaves the view alone while a tour plays", () => {
    // The key is the tour's: it stops the tour, and the picture stays on the
    // place the tour had reached.
    for (const key of [...PAGE_VIEW_KEYS, "r", "R"]) {
      expect(pageKeyAction(press({ tourPlaying: true, key })), key).toBeNull();
    }
  });

  it("takes a press with nothing in particular focused", () => {
    // The body, and the canvas the picture is drawn on: the two places a
    // visitor who has not tabbed anywhere is.
    expect(pageKeyAction(press({ targetTagName: "BODY" }))).toBe("view");
    expect(pageKeyAction(press({ targetTagName: "CANVAS" }))).toBe("view");
    expect(pageKeyAction(press({ targetTagName: "" }))).toBe("view");
  });
});

describe("the keys the page takes", () => {
  const bounds = calculateZoomBounds(-0.75, 0, 1);

  it("are exactly the keys the canvas moves the view with", () => {
    for (const key of PAGE_VIEW_KEYS) {
      expect(keyNavigationBounds(key, bounds), key).not.toBeNull();
    }
  });

  it("leave every other key to the canvas switch, which refuses it", () => {
    // The two lists cannot drift: a key the page offers and the switch does
    // not read would be a press that does nothing, and the other way round a
    // key the switch reads and the page never offers.
    for (const key of ["q", "0", "Enter", " "]) {
      expect(PAGE_VIEW_KEYS, key).not.toContain(key);
      expect(keyNavigationBounds(key, bounds), key).toBeNull();
    }
  });
});
