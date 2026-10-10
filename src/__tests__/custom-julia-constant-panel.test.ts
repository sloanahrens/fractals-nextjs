/**
 * The Custom option of the Julia constant select, and the two boxes behind it
 *
 * What a pair of boxes means is `customConstantInput`'s own test's business.
 * What the page does with it is rendered from state, and the suite runs in Node
 * with no DOM, so this reads the page source the way the manual coordinates
 * test does: the select offers Custom, the boxes appear only for a custom
 * constant and sit under the select, an unreadable entry returns before the
 * constant is touched, and the message is a status.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const page = readFileSync(
  fileURLToPath(new URL("../app/FractalExplorer.tsx", import.meta.url)),
  "utf8",
);

/** The body of a `const NAME = ...` arrow function in the page, braces and all. */
function functionBody(name: string): string {
  const declaration = page.indexOf(`const ${name} = `);
  if (declaration === -1) throw new Error(`${name} is not in the page`);

  const open = page.indexOf("{", declaration);
  let depth = 0;

  for (let index = open; index < page.length; index++) {
    if (page[index] === "{") depth++;
    if (page[index] === "}" && --depth === 0) {
      return page.slice(open, index + 1);
    }
  }

  throw new Error(`unbalanced braces in ${name}`);
}

describe("the custom Julia constant controls", () => {
  it("offers Custom in the Julia constant select, after the named four", () => {
    const select = page.indexOf("label={variants.label}");
    const named = page.indexOf("...variants.options", select);
    const custom = page.indexOf("CUSTOM_OPTION_VALUE,", named);

    expect(select).toBeGreaterThan(-1);
    expect(named).toBeGreaterThan(select);
    expect(custom).toBeGreaterThan(named);
    expect(page).toContain("CUSTOM_OPTION_LABEL");
  });

  it("shows the boxes only for a Julia view on a custom constant, under the select", () => {
    const select = page.indexOf("label={variants.label}");
    const guard = page.indexOf("isCustomVariant(fractalType, variant) && (");
    const real = page.indexOf('label="Real"');
    const imaginary = page.indexOf('label="Imaginary"');

    expect(guard).toBeGreaterThan(select);
    expect(real).toBeGreaterThan(guard);
    expect(imaginary).toBeGreaterThan(real);
    // The guard is the descriptor's (`isCustomVariant`, tested in
    // fractalTypes.test.ts): only Julia allows a custom value, so no other
    // fractal shows the boxes.
  });

  it("labels both boxes and asks for a decimal keyboard", () => {
    const boxes = page.slice(page.indexOf('label="Real"'));

    expect(boxes.slice(0, 700).match(/inputMode="decimal"/g)).toHaveLength(2);
  });

  it("puts the message under the boxes, as a status", () => {
    const imaginary = page.indexOf('label="Imaginary"');
    const message = page.indexOf("juliaInputError !== null", imaginary);
    const role = page.indexOf('role="status"', message);

    expect(message).toBeGreaterThan(imaginary);
    expect(role).toBeGreaterThan(message);
  });

  it("returns on an unreadable entry before it reaches the constant", () => {
    const body = functionBody("editJuliaInput");
    const refusal = body.indexOf('"error" in result');
    const returned = body.indexOf("return;", refusal);
    const handler = body.indexOf("handleVariantChange(");

    expect(refusal).toBeGreaterThan(-1);
    expect(returned).toBeGreaterThan(refusal);
    expect(handler).toBeGreaterThan(returned);
    expect(body).toContain("parseCustomConstantInput(");
  });

  it("sends a readable pair through the existing constant handler", () => {
    expect(functionBody("editJuliaInput")).toContain(
      "handleVariantChange(result.constant)",
    );
  });

  it("starts Custom from the constant already drawn, without reframing", () => {
    const body = functionBody("handleVariantSelect");

    expect(body).toContain("parseJuliaConstant(variant)");
    expect(body).toContain("customConstantName(");
    expect(body).toContain("setVariant(name)");
    expect(body).not.toContain("applyDefaultView");
  });

  it("fills the boxes when the constant moves for any other reason", () => {
    const sync = page.indexOf("syncedVariant !== variant");

    expect(sync).toBeGreaterThan(-1);
    expect(page.slice(sync, sync + 500)).toContain("setJuliaRealText(");
    expect(page.slice(sync, sync + 500)).toContain("setJuliaImaginaryText(");
  });
});
