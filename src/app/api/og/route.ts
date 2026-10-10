import { createOgHandler } from "../../../lib/ogRoute";

// Node, not the edge runtime: the PNG encoder is node:zlib. And per request:
// the picture is named by the query, so there is nothing to prerender.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One handler for the life of the server process, so its cache, its line for
// the renderer and its in-flight renders are shared by every request.
const handle = createOgHandler();

/**
 * GET /api/og?<view link>: the view as a 1200x630 PNG, drawn with the
 * explorer's own maths. See `src/lib/ogView.ts` for the query and
 * `src/lib/ogRoute.ts` for the answers and the limits.
 */
export async function GET(request: Request) {
  return handle(request);
}
