/**
 * The route error boundary, `src/app/error.tsx`.
 *
 * A Node suite with no DOM cannot render the page or press its button, so this
 * reads the source the way the other panel tests here do: the client directive
 * first, the button wired to `reset`, and no path to the error's message or
 * stack anywhere in the file.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const page = source("../app/error.tsx");

describe("the error boundary's file", () => {
  it("is a client component, the first line", () => {
    expect(page.split("\n")[0]).toBe('"use client";');
  });

  it("does not depend on the explorer page", () => {
    expect(page).not.toContain("FractalExplorer");
  });
});

describe("the error boundary's markup", () => {
  it("says something went wrong and offers a Try again button", () => {
    expect(page).toContain("Something went wrong.");
    expect(page).toMatch(/<button\s+type="button"[\s\S]*?>\s*Try again\s*<\/button>/);
  });

  it("calls the reset Next passes in when the button is pressed", () => {
    expect(page).toMatch(/<button\s+type="button"\s+onClick=\{\(\) => reset\(\)\}/);
  });

  it("never renders the error's message or stack", () => {
    expect(page).not.toContain("error.message");
    expect(page).not.toContain("error.stack");
  });
});
