/**
 * "Save Current" names exactly one control, and that control saves
 *
 * `PresetSelector` used to render a second "Save Current" button. Its handler
 * only dispatched a `save-preset` CustomEvent, and nothing listened for that
 * event, so clicking it opened no dialog and wrote nothing to localStorage. The
 * control that saves is `CustomPresetManager`'s, which opens its own inline
 * dialog. The suite runs in Node with no DOM to render into, so this reads the
 * sources instead: a dead event name or a second copy of the label fails here
 * rather than in a browser.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// `import.meta.url` is this file, so ".." is the directory the app lives under.
const SRC_DIRECTORY = fileURLToPath(new URL("..", import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);

/** The event the removed button dispatched to nobody. */
const DEAD_EVENT = "save-preset";

/** The label as a component would render it: JSX text or a string literal. */
const SAVE_LABEL = /(["']Save Current["']|>\s*Save Current\s*<)/;

/** The one component that owns the save control. */
const SAVE_COMPONENT = "components/ui/CustomPresetManager.tsx";

/** Every file under a directory, at any depth. */
function everyFile(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? everyFile(path) : [path];
  });
}

// This file names both strings to forbid them, so it cannot be one of the
// files it checks.
const sources = everyFile(SRC_DIRECTORY)
  .filter((path) => path !== THIS_FILE)
  .map((path) => ({
    name: relative(SRC_DIRECTORY, path),
    source: readFileSync(path, "utf8"),
  }));

/** The sources whose text matches a pattern. */
function matching(pattern: string | RegExp): string[] {
  return sources
    .filter(({ source }) => source.match(pattern) !== null)
    .map(({ name }) => name);
}

describe("the save-current control", () => {
  it("has sources to check at all", () => {
    // A walk that found nothing would make the checks below pass by finding
    // nothing wrong, so the walk itself has to find the app.
    expect(sources.length).toBeGreaterThan(10);
  });

  it("dispatches no event that nothing listens for", () => {
    expect(matching(DEAD_EVENT)).toEqual([]);
  });

  it("renders the label in exactly one component", () => {
    expect(matching(SAVE_LABEL)).toEqual([SAVE_COMPONENT]);
  });
});
