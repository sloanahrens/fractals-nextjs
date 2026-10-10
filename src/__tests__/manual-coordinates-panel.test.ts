/**
 * The Manual Coordinates panel says what an Apply did
 *
 * The panel used to swallow both of its failures: a box it could not read was
 * skipped in silence, and a box of another shape than the view was fitted to it
 * with nothing to say so. What it says now is text rendered from state, and the
 * suite runs in Node with no DOM to render into, so this reads the page source
 * instead. The parts a source can check are the ones that carry the behaviour:
 * the message is in the panel and under the boxes, the check that refuses a box
 * runs before the setters that apply one, and typing in a box clears it.
 *
 * What the messages say is `checkManualBounds`'s own test's business.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIRECTORY = fileURLToPath(new URL("..", import.meta.url));
const PAGE_PATH = fileURLToPath(
  new URL("../app/FractalExplorer.tsx", import.meta.url),
);
const page = readFileSync(PAGE_PATH, "utf8");

/**
 * The body of a `const NAME = ...` arrow function in a source, braces and all.
 *
 * The order of statements inside one handler is part of what makes it correct —
 * the refusal has to come before the apply — and a source walk is the only way
 * to see it without a browser.
 */
function functionBody(source: string, name: string): string {
  const declaration = source.indexOf(`const ${name} = `);
  if (declaration === -1) throw new Error(`${name} is not in the page`);

  const open = source.indexOf("{", declaration);
  let depth = 0;

  for (let index = open; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) {
      return source.slice(open, index + 1);
    }
  }

  throw new Error(`unbalanced braces in ${name}`);
}

describe("the manual coordinates panel", () => {
  it("reads the page it is checking", () => {
    expect(relative(SRC_DIRECTORY, PAGE_PATH)).toBe("app/FractalExplorer.tsx");
    expect(page.length).toBeGreaterThan(1000);
  });

  it("shows its message under the four boxes, above the button that applies them", () => {
    const lastBox = page.indexOf('label="Max Imaginary"');
    const message = page.indexOf('role="alert"');
    const applyButton = page.indexOf("Apply Coordinates");

    expect(lastBox).toBeGreaterThan(-1);
    expect(message).toBeGreaterThan(lastBox);
    expect(applyButton).toBeGreaterThan(message);
  });

  it("announces a refusal and only reports the fitted note", () => {
    // An Apply that could not run is an error and interrupts; the note about a
    // box of another shape is the answer to a request that was carried out.
    expect(page).toContain('role="alert"');
    expect(page).toContain('role="status"');
  });

  it("refuses a box before it applies one", () => {
    const body = functionBody(page, "applyManualCoordinates");
    const refusal = body.indexOf('setManualMessage({ kind: "error"');

    expect(refusal).toBeGreaterThan(-1);
    // The view is only touched after the refusal has had its chance: the
    // setters that move it all come later in the handler.
    for (const setter of ["setCenterX(", "setCenterY(", "setZoomLevel("]) {
      expect(body.indexOf(setter)).toBeGreaterThan(refusal);
    }
  });

  it("clears the message as soon as a box is edited", () => {
    expect(functionBody(page, "editManualCoordinate")).toContain(
      "setManualMessage(null)",
    );
  });
});
