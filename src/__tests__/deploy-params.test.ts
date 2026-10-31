/**
 * The deployment's own values live in `deploy/params.json`, and the files that
 * still spell them out agree with it
 *
 * A fork supplies its own project id, base key file, service URLs, stack
 * secrets and live URLs, so the params file is where they are written once.
 * The files that still carry the literals -- the four release workflows, the
 * health workflow, the two Pulumi stack files and README -- are compared with
 * it here, and drift fails the gate. The workflows are hook-protected copies of
 * the devops templates (CLAUDE.md, "Deployment") and keep their literals until
 * devops dv-a9q4's render command, with its drift-check mode, replaces this
 * guard; this test is deliberately small for that reason.
 *
 * `pulumiEncryptedKey` holds this deployment's Pulumi stack secrets, committed
 * as they stand in the stack files. Only the original key decrypts them, so a
 * fork must supply its own rather than copy these.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// `import.meta.url` is this file: src/__tests__/, so ".." twice is the root.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The four release workflows that name the project and the base key file. */
const RELEASE_WORKFLOWS = ["deploy", "up", "teardown", "staging"];

/** The two Pulumi stacks, each with its own encrypted key. */
const STACKS = ["staging", "prod"] as const;

type Stack = (typeof STACKS)[number];

/** The params the deploy generator reads (the nine keys of dv-z3g0). */
interface Params {
  projectId: string;
  baseKeyFile: string;
  stagingUrl: string;
  prodUrl: string;
  registryUrl: string;
  secretsProvider: string;
  pulumiEncryptedKey: Record<Stack, string>;
  readmeLiveUrls: string[];
  // P8 owns the handle, and it is not committed: absent, or empty at most.
  twitterCreator?: string;
}

/** Every key the generator requires; `twitterCreator` is the only optional one. */
const REQUIRED_KEYS = [
  "projectId",
  "baseKeyFile",
  "stagingUrl",
  "prodUrl",
  "registryUrl",
  "secretsProvider",
  "pulumiEncryptedKey",
  "readmeLiveUrls",
] as const;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const params = JSON.parse(read("deploy/params.json")) as Params;

/**
 * Every value a YAML file gives `key`, in the plain `key: value` form these
 * files use.
 *
 * A YAML parser is not in the dependency set the gate installs from the
 * lockfile, and this guard is meant to be replaced by dv-a9q4, so it reads the
 * declarations directly. A quoted scalar is unquoted before it is compared.
 */
function valuesFor(source: string, key: string): string[] {
  const pattern = new RegExp(
    `^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.*?)\\s*$`,
    "gm",
  );

  return [...source.matchAll(pattern)].map((match) =>
    match[1].replace(/^(["'])(.*)\1$/, "$2"),
  );
}

/** Every declaration of `key` in `file` says `expected`, and there is one. */
function expectDeclared(file: string, key: string, expected: string): void {
  const values = valuesFor(read(file), key);

  expect(values.length, `${file} declares ${key}`).toBeGreaterThan(0);
  expect(values, `${file} ${key}`).toEqual(values.map(() => expected));
}

describe("deploy/params.json", () => {
  it("holds the nine deployment keys, and nothing else", () => {
    // `twitterCreator` is the only optional key, and P8 owns it.
    const optional = "twitterCreator" in params ? ["twitterCreator"] : [];

    expect(Object.keys(params).sort()).toEqual(
      [...REQUIRED_KEYS, ...optional].sort(),
    );
  });

  it("gives each scalar key a non-empty string", () => {
    const strings = [
      params.projectId,
      params.baseKeyFile,
      params.stagingUrl,
      params.prodUrl,
      params.registryUrl,
      params.secretsProvider,
    ];

    for (const value of strings) {
      expect(value).toMatch(/\S/);
    }
    for (const stack of STACKS) {
      expect(params.pulumiEncryptedKey[stack]).toMatch(/\S/);
    }
  });

  it("lists exactly two non-empty live URLs", () => {
    expect(params.readmeLiveUrls).toHaveLength(2);
    for (const url of params.readmeLiveUrls) {
      expect(url).toMatch(/\S/);
    }
  });

  it("leaves the Twitter handle out, or empty", () => {
    expect(params.twitterCreator ?? "").toBe("");
  });

  it("names the two service URLs as its live URLs", () => {
    expect([...params.readmeLiveUrls].sort()).toEqual(
      [params.stagingUrl, params.prodUrl].sort(),
    );
  });
});

describe("the release workflows", () => {
  it.each(RELEASE_WORKFLOWS)("%s.yml names the params project id", (name) => {
    expectDeclared(
      `.forgejo/workflows/${name}.yml`,
      "GT_PROJECT",
      params.projectId,
    );
  });

  it.each(RELEASE_WORKFLOWS)("%s.yml names the params base key file", (name) => {
    expectDeclared(
      `.forgejo/workflows/${name}.yml`,
      "GT_BASE_KEY_FILE",
      params.baseKeyFile,
    );
  });
});

describe("the health workflow", () => {
  const HEALTH = ".forgejo/workflows/health.yml";

  it("tests staging at the params staging URL", () => {
    expectDeclared(HEALTH, "GT_STAGING_URL", params.stagingUrl);
  });

  it("smokes production at the params prod URL", () => {
    expectDeclared(HEALTH, "GT_PROD_URL", params.prodUrl);
  });
});

describe.each(STACKS)("deploy/Pulumi.%s.yaml", (stack) => {
  const FILE = `deploy/Pulumi.${stack}.yaml`;

  it("names the params project id", () => {
    expectDeclared(FILE, "fractals:project", params.projectId);
  });

  it("uses the params secrets provider", () => {
    expectDeclared(FILE, "secretsprovider", params.secretsProvider);
  });

  it("carries the params encrypted key for this stack", () => {
    expectDeclared(FILE, "encryptedkey", params.pulumiEncryptedKey[stack]);
  });
});

describe("README", () => {
  it("lists the params live URLs, and only those", () => {
    const urls = [...read("README.md").matchAll(/https:\/\/\S+\.run\.app/g)].map(
      (match) => match[0].replace(/[,.)]+$/, ""),
    );

    expect(urls.sort()).toEqual([...params.readmeLiveUrls].sort());
  });
});
