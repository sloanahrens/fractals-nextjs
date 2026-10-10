#!/usr/bin/env node
/**
 * One-off generator for the link-preview assets: public/og-card.png (1200x630),
 * src/app/icon.png (192x192) and src/app/apple-icon.png (180x180).
 *
 * It is not part of `make gate` and not part of the Docker image. Run it from
 * the repository root when the card should change, and commit the three PNGs:
 *
 *   node scripts/make-og-card.mjs                      # write the three assets
 *   node scripts/make-og-card.mjs --sheet out.png      # contact sheet of candidates
 *   node scripts/make-og-card.mjs --place <id> --scheme <name> --icon-crop x,y,size
 *
 * What it uses, all of it already on a development machine:
 *   - esbuild (a dependency of Vitest) bundles the explorer's own
 *     `FractalRenderer`, so the picture is exactly what the app draws;
 *   - the system Chrome (override with CHROME=/path/to/chrome) runs that bundle
 *     headless, composes the card on a canvas and hands the PNG back in the DOM;
 *   - sharp (installed by Next.js) cuts the icons and squeezes the card under
 *     the 300 KB the bead asks for, with a 256-colour palette.
 * It adds nothing to package.json. Inter, the app's own font (`layout.tsx`), is
 * fetched once from Google Fonts into the temporary directory.
 *
 * The shipped card: the catalogue place DEFAULT_PLACE in its own colour scheme,
 * drawn at the card's 1.91:1 shape (the view keeps the place's height, so a
 * 1.91:1 frame shows more width than the page's 4:3), under a dark
 * left-to-right gradient that carries the title and one line of subtitle. The
 * subject sits right of centre, so a square or 1.91:1 thumbnail still has it.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const CARD_MAX_BYTES = 300 * 1024;

const TITLE = ["Fractal", "Explorer"];
const SUBTITLE = "Wander the Mandelbrot, Julia and Burning Ship sets";

// The place, scheme and framing the shipped card was cut from. `shift` moves
// the view's centre by that many view-heights, to put the subject where the
// gradient leaves it visible.
const DEFAULT_PLACE = "julia-classic-deep-spiral";
const DEFAULT_SCHEME = undefined; // the place's own
const DEFAULT_SHIFT = { x: 0, y: 0 };
// Square crop of the raw render the icons are cut from: left, top, side.
const DEFAULT_ICON_CROP = "700,195,240";

function argument(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

/** The page the headless Chrome runs: the explorer's renderer and a composer. */
async function bundle() {
  const result = await build({
    stdin: {
      resolveDir: ROOT,
      sourcefile: "og-card-entry.ts",
      loader: "ts",
      contents: `
        import { FractalRenderer } from "./src/lib/fractalRenderer";
        import { PLACES } from "./src/lib/places";
        import { resolveFractalKind } from "./src/lib/fractalTypes";
        import { autoIterations, BASE_HEIGHT } from "./src/lib/mandelbrot";

        function drawPlace(place, scheme, width, height, shift) {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const span = BASE_HEIGHT / place.zoom;
          const cx = place.centerX + (shift?.x ?? 0) * span;
          const cy = place.centerY + (shift?.y ?? 0) * span;
          const spanX = (span * width) / height;
          const renderer = new FractalRenderer(
            canvas,
            resolveFractalKind(place.fractal, place.variant ?? ""),
          );
          return renderer
            .renderFractal(
              {
                bounds: {
                  minReal: cx - spanX / 2,
                  maxReal: cx + spanX / 2,
                  minImaginary: cy - span / 2,
                  maxImaginary: cy + span / 2,
                },
                maxIterations: autoIterations(place.zoom),
                width,
                height,
                colorScheme: scheme ?? place.colorScheme ?? "classic",
              },
              undefined,
              true,
            )
            .then(() => canvas);
        }

        async function card(job) {
          const place = PLACES.find((p) => p.id === job.place);
          if (!place) throw new Error("no place " + job.place);
          const raw = await drawPlace(place, job.scheme, job.width, job.height, job.shift);
          const out = document.createElement("canvas");
          out.width = job.width;
          out.height = job.height;
          const ctx = out.getContext("2d");
          ctx.drawImage(raw, 0, 0);

          const shade = ctx.createLinearGradient(0, 0, job.width, 0);
          shade.addColorStop(0, "rgba(6, 8, 18, 0.96)");
          shade.addColorStop(0.3, "rgba(6, 8, 18, 0.9)");
          shade.addColorStop(0.55, "rgba(6, 8, 18, 0.45)");
          shade.addColorStop(0.8, "rgba(6, 8, 18, 0)");
          ctx.fillStyle = shade;
          ctx.fillRect(0, 0, job.width, job.height);

          await document.fonts.load("800 120px Inter");
          await document.fonts.load("400 32px Inter");
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = "#ffffff";
          ctx.font = "800 132px Inter";
          const left = 72;
          let y = 250;
          for (const line of job.title) {
            ctx.fillText(line, left, y);
            y += 128;
          }
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "400 34px Inter";
          const words = job.subtitle.split(" ");
          const lines = [];
          let current = "";
          for (const word of words) {
            const next = current ? current + " " + word : word;
            if (ctx.measureText(next).width > 520 && current) {
              lines.push(current);
              current = word;
            } else current = next;
          }
          lines.push(current);
          y += 12;
          for (const line of lines) {
            ctx.fillText(line, left, y);
            y += 46;
          }
          return {
            card: out.toDataURL("image/png"),
            raw: raw.toDataURL("image/png"),
          };
        }

        async function sheet(job) {
          const cols = 3;
          const w = 400;
          const h = Math.round((w * 630) / 1200);
          const rows = Math.ceil(job.items.length / cols);
          const out = document.createElement("canvas");
          out.width = cols * w;
          out.height = rows * h;
          const ctx = out.getContext("2d");
          for (let i = 0; i < job.items.length; i++) {
            const item = job.items[i];
            const place = PLACES.find((p) => p.id === item.place);
            if (!place) throw new Error("no place " + item.place);
            const canvas = await drawPlace(place, item.scheme, w, h, item.shift);
            const x = (i % cols) * w;
            const y = Math.floor(i / cols) * h;
            ctx.drawImage(canvas, x, y);
            ctx.font = "bold 13px sans-serif";
            ctx.fillStyle = "#000";
            ctx.fillRect(x, y, 330, 18);
            ctx.fillStyle = "#fff";
            ctx.fillText(i + " " + item.place + " " + (item.scheme ?? place.colorScheme), x + 4, y + 13);
          }
          return { sheet: out.toDataURL("image/png") };
        }

        window.__run = (job) => (job.kind === "sheet" ? sheet(job) : card(job));
      `,
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    logLevel: "error",
  });
  return result.outputFiles[0].text;
}

/** Inter 400 and 800 as TTFs, fetched from Google Fonts the way next/font does. */
async function fetchFonts(dir) {
  const css = await (
    await fetch(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;800&display=swap",
      { headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120" } },
    )
  ).text();
  const faces = [];
  for (const block of css.split("@font-face").slice(1)) {
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
    if (!weight || !url) continue;
    const file = `inter-${weight}.ttf`;
    writeFileSync(
      join(dir, file),
      Buffer.from(await (await fetch(url)).arrayBuffer()),
    );
    faces.push(
      `@font-face{font-family:Inter;font-weight:${weight};src:url(${file})}`,
    );
  }
  if (faces.length !== 2)
    throw new Error("could not fetch Inter from Google Fonts");
  return faces.join("\n");
}

/** Run one job in headless Chrome and return what the page computed. */
async function runInChrome(job) {
  const dir = mkdtempSync(join(tmpdir(), "og-card-"));
  try {
    const faces = await fetchFonts(dir);
    writeFileSync(join(dir, "bundle.js"), await bundle());
    writeFileSync(
      join(dir, "page.html"),
      `<!doctype html><meta charset="utf-8"><style>${faces}</style>
<pre id="out"></pre>
<script src="bundle.js"></script>
<script>
  window.__run(${JSON.stringify(job)})
    .then((r) => { document.getElementById("out").textContent = JSON.stringify(r); })
    .catch((e) => { document.getElementById("out").textContent = JSON.stringify({ error: String(e) }); });
</script>`,
    );
    const dom = execFileSync(
      CHROME,
      [
        "--headless=new",
        "--disable-gpu",
        "--allow-file-access-from-files",
        "--virtual-time-budget=600000",
        "--dump-dom",
        `file://${join(dir, "page.html")}`,
      ],
      { maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
    const text = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom)?.[1];
    if (!text) throw new Error("Chrome returned no result");
    const result = JSON.parse(
      text.replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
    );
    if (result.error) throw new Error(result.error);
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const decode = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");

async function main() {
  const sheetPath = argument("sheet");
  if (sheetPath) {
    const ids = (argument("places") ?? "").split(",").filter(Boolean);
    const items = ids.map((spec) => {
      const [place, scheme] = spec.split(":");
      return { place, scheme };
    });
    const { sheet } = await runInChrome({ kind: "sheet", items });
    writeFileSync(sheetPath, decode(sheet));
    console.log(`wrote ${sheetPath}`);
    return;
  }

  const shiftArg = argument("shift");
  const shift = shiftArg
    ? { x: Number(shiftArg.split(",")[0]), y: Number(shiftArg.split(",")[1]) }
    : DEFAULT_SHIFT;
  const place = argument("place") ?? DEFAULT_PLACE;
  const scheme = argument("scheme") ?? DEFAULT_SCHEME;
  const [left, top, side] = (argument("icon-crop") ?? DEFAULT_ICON_CROP)
    .split(",")
    .map(Number);

  const { card, raw } = await runInChrome({
    kind: "card",
    place,
    scheme,
    shift,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    title: TITLE,
    subtitle: SUBTITLE,
  });

  const cardPng = await sharp(decode(card))
    .png({ palette: true, colours: 256, quality: 92, effort: 10, dither: 0.8 })
    .toBuffer();
  if (cardPng.length > CARD_MAX_BYTES) {
    throw new Error(`card is ${cardPng.length} bytes, over ${CARD_MAX_BYTES}`);
  }
  mkdirSync(join(ROOT, "public"), { recursive: true });
  writeFileSync(join(ROOT, "public", "og-card.png"), cardPng);

  const square = sharp(decode(raw)).extract({
    left,
    top,
    width: side,
    height: side,
  });
  for (const [file, size] of [
    ["icon.png", 192],
    ["apple-icon.png", 180],
  ]) {
    const png = await square
      .clone()
      .resize(size, size)
      .png({ palette: true, colours: 128, effort: 10 })
      .toBuffer();
    writeFileSync(join(ROOT, "src", "app", file), png);
  }
  console.log(
    `og-card.png ${cardPng.length} bytes; place ${place}, scheme ${scheme ?? "(its own)"}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
