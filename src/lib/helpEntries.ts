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
      {
        keys: "Two-finger pinch",
        action:
          "Zoom in and out about the point between your fingers on a touch screen; move both fingers together to pan as well",
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
    title: "Nearby places",
    entries: [
      {
        keys: "Fractal buttons",
        action:
          "Mandelbrot, Julia, Burning Ship, Tricorn, Multibrot and Newton, top left of the picture (the row scrolls sideways on a narrow screen), the current one lit: one click flies to that fractal's showpiece place, and Back returns to where you were. With Julia on, a row of chips picks its constant (Classic, Dendrite, Douady rabbit, Siegel disk) and goes to the whole of that set; Custom opens Settings at the Real box to type your own. With Multibrot on, a Power row picks z^3, z^4 or z^5 and goes to the whole set of that power. Newton, the three basins of z^3 - 1, has no setting: each root has its own colour family, shaded by how fast Newton's method reaches it",
      },
      {
        keys: "Nearby tile",
        action:
          "Click a picture in the strip along the bottom, or Tab to it and press Enter, to fly to that place; hover or focus a tile to read its name",
      },
      {
        keys: "More",
        action: "Show the next suggestions in the strip",
      },
      {
        keys: "Surprise me",
        action:
          "Button in the top bar that flies to one of the nearby places at random, never the one you are on; press it again for another",
      },
      {
        keys: "Back / Forward",
        action:
          "Buttons in the top bar that retrace the places you jumped to, as the browser's own do; each is disabled when there is nowhere to go",
      },
      {
        keys: "Blank picture",
        action:
          "If a zoom lands on a picture of one colour, a small note says there is nothing to see, with a Back button; it never moves the view, and goes when the view changes",
      },
    ],
  },
  {
    title: "Tour",
    entries: [
      {
        keys: "Tour",
        action:
          "Button in the top bar that starts a tour: every control hides and the picture drifts from place to place, about 8 seconds at each, fading between them. Any key, touch, click or mouse movement stops it and brings everything back on the place it was showing; Back returns to where you were before",
      },
      {
        keys: "20 seconds of quiet",
        action:
          "Leave the page alone for 20 seconds, with this window in front and the Settings drawer and this help shut, and a tour starts by itself; after you stop one, 15 seconds is enough for the next",
      },
      {
        keys: "#tour",
        action:
          "Open the page with #tour on the end of its address, or add &tour=1 to a view link, and the tour starts as soon as the picture is drawn",
      },
    ],
  },
  {
    title: "Auto-wander",
    entries: [
      {
        keys: "Auto-wander",
        action:
          "Press the Auto-wander pill at the bottom right of the picture, or tick Auto-wander in the Settings drawer, and the view moves every few seconds: three small steps nearby, then a hop to a place from the catalogue, which may be on another fractal, and a step that lands on an empty picture hops at once. While it is on the pill says Wandering and counts the seconds to the next step; press it again to stop",
      },
      {
        keys: "Seconds between steps",
        action:
          "How long Auto-wander waits between steps, from 1 to 120, 5 by default",
      },
    ],
  },
  {
    title: "Views and links",
    entries: [
      {
        keys: "Settings",
        action:
          "Open the drawer that holds every other control; Escape, Close or a click outside it shuts it",
      },
      {
        keys: "Presets",
        action:
          "Pick a built-in view for the fractal on the canvas from the Presets dropdown in Settings, or save and load your own",
      },
      {
        keys: "Copy link",
        action:
          "Copy a link to the view on screen to share: it opens on the same view and previews as that view in a chat. The address bar already follows the view, so it can be bookmarked as it is",
      },
      {
        keys: "Download PNG",
        action: "Save the canvas at its full resolution",
      },
      {
        keys: "Math",
        action:
          "The mathematics of the picture sits on a card under the fractal buttons, shown from the first visit: the rule repeated for every point and the fractal's setting with its real value, on one line. More adds where each point starts, what the setting means, the view's centre, width, zoom, iteration cap and colours, how a point is coloured and a few plain sentences, and names the place when you are on one. Expanded, it also follows the pointer: hover the picture and it names the number under the pointer, whether that point escaped and on which step (or which root Newton's method settles on), with a swatch of the colour it is painted and a small plot of the path that point's orbit took, so you can watch a point inside the set spiral in and one outside it fly off; Play walks that path a step at a time. The numbers follow the view as you zoom and pan. The Math button in the top bar hides and shows the card, and so does Escape while the card or the button has focus; the card is also hidden during a tour. The browser remembers whether it is shown and whether it is expanded",
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
