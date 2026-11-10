/**
 * The not-found page: the parts that live in markup and imports
 *
 * A Node suite has no DOM to render the page into, so this reads its source
 * the way the other panel tests here do: a default-exported server component,
 * a heading, a visible link back to `/`, and no import of the explorer or the
 * maths, so a mistyped address never loads the renderer.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/not-found.tsx");

/** The module specifier of every `import ... from "..."` in the file. */
function importedModules(text: string): string[] {
  return [...text.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
}

describe("the not-found page", () => {
  it("default-exports a component and is a server component with no state", () => {
    expect(page).toMatch(/export default function \w+\(/);
    expect(page).not.toContain('"use client"');
  });

  it("has a heading", () => {
    expect(page).toMatch(/<h1[\s>][\s\S]*?<\/h1>/);
  });

  it("links to / with visible text", () => {
    expect(page).toMatch(
      /<Link\s[^>]*href="\/"[^>]*>\s*[^<\s{][^<]*<\/Link>/,
    );
  });

  it("imports nothing from the explorer or src/lib", () => {
    for (const modulePath of importedModules(page)) {
      expect(modulePath).not.toContain("FractalExplorer");
      expect(modulePath).not.toMatch(/(^|\/)lib\//);
    }
  });
});
