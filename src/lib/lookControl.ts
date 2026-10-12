/**
 * The Look control on the picture: what its button says and how its menu is
 * walked by keyboard.
 *
 * Look is the visitor-facing name of the orbit-trap colouring. Normal is the
 * trap off (colour by escape count) and Glass: Point, Line and Circle are the
 * three traps. The control is another view of the page's one `trap` state, the
 * Settings select being the first, so nothing here holds a value: the choices
 * and their words are `TRAP_CONTROL_OPTIONS`, and the button reads whatever the
 * page hands it. `LookControl.tsx` draws it, `wanderControl.ts` places it beside
 * the Auto-wander pill, and everything here is pure so the Node suite drives it.
 */
import { TRAP_CONTROL_OPTIONS } from "./paletteControls";

/** The control's accessible name, whichever look is showing. */
export const LOOK_CONTROL_NAME = "Look";

/**
 * The widest the button gets ("Look: Glass: Circle" in 12 px text with 10 px of
 * padding either side, with room to spare). `wanderPlacement` reserves this
 * much beside the Auto-wander pill, so the two never overlap.
 */
export const LOOK_PILL_MAX_WIDTH = 152;

/** The words of a choice: its option's label, Normal for a value not offered. */
export function lookChoiceLabel(value: string): string {
  const option =
    TRAP_CONTROL_OPTIONS.find((choice) => choice.value === value) ??
    TRAP_CONTROL_OPTIONS[0];

  return option.label;
}

/** The button's visible words: the control's name and the current choice. */
export function lookButtonText(value: string): string {
  return `${LOOK_CONTROL_NAME}: ${lookChoiceLabel(value)}`;
}

/**
 * Where focus goes in the open menu for a key, or null when the key is not
 * one the menu walks with. Up and Down wrap round the list; Home and End go to
 * its ends. Enter and Space press the focused item, which is a button, so they
 * need nothing here.
 */
export function lookMenuTarget(
  index: number,
  key: string,
  count: number,
): number | null {
  if (!(count > 0)) return null;

  switch (key) {
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowUp":
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
