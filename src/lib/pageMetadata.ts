/**
 * The page's head: title, description, and the picture a link previews with,
 * on the origin that served the request.
 *
 * Without a view in the request this is the static card `public/og-card-2.png`.
 * A request whose query names a view the codec can
 * read gets the pre-built picture of the nearest place of that view's fractal
 * as og:image and twitter:image — a static file under `/og`, drawn ahead of
 * time by `scripts/make-og-previews.mjs`, so no request makes the server draw
 * anything — and one short line about the view in the title and
 * descriptions (`viewPreview.ts`). The title, the description and the card's
 * alt text are `siteText.ts`'s, the one place they are written down.
 * Everything that reaches the head is built from the decoded view, never from
 * the request's text.
 *
 * og:url is the one field here that is not in the Metadata object: Next
 * collapses a root url with no query to the bare origin, so `ogUrl` is what
 * `src/app/page.tsx` renders as a tag of its own.
 */

import type { Metadata } from "next";
import { CARD_HEIGHT, CARD_PATH, CARD_WIDTH } from "./ogImage";
import { CARD_ALT, DESCRIPTION, TITLE, TWITTER_DESCRIPTION } from "./siteText";
import { previewFor, type SearchParams } from "./viewPreview";

/**
 * The page's own address, for og:url.
 *
 * The root carries its slash here — `https://host/`, not `https://host` — because
 * that is the address the page is on and the one a shared preview should name.
 * Next's metadata API cannot say it: it collapses a url whose pathname is `/`
 * with no query down to the bare origin (`resolveAbsoluteUrlWithPathname`),
 * whatever `metadataBase` or `trailingSlash` say; only `trailingSlash` makes it
 * keep the slash, and that config would redirect `/api/health` and `/api/og` to
 * their slashed forms. So the page renders this one tag itself, from this
 * function, and `pageMetadata` leaves og:url out.
 *
 * @param origin - The origin the request was served from, no trailing slash
 * @param searchParams - The request's query; omitted for the static page
 */
export function ogUrl(origin: string, searchParams: SearchParams = {}): string {
  const preview = previewFor(searchParams);

  return preview ? `${origin}/?${preview.fragment}` : `${origin}/`;
}

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

  const image = preview ? `${origin}${preview.image}` : `${origin}${CARD_PATH}`;
  const imageType = preview ? preview.imageType : "image/png";
  const alt = preview ? preview.alt : CARD_ALT;
  const title = preview ? `${preview.line} - ${TITLE}` : TITLE;
  const description = preview ? `${preview.line}. ${DESCRIPTION}` : DESCRIPTION;
  const twitterDescription = preview
    ? `${preview.line}. ${TWITTER_DESCRIPTION}`
    : TWITTER_DESCRIPTION;

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
      // No `url`: the page renders og:url itself, from `ogUrl` above.
      title,
      description,
      images: [
        {
          url: image,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          alt,
          type: imageType,
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
