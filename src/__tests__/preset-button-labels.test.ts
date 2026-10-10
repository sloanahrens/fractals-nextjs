/**
 * The Presets card is a dropdown and nothing else
 *
 * The Nearby strip over the canvas replaced the row of built-in view buttons
 * that used to sit under the dropdown, which also retired the clipped-label
 * problem those buttons had ("Julia: Classic" read "Classi" in a fixed-width
 * column). The suite has no DOM, so this reads the `PresetSelector` source for
 * what is and is not in it, and the page for the strip that took the buttons'
 * place.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const selector = source("../components/ui/PresetSelector.tsx");
const page = source("../app/FractalExplorer.tsx");

describe("the Presets card", () => {
  it("keeps its dropdown, listing built-in and saved views", () => {
    expect(selector).toContain("<Select");
    expect(selector).toContain('label="Presets"');
    expect(selector).toContain("presetsForFractal(BUILTIN_PRESETS, fractal)");
    expect(selector).toContain("presetsForFractal(customPresets, fractal)");
    expect(selector).toContain("onChange={handlePresetChange}");
  });

  it("no longer has the row of built-in view buttons", () => {
    expect(selector).not.toContain("<Button");
    expect(selector).not.toContain('from "./Button"');
    expect(selector).not.toMatch(/grid-cols-\d/);
    expect(selector).not.toContain(
      "builtins.map((preset) => (\n        <Button",
    );
  });

  it("still offers saved views and custom presets from the drawer", () => {
    const drawer = page.slice(
      page.indexOf("<SettingsDrawer"),
      page.indexOf("</SettingsDrawer>"),
    );

    expect(drawer).toContain("<PresetSelector");
    expect(drawer).toContain("<CustomPresetManager");
  });
});
