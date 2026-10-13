import { CARD_PATH } from "@/lib/ogImage";
import { siteOrigin } from "@/lib/siteOrigin";
import { previewForQuery } from "@/lib/viewPreview";

// The answer turns on the query, so there is nothing to prerender.
export const dynamic = "force-dynamic";

/**
 * GET /api/og?<view link>: a 308 to the picture that view previews as.
 *
 * This route used to draw the view as a 1200x630 PNG. That made it an
 * unauthenticated endpoint any stranger could ask to spend CPU, so every
 * picture a preview can name is now built ahead of time and served as a static
 * file (`ogImage.ts`), and this route only says which file.
 * Crawlers and chat apps that cached a `/api/og?<view>` URL from before that
 * change still ask for it, and a redirect keeps those previews working without
 * any render happening.
 *
 * The picture is chosen by the page's own rule, through the same function the
 * page's head uses (`previewForQuery`), so the URL a crawler is sent to is the
 * one the shared page names. A query that is not a view — empty, garbage, a
 * tour link this build cannot read — is sent to the static card rather than a
 * 404, so an old cached URL never shows a broken image. The origin is read from
 * the request (`siteOrigin`), validated, never echoed raw.
 */
export function GET(request: Request): Response {
  const search = new URL(request.url).search;
  const image = previewForQuery(search)?.image ?? CARD_PATH;
  const origin = siteOrigin((name) => request.headers.get(name), {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  return new Response(null, {
    status: 308,
    headers: {
      Location: `${origin}${image}`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
