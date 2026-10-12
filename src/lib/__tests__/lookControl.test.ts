/**
 * The Look control's pure parts: its words, its menu keys, and the width it
 * reserves beside the Auto-wander pill.
 */
import { describe, expect, it } from "vitest";

import {
  LOOK_CONTROL_NAME,
  LOOK_PILL_MAX_WIDTH,
  lookChoiceLabel,
  lookMenuTarget,
} from "../lookControl";
import {
  TRAP_CONTROL_OPTIONS,
  controlToTrap,
  trapToControl,
} from "../paletteControls";
import {
  NEARBY_STRIP_MAX_WIDTH,
  PICTURE_EDGE_GAP,
  WANDER_PILL_GAP,
  WANDER_PILL_MAX_WIDTH,
  wanderPlacement,
} from "../wanderControl";
import { TRAP_SHAPES } from "../orbitTrap";

describe("the Look words", () => {
  it("offers Normal and the three orbit traps, Normal being the trap off", () => {
    expect(TRAP_CONTROL_OPTIONS.map((choice) => choice.label)).toEqual([
      "Normal",
      "Orbit Trap: Point",
      "Orbit Trap: Line",
      "Orbit Trap: Circle",
    ]);
    expect(controlToTrap(TRAP_CONTROL_OPTIONS[0].value)).toBeNull();
  });

  it("names the chosen look alone: the button's words are the choice, not the control", () => {
    expect(LOOK_CONTROL_NAME).toBe("Look");
    expect(lookChoiceLabel(trapToControl(null))).toBe("Normal");
    expect(lookChoiceLabel(trapToControl(null))).not.toContain("Look");

    for (const shape of TRAP_SHAPES) {
      expect(lookChoiceLabel(trapToControl(shape))).toMatch(/^Orbit Trap: /);
    }
  });

  it("says Normal for a value it does not offer", () => {
    for (const value of ["", "Point", "spiral", "__proto__"]) {
      expect(lookChoiceLabel(value), value).toBe("Normal");
    }
  });

  it("follows the state: a trap changed from outside changes the words", () => {
    const words = [null, ...TRAP_SHAPES].map((trap) =>
      lookChoiceLabel(trapToControl(trap)),
    );

    expect(new Set(words).size).toBe(4);
    expect(words[1]).toBe("Orbit Trap: Point");
    expect(words[2]).toBe("Orbit Trap: Line");
    expect(words[3]).toBe("Orbit Trap: Circle");
  });

  it("never outgrows the width the placement reserves for it", () => {
    // 12 px sans-serif text averages about 6.2 px a character; 6.5 is a
    // margin, and the button has 20 px of padding.
    const widest = Math.max(
      ...TRAP_CONTROL_OPTIONS.map((choice) => choice.label.length),
    );

    expect(widest).toBe("Orbit Trap: Circle".length);
    expect(widest * 6.5 + 20).toBeLessThanOrEqual(LOOK_PILL_MAX_WIDTH);
  });
});

describe("lookMenuTarget", () => {
  it("steps down and up and wraps at both ends", () => {
    expect(lookMenuTarget(0, "ArrowDown", 4)).toBe(1);
    expect(lookMenuTarget(3, "ArrowDown", 4)).toBe(0);
    expect(lookMenuTarget(2, "ArrowUp", 4)).toBe(1);
    expect(lookMenuTarget(0, "ArrowUp", 4)).toBe(3);
  });

  it("jumps to the ends with Home and End", () => {
    expect(lookMenuTarget(2, "Home", 4)).toBe(0);
    expect(lookMenuTarget(1, "End", 4)).toBe(3);
  });

  it("starts from the top or the bottom when nothing in the menu has focus", () => {
    expect(lookMenuTarget(-1, "ArrowDown", 4)).toBe(0);
    expect(lookMenuTarget(-1, "ArrowUp", 4)).toBe(3);
  });

  it("leaves every other key alone, and an empty menu", () => {
    for (const key of ["a", "Enter", " ", "Tab", "ArrowLeft", "Escape"]) {
      expect(lookMenuTarget(1, key, 4), key).toBeNull();
    }

    expect(lookMenuTarget(0, "ArrowDown", 0)).toBeNull();
  });
});

describe("placing the Look control beside the Auto-wander pill", () => {
  const place = (width: number) => wanderPlacement(width, LOOK_PILL_MAX_WIDTH);

  it("stacks one over the other on the narrowest phones", () => {
    expect(place(320)).toBe("stacked");
    expect(place(351)).toBe("stacked");
  });

  it("puts them in a row over the strip on a wider phone and a tablet", () => {
    expect(place(352)).toBe("above");
    expect(place(375)).toBe("above");
    expect(place(768)).toBe("above");
  });

  it("puts them in the corner, level with the tiles, once the strip's longest row fits too", () => {
    const corner =
      NEARBY_STRIP_MAX_WIDTH +
      WANDER_PILL_GAP +
      LOOK_PILL_MAX_WIDTH +
      WANDER_PILL_GAP +
      WANDER_PILL_MAX_WIDTH;

    expect(place(corner)).toBe("beside");
    expect(place(corner - 1)).toBe("above");
    expect(place(1400)).toBe("beside");
    expect(place(NEARBY_STRIP_MAX_WIDTH)).toBe("above");
  });

  it("keeps the row over the strip on the 1003 px canvas of a 1280 px window, where the pair and the strip do not fit abreast", () => {
    expect(place(1003)).toBe("above");
  });

  it("changes with the companion and not without one", () => {
    expect(wanderPlacement(375)).toBe("above");
    expect(wanderPlacement(320)).toBe("above");
    expect(wanderPlacement(320, 0)).toBe("above");
    expect(wanderPlacement(Number.NaN, LOOK_PILL_MAX_WIDTH)).toBe("stacked");
    expect(wanderPlacement(0, LOOK_PILL_MAX_WIDTH)).toBe("stacked");
  });

  it("never overlaps each other, the strip or the edges at any width from 320 up", () => {
    for (let width = 320; width <= 1600; width++) {
      const placement = place(width);

      if (placement === "beside") {
        // One row level with the tiles: strip, gap, button, gap, pill.
        expect(
          NEARBY_STRIP_MAX_WIDTH +
            WANDER_PILL_GAP +
            LOOK_PILL_MAX_WIDTH +
            WANDER_PILL_GAP +
            WANDER_PILL_MAX_WIDTH,
          `beside at ${width}`,
        ).toBeLessThanOrEqual(width);
      } else if (placement === "above") {
        // One row over the strip: the pair and the picture's edge gaps.
        expect(
          2 * PICTURE_EDGE_GAP +
            LOOK_PILL_MAX_WIDTH +
            WANDER_PILL_GAP +
            WANDER_PILL_MAX_WIDTH,
          `above at ${width}`,
        ).toBeLessThanOrEqual(width);
      } else {
        // One over the other: each fits alone.
        expect(
          2 * PICTURE_EDGE_GAP +
            Math.max(LOOK_PILL_MAX_WIDTH, WANDER_PILL_MAX_WIDTH),
          `stacked at ${width}`,
        ).toBeLessThanOrEqual(width);
      }
    }
  });

  it("moves to a wider arrangement only as the picture widens", () => {
    const order = { stacked: 0, above: 1, beside: 2 } as const;
    let previous = 0;

    for (let width = 320; width <= 1600; width++) {
      const rank = order[place(width)];

      expect(rank, `at ${width}`).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });
});
