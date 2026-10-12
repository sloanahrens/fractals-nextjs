import { describe, expect, it } from "vitest";

import { TRAP_SHAPES } from "../orbitTrap";
import {
  DEFAULT_REVERSE,
  DEFAULT_SHIFT,
  DEFAULT_TRAP,
  SHIFT_PERCENT_MAX,
  SHIFT_PERCENT_MIN,
  TRAP_CONTROL_OPTIONS,
  TRAP_OFF_VALUE,
  controlToTrap,
  formatShiftPercent,
  isDefaultColorOptions,
  normalizeShift,
  percentToShift,
  shiftSliderKeyChangesValue,
  shiftToPercent,
  trapToControl,
} from "../paletteControls";

describe("the shift the mapping reads", () => {
  it("leaves a fraction of a turn alone", () => {
    expect(normalizeShift(0)).toBe(0);
    expect(normalizeShift(0.35)).toBeCloseTo(0.35, 10);
    expect(normalizeShift(0.005)).toBeCloseTo(0.005, 10);
  });

  it("reads a shift as a distance round a loop, so a whole turn is none", () => {
    expect(normalizeShift(1)).toBe(0);
    expect(normalizeShift(2)).toBe(0);
    expect(normalizeShift(1.25)).toBeCloseTo(0.25, 10);
    expect(normalizeShift(-0.25)).toBeCloseTo(0.75, 10);
    expect(normalizeShift(-1)).toBe(0);
  });

  it("reads a value that is not a number as no shift at all", () => {
    // A NaN would reach the palette as a NaN and paint a picture of no colours;
    // there is nothing else such a value could sensibly mean.
    for (const value of [undefined, null, "0.35", {}, [], NaN, Infinity]) {
      expect(normalizeShift(value), String(value)).toBe(DEFAULT_SHIFT);
    }
  });
});

describe("a shift as the slider shows it", () => {
  it("is whole percent, 0 to 100", () => {
    expect(shiftToPercent(0)).toBe(0);
    expect(shiftToPercent(0.35)).toBe(35);
    expect(shiftToPercent(1)).toBe(SHIFT_PERCENT_MAX);
    expect(shiftToPercent(0.12)).toBe(12);
  });

  it("lands a shift between two steps on the nearer one", () => {
    expect(shiftToPercent(0.004)).toBe(0);
    expect(shiftToPercent(0.006)).toBe(1);
    expect(shiftToPercent(0.1234)).toBe(12);
    expect(shiftToPercent(0.999)).toBe(SHIFT_PERCENT_MAX);
  });

  it("holds a whole turn at the slider's far end rather than reading it back to nought", () => {
    // The mapping reads a whole turn as no shift, and the two do draw the same
    // picture — but the far end of the travel is where the thumb is, and a
    // drag that landed there has to stay there.
    expect(shiftToPercent(1)).toBe(SHIFT_PERCENT_MAX);
    expect(shiftToPercent(2)).toBe(SHIFT_PERCENT_MAX);
    expect(shiftToPercent(-0.25)).toBe(SHIFT_PERCENT_MIN);
    expect(shiftToPercent(NaN)).toBe(SHIFT_PERCENT_MIN);
  });
});

describe("a slider position as the view holds it", () => {
  it("is the fraction of a turn the percent is worth", () => {
    expect(percentToShift(0)).toBe(0);
    expect(percentToShift(35)).toBeCloseTo(0.35, 10);
    expect(percentToShift(100)).toBeCloseTo(1, 10);
  });

  it("holds a position outside the travel to the nearer end", () => {
    expect(percentToShift(-5)).toBe(0);
    expect(percentToShift(105)).toBeCloseTo(1, 10);
    expect(percentToShift(NaN)).toBe(DEFAULT_SHIFT);
  });

  it("rounds a position to the step the control can hold", () => {
    expect(percentToShift(34.6)).toBeCloseTo(0.35, 10);
  });

  it("comes back to itself round the control for every step", () => {
    for (
      let percent = SHIFT_PERCENT_MIN;
      percent <= SHIFT_PERCENT_MAX;
      percent++
    ) {
      expect(shiftToPercent(percentToShift(percent))).toBe(percent);
    }
  });
});

describe("the readout", () => {
  it("is the percent with its sign", () => {
    expect(formatShiftPercent(0)).toBe("0%");
    expect(formatShiftPercent(35)).toBe("35%");
    expect(formatShiftPercent(100)).toBe("100%");
  });
});

describe("is the palette as the scheme has it?", () => {
  it("is true for the two defaults", () => {
    expect(isDefaultColorOptions(DEFAULT_REVERSE, DEFAULT_SHIFT)).toBe(true);
  });

  it("is false when either setting says something", () => {
    expect(isDefaultColorOptions(true, 0)).toBe(false);
    expect(isDefaultColorOptions(false, 0.35)).toBe(false);
    expect(isDefaultColorOptions(true, 0.35)).toBe(false);
  });

  it("is false for a slider dragged to either end, since Reset is the way back to rest", () => {
    // A whole turn draws the same colours as none, but it is still a setting
    // the visitor made and a thumb away from where the control rests.
    expect(isDefaultColorOptions(false, 1)).toBe(false);
    expect(isDefaultColorOptions(false, -0.0)).toBe(true);
  });

  it("is false for a shift it cannot read, so the button can put one right", () => {
    expect(isDefaultColorOptions(false, NaN)).toBe(false);
  });

  it("is false while an orbit trap is on, since Reset colours turns it off", () => {
    for (const trap of TRAP_SHAPES) {
      expect(isDefaultColorOptions(false, 0, trap)).toBe(false);
    }

    expect(isDefaultColorOptions(false, 0, null)).toBe(true);
    expect(isDefaultColorOptions(false, 0)).toBe(true);
    expect(DEFAULT_TRAP).toBeNull();
  });
});

describe("the Look select", () => {
  it("lists Normal first and then the three orbit traps, with the link key's own values", () => {
    expect(TRAP_CONTROL_OPTIONS).toEqual([
      { value: "off", label: "Normal" },
      { value: "point", label: "Orbit Trap: Point" },
      { value: "line", label: "Orbit Trap: Line" },
      { value: "circle", label: "Orbit Trap: Circle" },
    ]);
  });

  it("reads off as no trap and each shape as itself", () => {
    expect(controlToTrap(TRAP_OFF_VALUE)).toBeNull();
    for (const shape of TRAP_SHAPES) expect(controlToTrap(shape)).toBe(shape);
  });

  it("reads anything else as off, so a value from outside never reaches the renderer", () => {
    for (const value of ["", "Point", "spiral", "constructor", "__proto__"]) {
      expect(controlToTrap(value), value).toBeNull();
    }
  });

  it("shows the value the page holds", () => {
    expect(trapToControl(null)).toBe("off");
    for (const shape of TRAP_SHAPES) {
      expect(trapToControl(shape)).toBe(shape);
      expect(controlToTrap(trapToControl(shape))).toBe(shape);
    }
  });
});

describe("the keys that move a focused Shift slider", () => {
  it("are the arrow keys, the page keys and the ends", () => {
    for (const key of [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ]) {
      expect(shiftSliderKeyChangesValue(key), key).toBe(true);
    }
  });

  it("are not the keys that only move through the drawer", () => {
    for (const key of ["Tab", "Escape", "Enter", "a", "?"]) {
      expect(shiftSliderKeyChangesValue(key), key).toBe(false);
    }
  });
});
