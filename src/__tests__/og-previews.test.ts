import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CARD_PATH, OG_IMAGE_MAX_BYTES, ogImagePath } from "@/lib/ogImage";
import { PLACES } from "@/lib/places";

// `require` for the Next config, which is a CommonJS module. `import.meta.url`
// is this file: src/__tests__/, so ".." twice is the repository root.
const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PREVIEW_DIR = join(ROOT, "public", "og");

/** The `.jpg` files in public/og, by the place id their name carries. */
function previewFiles(): Map<string, string> {
  const files = new Map<string, string>();

  for (const name of readdirSync(PREVIEW_DIR)) {
    if (extname(name) === ".jpg") files.set(name.slice(0, -4), name);
  }

  return files;
}

const bytesOf = (name: string) => statSync(join(PREVIEW_DIR, name)).size;

/**
 * The pre-built pictures themselves, as committed.
 *
 * `scripts/make-og-previews.mjs` writes them and a developer commits them with
 * whatever changed the catalogue, so this holds the two together: a place with
 * no picture, a picture no place names, or a picture that is not a JPEG of a
 * sane weight fails here rather than at a crawler, which is where it would
 * otherwise show up.
 */
describe("the committed preview pictures", () => {
  const files = previewFiles();

  it("has one for every place in the catalogue, and none for anything else", () => {
    expect([...files.keys()].sort()).toEqual(PLACES.map((p) => p.id).sort());
    // The path the head builds for a place has to be the file that is there.
    for (const [id, name] of files) {
      expect(ogImagePath(id), id).toBe(`/og/${name}`);
    }
  });

  it("is a JPEG within the weight the generator allows", () => {
    let total = 0;

    for (const [id, name] of files) {
      const size = bytesOf(name);
      const head = readFileSync(join(PREVIEW_DIR, name)).subarray(0, 3);

      // JFIF: the start-of-image marker, then the marker that follows it.
      expect([...head], id).toEqual([0xff, 0xd8, 0xff]);
      expect(size, id).toBeLessThanOrEqual(OG_IMAGE_MAX_BYTES);
      expect(size, id).toBeGreaterThan(1024);
      total += size;
    }

    // The whole set is what a checkout carries, so it is bounded here as well
    // as per picture above.
    expect(total).toBeLessThan(15 * 1024 * 1024);
  });

  it("keeps the application's own card beside them", () => {
    expect(
      statSync(join(ROOT, "public", CARD_PATH.slice(1))).size,
    ).toBeGreaterThan(0);
  });
});

/**
 * How the previews are cached.
 *
 * Next serves a file under `public/` with `Cache-Control: public, max-age=0`
 * and an ETag, so a crawler or a browser revalidates one on every share; these
 * change only when the generator is run, so they are cached. The rule covers
 * `/og/...` and nothing else, which is what keeps the page, the health route
 * and every other asset on the headers they had.
 */
describe("the preview cache header", () => {
  it("is a day of freshness with a week of stale-while-revalidate, for /og only", async () => {
    const config = require("../../next.config.js");
    const rules = await config.headers();

    expect(rules).toEqual([
      {
        source: "/og/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ]);
  });
});
