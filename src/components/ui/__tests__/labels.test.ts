/**
 * Every shared control's label names the control it belongs to
 *
 * A control with no associated label is announced as an unnamed slider, text
 * box or combo box, so `Slider`, `Input` and `Select` link the two with
 * `htmlFor` and `id`. The suite runs in Node with no DOM to render into, so
 * this reads the sources of that directory instead: it is the same check a
 * rendered `input.labels.length` would make, minus the browser.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// `import.meta.url` is this file, so ".." is the directory the controls live in.
const UI_DIRECTORY = fileURLToPath(new URL("..", import.meta.url));

const componentSources = readdirSync(UI_DIRECTORY)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => ({
    name,
    source: readFileSync(join(UI_DIRECTORY, name), "utf8"),
  }));

/** Every `<label ...>` tag in a source, attributes and all. */
function labelTags(source: string): string[] {
  return source.match(/<label\b[^>]*>/g) ?? [];
}

/** The value of every `attribute={expression}` in a source, in order. */
function attributeExpressions(source: string, attribute: string): string[] {
  const pattern = new RegExp(`\\b${attribute}=\\{([^}]*)\\}`, "g");

  return [...source.matchAll(pattern)].map((match) => match[1].trim());
}

describe("the shared form controls", () => {
  it("has labels to check at all", () => {
    const labelled = componentSources.filter(
      ({ source }) => labelTags(source).length > 0,
    );

    // A control that stopped rendering its label would make the checks below
    // pass by finding nothing wrong, so the check itself has to find labels.
    expect(labelled.length).toBeGreaterThanOrEqual(3);
  });

  it("gives every label a control to point at", () => {
    const unlinked = componentSources.filter(({ source }) =>
      labelTags(source).some((tag) => !/\bhtmlFor=/.test(tag)),
    );

    expect(unlinked.map(({ name }) => name)).toEqual([]);
  });

  it("points every label at an id its own file sets", () => {
    const dangling: string[] = [];

    for (const { name, source } of componentSources) {
      const ids = new Set(attributeExpressions(source, "id"));

      for (const target of attributeExpressions(source, "htmlFor")) {
        if (!ids.has(target)) {
          dangling.push(`${name}: htmlFor={${target}} has no id={${target}}`);
        }
      }
    }

    expect(dangling).toEqual([]);
  });
});
