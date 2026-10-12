/**
 * The Settings drawer's colour controls: the palette's two settings as the
 * controls read and write them.
 *
 * `colorMapping.ts` is what the two settings *mean* — a count's place on the
 * palette, reversed and then shifted. This module is the small arithmetic
 * between that and the controls: the Shift slider runs 0 to 100 whole percent
 * while the view holds a fraction of a turn, and the Reverse checkbox and the
 * Reset colours button need one answer to "is the palette as the scheme has
 * it?". Kept out of the page so both can be driven in Node, where the page's
 * source is the only thing a suite can read.
 *
 * A shift is a distance round a loop, so it is read modulo a whole turn, which
 * is what the mapping does with it and what the link codec writes and reads
 * (`viewLink.ts`). A whole turn is therefore no shift at all, and
 * {@link normalizeShift} is the one place the mapping's reading of it is
 * decided. The two controls ask two other questions of the same number — where
 * the thumb sits ({@link shiftToPercent}, which holds the far end rather than
 * wrapping it) and whether there is anything to put back
 * ({@link isDefaultColorOptions}, judged exactly) — and both say why.
 *
 * The Trap select sits beside them (`TRAP_CONTROL_OPTIONS`, `trapToControl`,
 * `controlToTrap`): an orbit trap is a way of colouring the picture, off by
 * default, and Reset colours turns it off with the other two.
 */

import type { TrapShape } from "../types/fractal";
import { TRAP_SHAPES } from "./orbitTrap";

/**
 * Whether the palette starts walked backwards: it does not, and neither does
 * the view a fresh visit opens on.
 */
export const DEFAULT_REVERSE = false;

/**
 * How far round the palette the walk starts: not at all, the scheme's own
 * beginning. The same value the view a fresh visit opens on holds.
 */
export const DEFAULT_SHIFT = 0;

/**
 * Whether an orbit trap colours the picture: none does, and neither does the
 * view a fresh visit opens on. The picture is coloured by its iteration count.
 */
export const DEFAULT_TRAP: TrapShape | null = null;

/** The Trap select's value for no trap. */
export const TRAP_OFF_VALUE = "off";

/** The Shift slider's left end, as the percent the control shows. */
export const SHIFT_PERCENT_MIN = 0;

/** The Shift slider's right end: a whole turn, which is the same as none. */
export const SHIFT_PERCENT_MAX = 100;

/**
 * A shift as the mapping reads it: a fraction of a turn.
 *
 * A shift is a distance round a loop, so any number is a shift and only where
 * it lands matters: a whole turn is none, a negative fraction is the same
 * distance the other way round. A value that is not a number at all is no
 * shift — a `NaN` would reach the palette as `NaN` and paint a picture of no
 * colours, and there is nothing else such a value could sensibly mean.
 *
 * @param value - A shift from anywhere: a control, a link, storage
 * @returns The fraction of a turn it is worth, in 0 up to (not including) 1
 */
export function normalizeShift(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    return DEFAULT_SHIFT;

  return value - Math.floor(value);
}

/**
 * A shift as the slider shows it: whole percent, 0 to 100.
 *
 * The slider's step is 1, so a shift that is not a whole percent — one a link
 * carried, which is good to two decimals — has to land on the nearest step the
 * control can hold. Dragging from there writes an exact hundredth, so the
 * rounding is the reading of the control and not a loss in the view.
 *
 * Held to the travel rather than read modulo a turn, which is the one place
 * this differs from {@link normalizeShift}: the slider's far end is a whole
 * turn, and it has to stay at its far end. Read modulo, a drag to the right
 * would snap the thumb back to nought — drawing the same picture, which is why
 * the mapping reads a whole turn as no shift, but leaving the control
 * somewhere the pointer is not.
 *
 * @param shift - Fraction of a turn, as the view holds it
 * @returns The percent the slider sits on
 */
export function shiftToPercent(shift: number): number {
  if (!Number.isFinite(shift)) return SHIFT_PERCENT_MIN;

  const held = Math.min(1, Math.max(0, shift));

  return Math.round(held * SHIFT_PERCENT_MAX);
}

/**
 * A slider position as the view holds it: a fraction of a turn.
 *
 * A position outside the travel is held to the nearer end rather than refused,
 * so a value from outside can never put a shift the mapping cannot use into the
 * view.
 *
 * @param percent - Where the slider is, as the control reports it
 * @returns The fraction of a turn to set
 */
export function percentToShift(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_SHIFT;

  const whole = Math.min(
    SHIFT_PERCENT_MAX,
    Math.max(SHIFT_PERCENT_MIN, Math.round(percent)),
  );

  return whole / SHIFT_PERCENT_MAX;
}

/** The Shift slider's readout: the percent with a percent sign, "35%". */
export function formatShiftPercent(percent: number): string {
  return `${percent}%`;
}

/**
 * Whether the palette is the way the scheme has it, so there is nothing for
 * Reset colours to put back.
 *
 * Judged exactly and not modulo a turn, because the question is about the
 * controls rather than about the picture: a slider dragged to its far end draws
 * the same colours as one at nought — the mapping reads a whole turn as no
 * shift — but it is a setting the visitor made, and Reset colours is the way
 * back to where the control rests. A shift that is not a number at all is not
 * the default either, so the button can always put one right.
 *
 * @param reverse - Whether the palette is walked backwards
 * @param shift - Fraction of a turn the walk starts at
 * @param trap - The orbit trap colouring the picture, or null for the
 *   iteration count; Reset colours turns it off, so a trap on is something to
 *   put back
 * @returns True when all the settings are their defaults
 */
export function isDefaultColorOptions(
  reverse: boolean,
  shift: number,
  trap: TrapShape | null = DEFAULT_TRAP,
): boolean {
  return (
    reverse === DEFAULT_REVERSE &&
    shift === DEFAULT_SHIFT &&
    trap === DEFAULT_TRAP
  );
}

/**
 * The Trap control's choices, in the order the select lists them: off first,
 * so the resting state reads as a choice and not as a missing value.
 */
export const TRAP_CONTROL_OPTIONS: readonly { value: string; label: string }[] =
  [
    { value: TRAP_OFF_VALUE, label: "Off" },
    ...TRAP_SHAPES.map((shape) => ({
      value: shape,
      label: shape.charAt(0).toUpperCase() + shape.slice(1),
    })),
  ];

/** The select's value for a trap: the shape's name, or the off choice. */
export function trapToControl(trap: TrapShape | null): string {
  return trap ?? TRAP_OFF_VALUE;
}

/**
 * The trap a select value names, or null for off. Anything that is not one of
 * the three shapes is off, so a value from outside can never put a shape the
 * renderer does not know into the page.
 */
export function controlToTrap(value: string): TrapShape | null {
  return TRAP_SHAPES.find((shape) => shape === value) ?? null;
}

/**
 * The keys a range input moves its own value with.
 *
 * Held here rather than beside the handler because it is a fact about the
 * control and not about the page: a key press that changes the slider is a
 * change of the view like any other, and one that does not — Tab walking
 * through the drawer, say — is not.
 */
const SHIFT_SLIDER_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

/**
 * Whether a key press moves the Shift slider.
 *
 * @param key - `KeyboardEvent.key` of the press
 * @returns True when a focused slider would change its value
 */
export function shiftSliderKeyChangesValue(key: string): boolean {
  return SHIFT_SLIDER_KEYS.has(key);
}
