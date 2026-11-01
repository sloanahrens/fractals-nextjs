/**
 * The fork-me document, `docs/forking.md`, against the deployment params
 * schema it describes.
 *
 * A fork supplies the ten values the params file takes, so the document names
 * all ten and no other: a key the document introduces, or one the params file
 * gains that the document does not list, fails here. The document writes every
 * key in code font, which is where this guard finds the keys it names.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// `import.meta.url` is this file: src/__tests__/, so ".." twice is the root.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The ten keys the params file takes; the document names each one exactly. */
const PARAMS_KEYS: readonly string[] = [
  "projectId",
  "baseKeyFile",
  "stagingUrl",
  "prodUrl",
  "registryUrl",
  "goModuleRegistryUrl",
  "secretsProvider",
  "pulumiEncryptedKey",
  "readmeLiveUrls",
  "twitterCreator",
];

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/**
 * The keys the document names: the bare camelCase words it sets in code font.
 * A path, a workflow variable or a value example in code font carries a dot, a
 * slash, a colon, a hyphen, a leading capital or no capital at all, so none of
 * them reads as a key.
 */
function documentedKeys(document: string): string[] {
  const codeWords = [...document.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);

  return codeWords.filter(
    (word) => /^[a-z][A-Za-z0-9]*$/.test(word) && /[A-Z]/.test(word),
  );
}

const documented = documentedKeys(read("docs/forking.md"));

describe("docs/forking.md", () => {
  it("names each of the ten params keys", () => {
    expect(PARAMS_KEYS.filter((key) => !documented.includes(key))).toEqual([]);
  });

  it("names no params key outside the ten", () => {
    expect(documented.filter((key) => !PARAMS_KEYS.includes(key))).toEqual([]);
  });

  it("keeps every key the params file takes in the ten it lists", () => {
    const params = JSON.parse(read("deploy/params.json")) as Record<
      string,
      unknown
    >;

    expect(Object.keys(params).filter((key) => !PARAMS_KEYS.includes(key))).toEqual(
      [],
    );
  });

  it("is linked from the README", () => {
    expect(read("README.md")).toContain("](docs/forking.md)");
  });
});
