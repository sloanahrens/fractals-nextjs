/**
 * Which keypresses belong to the page, and what each asks the view to do.
 *
 * The picture is driven from the keyboard wherever focus happens to be — on
 * the body, on the canvas — so a visitor does not have to Tab to the image
 * before the arrow keys do anything. The other half of that is the rule here:
 * a key typed into a field, a slider, a button or the Settings drawer is the
 * control's, and moving the view instead would pull the picture out from under
 * whatever the visitor is doing.
 *
 * The decision is a pure function of the parts of the event it needs, so a
 * Node suite drives every accept and every decline without a browser — the
 * same shape as `opensHelpShortcut` in `helpEntries.ts`.
 */

/**
 * The keys that pan or zoom the view, as `KeyboardEvent.key` spells them.
 *
 * `=` is `+` on most layouts without Shift and `_` is `-` with it, and the
 * canvas's own switch reads all four, so the page offers what it can draw.
 */
export const PAGE_VIEW_KEYS: readonly string[] = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "+",
  "=",
  "-",
  "_",
];

/** The key that puts the view back on the fractal's own default frame. */
const PAGE_RESET_KEYS = new Set(["r", "R"]);

/**
 * The elements whose own keystrokes belong to them and not to the page.
 *
 * A slider is an `<input type="range">` and a link an `<a>`, so both are here
 * beside the text fields: the arrow keys a range input takes are how it is
 * driven, and a page that moved the view instead would be a control that does
 * not work. A button takes Enter and Space, and while it has focus the keys
 * are its own as well.
 */
const PAGE_OWN_KEYS_TAGS = new Set([
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "BUTTON",
  "A",
]);

/** What one keypress asks the page to do with the view. */
export type PageKeyAction = "view" | "reset";

/** The parts of a `keydown` the decision is made from. */
export interface PageKeyEvent {
  /** `KeyboardEvent.key` of the press. */
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Tag name of the focused element, upper case, as the DOM reports it. */
  targetTagName: string;
  /** Whether the focused element is an editable region of its own. */
  targetIsContentEditable: boolean;
  /**
   * Whether the focused element sits inside a `<dialog>` that is open — the
   * Settings drawer or the Help overlay, both of which are shown modally and
   * answer Escape themselves.
   */
  targetInDialog: boolean;
  /** Whether the focused element sits inside the Math card. */
  targetInMathCard: boolean;
  /**
   * Whether a tour is playing. A tour is a screensaver nobody is driving:
   * any key stops it, and the picture is meant to be left on the place the
   * tour had reached, so the page does not move the view as well.
   */
  tourPlaying: boolean;
}

/**
 * Whether a keypress should move the view, and which way
 *
 * The arrows pan, `+` and its neighbours zoom and R resets — but only where
 * the press is the page's to take. Control, Meta and Alt mean a different
 * command — the browser's own, or one the visitor's system has bound — so a
 * combination is left alone; Shift is not one of those, since it is how `+`,
 * `_` and `R` are typed. A press made while a tour plays is the page's only to
 * end the tour with, and the picture is meant to stay on the place the tour
 * reached.
 *
 * @param event - The parts of the keydown this decision needs
 * @returns `"view"` for a pan or zoom key, `"reset"` for R, null for a press
 * the page leaves alone
 */
export function pageKeyAction(event: PageKeyEvent): PageKeyAction | null {
  // The tour takes the page over: a key stops it, and the picture stays on the
  // place it had reached rather than jumping a tenth of the way from it.
  if (event.tourPlaying) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.targetIsContentEditable) return null;
  if (event.targetInDialog) return null;
  if (event.targetInMathCard) return null;
  if (PAGE_OWN_KEYS_TAGS.has(event.targetTagName)) return null;

  if (PAGE_RESET_KEYS.has(event.key)) return "reset";
  if (PAGE_VIEW_KEYS.includes(event.key)) return "view";

  return null;
}
