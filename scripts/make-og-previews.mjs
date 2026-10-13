#!/usr/bin/env node
/**
 * Generator for the pre-built link previews: public/og/<place-id>.jpg, one
 * 1200x630 JPEG for every place in the catalogue (`src/lib/places.ts`).
 *
 * A view previews as the pre-built picture of the nearest catalogue place of
 * its fractal (`src/lib/ogImage.ts`), so `/api/og` never renders: it answers a
 * redirect, and nothing a request can send it makes it draw. This script draws
 * those pictures.
 *
 * It is not part of `make gate`, the Docker build or CI: the images are
 * committed, and the script is run by a developer when the catalogue or the
 * drawing changes, then its output is committed with it.
 *
 *   npm run make-og-previews
 *
 * It draws every place through the application's own pixel pipeline —
 * `renderRgba`, the two steps `FractalRenderer` runs a row at a time
 * (`renderRgbaRows`) — at `cardBounds`, the 1.91:1 card frame, with the place's
 * own colour scheme (`placeColorScheme`), the iteration count Auto picks for
 * its zoom, and smooth counts, which is exactly the picture the page draws when
 * a visitor lands on that place. So a card cannot drift from the app.
 *
 * It exits non-zero, having written nothing for the offending place, if a
 * picture comes out nearly one colour (the blank-picture guard,
 * `isBlankImage`) or heavier than `OG_IMAGE_MAX_BYTES`. A `.jpg` in the output
 * directory that no place names is deleted, so the committed set always matches
 * the catalogue.
 *
 * `esbuild` (a dependency of Vitest) bundles the TypeScript modules once, and
 * `sharp` — the encoder `scripts/make-og-card.mjs` already uses, installed with
 * Next.js — makes the JPEGs; nothing here is in the application's runtime
 * bundle. There is no browser and no network involved.
 *
 * On the size of the files. A busy fractal is the worst case for a JPEG, and
 * `OG_IMAGE_MAX_BYTES` is the landing's budget for one card: the encoder asks
 * for `MAX_QUALITY` and steps down a quality at a time for a picture that will
 * not fit it, so the answer is the best quality that fits, and a picture gives
 * up anything only when a whole frame of filigree will not fit. Every file is
 * logged with the quality it took, and with the running total. The quality is
 * not raised past `MAX_QUALITY` for the places that could afford it: one
 * quality is easier to reason about than a per-place one, and `MAX_QUALITY` is
 * what the landing asked for.
 */

import { build } from "esbuild";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The quality a picture is drawn at, and the lowest it is stepped down to. */
const MAX_QUALITY = 80;
const MIN_QUALITY = 50;

/** How much quality a picture that will not fit the budget gives up at a time. */
const QUALITY_STEP = 1;

/** What the bundle hands back: the modules the drawing and the rules live in. */
const ENTRY = `
  export { PLACES, placeColorScheme } from "./src/lib/places";
  export { resolveFractalKind } from "./src/lib/fractalTypes";
  export { autoIterations } from "./src/lib/mandelbrot";
  export { renderRgba } from "./src/lib/renderRgba";
  export { cardBounds, OG_WIDTH, OG_HEIGHT } from "./src/lib/ogView";
  export { isBlankImage } from "./src/lib/blankView";
  export { ogImagePath, OG_IMAGE_MAX_BYTES } from "./src/lib/ogImage";
`;

/**
 * Bundle the application's own modules and load them into this process.
 *
 * The modules are TypeScript with extension-less relative imports, which Node
 * cannot run as they are, so esbuild bundles them into one ESM file in a
 * temporary directory and this imports that.
 */
async function loadLibrary() {
  const result = await build({
    stdin: {
      resolveDir: ROOT,
      sourcefile: "og-previews-entry.ts",
      loader: "ts",
      contents: ENTRY,
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "error",
  });

  const dir = mkdtempSync(join(tmpdir(), "og-previews-"));
  const file = join(dir, "library.mjs");

  try {
    writeFileSync(file, result.outputFiles[0].text);
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The pixels of one place's picture: the app's own pipeline, at the card's shape. */
function drawPlace(lib, place) {
  const width = lib.OG_WIDTH;
  const height = lib.OG_HEIGHT;

  return lib.renderRgba(
    lib.cardBounds(place.centerX, place.centerY, place.zoom),
    width,
    height,
    lib.autoIterations(place.zoom),
    lib.placeColorScheme(place, "classic"),
    lib.resolveFractalKind(place.fractal, place.variant ?? ""),
    true,
  );
}

/**
 * One picture as a JPEG that fits the landing's budget for a card.
 *
 * The encoder is asked for `MAX_QUALITY` first, and a picture that comes back
 * heavy is asked for again a quality lower — a deep view of filigree is the
 * only kind that costs anything — so the answer is the best quality that fits,
 * and a picture that will not fit even at `MIN_QUALITY` is the generator's
 * error rather than a file nobody can serve.
 */
async function encodeJpeg(lib, pixels, id) {
  const image = sharp(Buffer.from(pixels), {
    raw: { width: lib.OG_WIDTH, height: lib.OG_HEIGHT, channels: 4 },
  });

  for (
    let quality = MAX_QUALITY;
    quality >= MIN_QUALITY;
    quality -= QUALITY_STEP
  ) {
    const data = await image.jpeg({ quality, mozjpeg: true }).toBuffer();

    if (data.length <= lib.OG_IMAGE_MAX_BYTES) return { data, quality };
  }

  throw new Error(
    `${id} is over ${lib.OG_IMAGE_MAX_BYTES} bytes even at quality ${MIN_QUALITY}`,
  );
}

async function main() {
  const lib = await loadLibrary();
  const directory = join(ROOT, "public", "og");

  mkdirSync(directory, { recursive: true });

  const ids = new Set();
  let total = 0;
  let lowest = MAX_QUALITY;

  for (const place of lib.PLACES) {
    const pixels = drawPlace(lib, place);

    if (lib.isBlankImage(pixels, lib.OG_WIDTH, lib.OG_HEIGHT)) {
      throw new Error(`${place.id} came out a nearly one-colour picture`);
    }

    const { data, quality } = await encodeJpeg(lib, pixels, place.id);

    // The name comes from the module the head names the picture with, so the
    // file and the URL cannot be spelled differently.
    writeFileSync(join(ROOT, "public", lib.ogImagePath(place.id)), data);
    ids.add(place.id);
    total += data.length;
    lowest = Math.min(lowest, quality);
    console.log(
      `${place.id} ${Math.round(data.length / 1024)} KB at quality ${quality}`,
    );
  }

  // A picture no place names is one the catalogue has dropped, and the test
  // holds the committed set to the catalogue.
  for (const name of readdirSync(directory)) {
    const id = extname(name) === ".jpg" ? name.slice(0, -4) : null;
    if (id === null || ids.has(id)) continue;

    unlinkSync(join(directory, name));
    console.log(`removed ${name}, which no place names`);
  }

  const files = readdirSync(directory).filter(
    (name) => extname(name) === ".jpg",
  );
  console.log(
    `${ids.size} pictures, ${files.length} files, ${(total / (1024 * 1024)).toFixed(1)} MB, lowest quality ${lowest}`,
  );
  if (files.length !== ids.size)
    throw new Error("the directory does not match");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
