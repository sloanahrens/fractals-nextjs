/**
 * The app's own words about itself: the document title, the sentence that
 * describes what the explorer draws, the lines the social card carries and the
 * alt text of its picture.
 *
 * One module, so the head, the card's picture and the script that draws it
 * cannot drift apart. The description names every fractal the picker
 * offers, taken from `FRACTAL_TYPES`, so a fractal added there is described
 * here with no second edit; `siteText.test.ts` fails if a label is missing.
 */

import { FRACTAL_TYPES } from "./fractalTypes";

/** The document title, the og:title and the twitter:title. */
export const TITLE = "Next Fractals - Interactive Fractal Explorer";

/** The card's own big title, as the lines `scripts/make-og-card.mjs` draws. */
export const CARD_TITLE_LINES = ["Fractal", "Explorer"] as const;

/**
 * The one line the card carries under its title.
 *
 * It counts nothing and names no fractal, so it stays true however many the
 * picker offers.
 */
export const CARD_TAGLINE = "Wander the fractals: zoom, switch and explore";

/** "a", "a and b", "a, b and c": the list read as English. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";

  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Every fractal the picker offers, by the label it shows, in its own order. */
export const FRACTAL_NAMES: readonly string[] = FRACTAL_TYPES.map(
  (type) => type.label,
);

/** The meta description, and the og:description. */
export const DESCRIPTION = `Generate beautiful fractals with real-time parameter adjustment. Explore the ${joinNames(FRACTAL_NAMES)} fractals with customizable parameters, zoom controls, and preset configurations.`;

/** The twitter:description, which the card shows under the picture. */
export const TWITTER_DESCRIPTION =
  "Generate beautiful fractals with real-time parameter adjustment. Explore infinite mathematical beauty.";

/** The alt text of the static social card (`public/og-card-2.png`). */
export const CARD_ALT = `Fractal Explorer: a colourful fractal behind the title and the line ${CARD_TAGLINE}`;
