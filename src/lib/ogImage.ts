/**
 * Which picture a shared view previews as.
 *
 * A preview used to be drawn on demand by `/api/og`, an unauthenticated route
 * that renders a PNG per request; that is work any stranger can ask for, so
 * every picture a preview can name is now built ahead of time and served as a
 * static file (fr-xnl). `scripts/make-og-previews.mjs` draws one 1200x630
 * picture per catalogue place into `public/og/<place-id>.jpg`, and
 * {@link ogImageFor} names the one a view previews as: the picture of the
 * nearest place of the view's own fractal ({@link nearestPlace}), or the
 * application's own static card when a view has no place at all.
 *
 * The mapping is pure and deterministic — a view always previews as the same
 * picture, so a shared link's card is stable and a fetcher caches one image per
 * place — and it is the only rule behind both the path in the head and the
 * files the generator writes, so the two cannot name different places.
 */

import { PLACES, nearestPlace, type PlaceView } from "./places";

/** The directory the pre-built previews are served from, under `public/`. */
export const OG_IMAGE_DIR = "/og";

/** The shape every preview picture is drawn at: the Open Graph card's. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * The most one pre-built picture may weigh. The generator draws each one at
 * quality 80 and steps the quality down only as far as it must to fit this, so
 * it is a budget every picture is made to meet rather than a guard it is hoped
 * to stay under (`scripts/make-og-previews.mjs`); `ogPreviews.test.ts` holds
 * the committed set to it.
 */
export const OG_IMAGE_MAX_BYTES = 200 * 1024;

/**
 * The application's own card, `public/og-card-2.png`, for a page with no view
 * to preview (`scripts/make-og-card.mjs` draws it). The name carries a 2 so a
 * chat app that cached the old card fetches this one; a new card means a new
 * name and a new file here.
 */
export const CARD_PATH = "/og-card-2.png";

/** The card's size, the shape every preview picture is drawn at. */
export const CARD_WIDTH = OG_IMAGE_WIDTH;
export const CARD_HEIGHT = OG_IMAGE_HEIGHT;

/**
 * The path a place's pre-built picture is served from.
 *
 * The one place the file name is spelled out: the generator writes
 * `public${ogImagePath(id)}` and the metadata names it, so a place and its
 * picture cannot be named differently.
 *
 * @param placeId - A `Place.id`
 */
export function ogImagePath(placeId: string): string {
  return `${OG_IMAGE_DIR}/${placeId}.jpg`;
}

/**
 * The picture a view previews as.
 *
 * @param view - The view a link names, as the page holds it
 * @returns The nearest place's pre-built picture, or {@link CARD_PATH} when
 *   the view has no place — a view that cannot be measured, or a fractal the
 *   catalogue has none of (which the catalogue's own test rules out for every
 *   fractal this build knows)
 */
export function ogImageFor(view: PlaceView): string {
  const place = nearestPlace(view, PLACES);

  return place === null ? CARD_PATH : ogImagePath(place.id);
}
