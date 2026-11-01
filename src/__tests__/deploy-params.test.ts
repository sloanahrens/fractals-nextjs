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

/** The params the deploy generator reads (dv-z3g0's keys, plus the optional two). */
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
  // The Go module URL `make deploy-check` resolves gt.local/devops through.
  // `registryUrl` is that registry's host, which the generator takes.
  goModuleRegistryUrl?: string;
}

/** Every key the generator requires; the two below are the optional ones. */
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

/** The keys a fork may leave out: the tweet handle, and the Go module URL. */
const OPTIONAL_KEYS = ["twitterCreator", "goModuleRegistryUrl"] as const;

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

/**
 * A registry host as the generator's rule takes it: a host with an optional
 * port, and no scheme, path, query or fragment. It must name something, so a
 * host of dots or dashes alone is not one.
 */
function isRegistryHost(value: string): boolean {
  const match = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(value);

  if (!match || !/[A-Za-z0-9]/.test(match[1])) {
    return false;
  }

  try {
    const url = new URL(`http://${value}`);

    return url.host === value.toLowerCase() && url.pathname === "/";
  } catch {
    return false;
  }
}

/** An absolute http(s) URL with a host, the rule the generator's URLs follow. */
function isAbsoluteHttpUrl(value: string): boolean {
  if (!/^https?:\/\/[^/?#\s]/i.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.host !== ""
    );
  } catch {
    return false;
  }
}

/** Every declaration of `key` in `file` says `expected`, and there is one. */
function expectDeclared(file: string, key: string, expected: string): void {
  const values = valuesFor(read(file), key);

  expect(values.length, `${file} declares ${key}`).toBeGreaterThan(0);
  expect(values, `${file} ${key}`).toEqual(values.map(() => expected));
}

describe("deploy/params.json", () => {
  it("holds the eight required deployment keys and the optional ones, and nothing else", () => {
    const optional = OPTIONAL_KEYS.filter((key) => key in params);

    expect(Object.keys(params).sort()).toEqual(
      [...REQUIRED_KEYS, ...optional].sort(),
    );
  });

  it("gives registryUrl a bare host, and goModuleRegistryUrl an absolute URL", () => {
    // The generator takes the registry host: no scheme, no path. The Go module
    // URL, path and all, is the other key -- `make deploy-check` needs it.
    expect(isRegistryHost(params.registryUrl), "registryUrl is a host").toBe(
      true,
    );

    // This deployment publishes the deploy library, so its file sets it: an
    // absolute URL, not a host like the one above.
    expect(
      isAbsoluteHttpUrl(params.goModuleRegistryUrl ?? ""),
      "goModuleRegistryUrl is an absolute http(s) URL",
    ).toBe(true);
  });

  it("refuses a registry address with a scheme or path, and a URL with no host", () => {
    // The two shapes are easy to swap, and the generator would refuse either
    // one written in the other key. These are the values the file held before
    // the keys were split, plus a scheme with no host.
    expect(isRegistryHost("http://forgejo:3000/api/packages/sloan/go")).toBe(
      false,
    );
    expect(isRegistryHost("forgejo:3000/api/packages/sloan/go")).toBe(false);
    expect(isRegistryHost("...")).toBe(false);

    expect(isAbsoluteHttpUrl("forgejo:3000")).toBe(false);
    expect(isAbsoluteHttpUrl("http:///go")).toBe(false);
    expect(isAbsoluteHttpUrl("ftp://forgejo:3000/go")).toBe(false);
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
