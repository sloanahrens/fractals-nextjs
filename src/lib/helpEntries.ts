/**
 * What the help overlay says, and the one rule about its shortcut.
 *
 * The text is data rather than markup so it can be checked without a browser:
 * `src/lib/__tests__/helpEntries.test.ts` holds the shape of it, and
 * `src/__tests__/help-overlay-panel.test.ts` checks the key names it gives for
 * the canvas against the keys `src/lib/canvasNavigation.ts` really handles.
 * A section here that names a key the canvas does not read is stale help.
 */

/** The dialog's heading, which the dialog element points `aria-labelledby` at. */
export const HELP_DIALOG_TITLE = "How to use the explorer";

/** One way to drive the explorer: the control, and what it does. */
export interface HelpEntry {
  /** The key, button or control the user reaches for, as it is written on it. */
  keys: string;
  /** What that control does. */
  action: string;
}

/** A group of entries under one heading in the dialog. */
export interface HelpSection {
  title: string;
  entries: HelpEntry[];
}

/**
 * Every gesture, key and control the explorer answers to, grouped as the
 * dialog lists them.
 *
 * Only what the app really does belongs here — a row for a control that does
 * not exist is worse than a missing row, because a user trusts it.
 */
export const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Mouse and touch",
    entries: [
      {
        keys: "Wheel",
        action: "Zoom in and out at the pointer",
      },
      {
        keys: "Drag",
        action: "Pan the view",
      },
      {
        keys: "One-finger drag",
        action: "Pan the view on a touch screen",
      },
    ],
  },
  {
    title: "Keyboard",
    entries: [
      {
        keys: "Tab",
        action: "Focus the image, so the keys below reach it",
      },
      {
        keys: "ArrowLeft / ArrowRight / ArrowUp / ArrowDown",
        action: "Pan the view a tenth of its own width or height",
      },
      {
        keys: "+ / -",
        action: "Zoom in and out about the centre",
      },
    ],
  },
  {
    title: "Random walk",
    entries: [
      {
        keys: "Random walk",
        action:
          "Tick it in the Navigation card of the Settings drawer and the view moves to a nearby interesting view every few seconds, staying on the fractal you chose",
      },
      {
        keys: "Seconds between steps",
        action:
          "How long the walk waits between steps, from 1 to 120, 5 by default",
      },
    ],
  },
  {
    title: "Views and links",
    entries: [
      {
        keys: "Presets",
        action:
          "Load a built-in view for the fractal on the canvas, or save and load your own",
      },
      {
        keys: "Copy link",
        action:
          "Put the view on screen in the address bar and on the clipboard, to share or bookmark",
      },
      {
        keys: "Download PNG",
        action: "Save the canvas at its full resolution",
      },
      {
        keys: "Help / ?",
        action: "Open this help, from the button or the ? key",
      },
    ],
  },
];

/** The elements whose own keystrokes belong to them rather than to the page. */
const TEXT_ENTRY_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/** The parts of a `keydown` the `?` shortcut is decided by. */
export interface HelpShortcutEvent {
  /** `KeyboardEvent.key` of the press. */
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Tag name of the focused element, upper case, as the DOM reports it. */
  targetTagName: string;
  /** Whether the focused element is an editable region of its own. */
  targetIsContentEditable: boolean;
}

/**
 * Whether a keypress should open the help overlay
 *
 * `?` on most layouts is Shift and `/`, so Shift is how the character is
 * typed and is not a modifier that disqualifies the shortcut; Control, Meta
 * and Alt mean a different command and leave the `?` to it. A press inside a
 * field is the field's — a `?` typed into a coordinate box has to reach the
 * box, and the arrow keys the canvas reads are the same story.
 *
 * @param event - The parts of the keydown this decision needs
 * @returns True when the help overlay should open
 */
export function opensHelpShortcut(event: HelpShortcutEvent): boolean {
  if (event.key !== "?") return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.targetIsContentEditable) return false;

  return !TEXT_ENTRY_TAGS.has(event.targetTagName);
}
