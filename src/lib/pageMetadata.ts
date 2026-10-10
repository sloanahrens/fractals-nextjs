/**
 * The page's head: title, description, and the social card, on the origin that
 * served the request.
 *
 * Without a view in the request this is the static card `public/og-card.png`
 * (fr-nd5). A request whose query names a view `/api/og` can draw gets that
 * view as og:image and twitter:image, the canonical link as og:url, and one
 * short line about the view in the title and descriptions (`viewPreview.ts`).
 * Everything that reaches the head is built from the decoded view, never from
 * the request's text.
 */

import type { Metadata } from "next";
import { previewFor, type SearchParams } from "./viewPreview";

export const TITLE = "Next Fractals - Interactive Fractal Explorer";
export const DESCRIPTION =
  "Generate beautiful fractals with real-time parameter adjustment. Explore the Mandelbrot set, Julia sets, the Burning Ship, the Tricorn, the Multibrot sets and the Newton fractal with customizable parameters, zoom controls, and preset configurations.";
const TWITTER_DESCRIPTION =
  "Generate beautiful fractals with real-time parameter adjustment. Explore infinite mathematical beauty.";

// The social card, public/og-card.png (scripts/make-og-card.mjs draws it). The
// size is the file's own, which is what og:image:width and height must say.
export const CARD_PATH = "/og-card.png";
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
export const CARD_ALT =
  "Fractal Explorer: a colourful Julia set spiral beside the title and the line Wander the Mandelbrot, Julia and Burning Ship sets";

/** The image route's path; /api/og draws 1200x630, the same shape as the card. */
export const VIEW_IMAGE_PATH = "/api/og";

/**
 * The page's metadata for a request.
 *
 * @param origin - The origin the request was served from, no trailing slash
 * @param searchParams - The request's query; omitted for the static head
 */
export function pageMetadata(
  origin: string,
  searchParams: SearchParams = {},
): Metadata {
  const preview = previewFor(searchParams);

  const image = preview
    ? `${origin}${VIEW_IMAGE_PATH}?${preview.fragment}`
    : `${origin}${CARD_PATH}`;
  const alt = preview ? `${preview.line}, drawn by Fractal Explorer` : CARD_ALT;
  const title = preview ? `${preview.line} - ${TITLE}` : TITLE;
  const description = preview ? `${preview.line}. ${DESCRIPTION}` : DESCRIPTION;
  const twitterDescription = preview
    ? `${preview.line}. ${TWITTER_DESCRIPTION}`
    : TWITTER_DESCRIPTION;
  const url = preview ? `${origin}/?${preview.fragment}` : `${origin}/`;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    keywords: [
      "fractals",
      "mandelbrot",
      "mathematics",
      "visualization",
      "interactive",
    ],
    authors: [{ name: "Sloan Ahrens" }],
    creator: "Sloan Ahrens",
    publisher: "Sloan Ahrens",
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      title,
      description,
      images: [
        {
          url: image,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          alt,
          type: "image/png",
        },
      ],
      siteName: "Next Fractals",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: twitterDescription,
      images: [{ url: image, alt }],
      creator: "@sloanahrens",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}
