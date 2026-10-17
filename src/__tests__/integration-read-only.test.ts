/**
 * The integration tier only reads
 *
 * `make integration-prod` runs tests/integration against production, so nothing
 * in that directory may write: no request with a method other than GET or HEAD.
 * The tier has one place that calls `fetch` (`http.ts`), and this reads every
 * file under it as text -- a node suite has no browser to observe a request in
 * -- and fails on a `fetch`, a client or a method that could write.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// `import.meta.url` is this file: src/__tests__/, so ".." twice is the root.
const DIR = fileURLToPath(new URL("../../tests/integration/", import.meta.url));

/** The one file allowed to call `fetch`, which the rest go through. */
const HTTP = "http.ts";

/** Methods that read. Anything else is a write, or something unknown. */
const READ_ONLY = new Set(["GET", "HEAD"]);

const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => ({ name, source: readFileSync(`${DIR}${name}`, "utf8") }));

/** Every method a file names with `method: "..."`, upper-cased. */
function methodsIn(source: string): string[] {
  return [...source.matchAll(/\bmethod\s*:\s*(["'`])(\w+)\1/g)].map((m) =>
    m[2].toUpperCase(),
  );
}

/** What a source holds that could send a request which is not a read. */
function writesIn(source: string): string[] {
  const found: string[] = [];

  for (const method of methodsIn(source)) {
    if (!READ_ONLY.has(method)) found.push(`method: ${method}`);
  }
  // A `method` whose value is not a literal (`method: m`, or the shorthand
  // `{ method }`) cannot be checked, so it counts.
  const named = [...source.matchAll(/\bmethod\s*(?::|(?=[,}]))/g)].length;
  if (named !== methodsIn(source).length)
    found.push("a method that is not a literal");

  for (const verb of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE"]) {
    if (new RegExp(`["'\`]${verb}["'\`]`, "i").test(source)) found.push(verb);
  }
  if (/\.(post|put|patch|delete)\s*\(/.test(source))
    found.push("a client verb");
  if (/\b(axios|XMLHttpRequest|sendBeacon|WebSocket)\b/.test(source)) {
    found.push("another way to send a request");
  }
  if (/\bnew\s+Request\s*\(/.test(source)) found.push("new Request");

  return found;
}

describe("the integration tier is read-only", () => {
  it("has files to hold to it", () => {
    expect(files.map((file) => file.name)).toContain(HTTP);
    expect(files.map((file) => file.name)).toContain("deployed.test.ts");
  });

  it("sends nothing but GET and HEAD, in any file", () => {
    for (const { name, source } of files) {
      expect(writesIn(source), name).toEqual([]);
    }
  });

  it("calls fetch in http.ts alone, and names GET there", () => {
    for (const { name, source } of files) {
      const calls = /\bfetch\s*\(/.test(source);
      expect(calls, `${name} calls fetch`).toBe(name === HTTP);
    }

    const http = files.find((file) => file.name === HTTP)!;
    expect(methodsIn(http.source)).toEqual(["GET"]);
  });

  it("notices a write when one is added", () => {
    // The guard above is only worth having if it fails on what it guards.
    expect(writesIn('await fetch(url, { method: "POST" })')).toContain(
      "method: POST",
    );
    expect(writesIn("await fetch(url, { method })")).toContain(
      "a method that is not a literal",
    );
    expect(writesIn("await client.delete(url)")).toContain("a client verb");
    expect(writesIn('const m = "put"')).toContain("PUT");
    expect(writesIn('fetch(url, { method: "head" })')).toEqual([]);
  });
});
