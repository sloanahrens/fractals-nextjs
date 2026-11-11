import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import manifest from "../app/manifest";

// `import.meta.url` is this file, src/__tests__/, so ".." twice is the root.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const APP_DIR = join(ROOT, "src", "app");

const PNG_SIGNATURE = "89504e470d0a1a0a";

/**
 * The page's `--background` in `:root`, as a hex colour. The first block in
 * globals.css that declares it is `:root`; `.dark` is a later block.
 */
function backgroundFromCss(): string {
  const css = readFileSync(join(APP_DIR, "globals.css"), "utf8");
  const match = /:root\s*\{[^}]*--background:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%;/.exec(css);

  if (!match) throw new Error("globals.css declares no :root --background");

  return hslToHex(Number(match[1]), Number(match[2]), Number(match[3]));
}

function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hue = h / 60;
  const second = chroma * (1 - Math.abs((hue % 2) - 1));
  const offset = lightness - chroma / 2;

  const [r, g, b] =
    hue < 1 ? [chroma, second, 0]
    : hue < 2 ? [second, chroma, 0]
    : hue < 3 ? [0, chroma, second]
    : hue < 4 ? [0, second, chroma]
    : hue < 5 ? [second, 0, chroma]
    : [chroma, 0, second];

  return (
    "#" +
    [r, g, b]
      .map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

describe("the web app manifest", () => {
  it("names the app Fractals and opens it full-screen at the root", () => {
    const m = manifest();

    expect(m.name).toBe("Fractals");
    expect(m.short_name).toBe("Fractals");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("paints its background and theme in the page's background colour", () => {
    const m = manifest();
    const expected = backgroundFromCss();

    expect(m.background_color).toBe(expected);
    expect(m.theme_color).toBe(expected);
  });

  it("declares the 192 icon at the size its PNG really is", () => {
    // `icon.png` is served at `/icon.png`, so the manifest's src is that file.
    const icon = manifest().icons?.[0];
    const file = readFileSync(join(APP_DIR, "icon.png"));

    expect(icon?.src).toBe("/icon.png");
    expect(icon?.type).toBe("image/png");
    expect(file.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);

    // IHDR: width then height, each a big-endian uint32 at bytes 16 and 20.
    const real = `${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`;
    expect(icon?.sizes).toBe(real);
  });
});
