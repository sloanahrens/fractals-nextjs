import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readDeploymentParams,
  twitterCreatorAtBuild,
  twitterCreatorFromParams,
} from "../deploymentParamsFile";
import { pageMetadata } from "../pageMetadata";

// `require` for the Next config, which is a CommonJS module.
const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ORIGIN = "https://fractals.example.com";

/** The creator tag a metadata object carries, if it carries one. */
const creatorOf = (metadata: ReturnType<typeof pageMetadata>) =>
  (metadata.twitter as { creator?: string }).creator;

const roots: string[] = [];

/** A temporary checkout, never the real one. */
function checkout(contents?: string): string {
  const root = mkdtempSync(join(tmpdir(), "fractals-params-"));
  roots.push(root);
  mkdirSync(join(root, "deploy"));
  if (contents !== undefined) {
    writeFileSync(join(root, "deploy", "params.json"), contents);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("twitterCreatorFromParams", () => {
  it("is the handle the params file gives", () => {
    expect(twitterCreatorFromParams({ twitterCreator: "@made-up-name" })).toBe(
      "@made-up-name",
    );
  });

  it("passes the handle through as written, minus surrounding space", () => {
    expect(twitterCreatorFromParams({ twitterCreator: "  @made-up-name\n" })).toBe(
      "@made-up-name",
    );
  });

  it("is null when the file gives no handle", () => {
    for (const params of [
      {},
      { twitterCreator: null },
      { twitterCreator: "" },
      { twitterCreator: "   " },
    ]) {
      expect(twitterCreatorFromParams(params)).toBeNull();
    }
  });

  it("refuses a params file that is not a JSON object", () => {
    for (const params of [null, [], "params", 7]) {
      expect(() => twitterCreatorFromParams(params)).toThrow(TypeError);
    }
  });

  it("refuses a creator that is not a string", () => {
    for (const creator of [7, true, {}, ["@made-up-name"]]) {
      expect(() =>
        twitterCreatorFromParams({ twitterCreator: creator }),
      ).toThrow(/twitterCreator must be a string/);
    }
  });
});

describe("readDeploymentParams", () => {
  it("parses the file under the checkout it is given", () => {
    const root = checkout(
      JSON.stringify({ twitterCreator: "@made-up-name", projectId: "p" }),
    );

    expect(readDeploymentParams(root)).toEqual({
      twitterCreator: "@made-up-name",
      projectId: "p",
    });
  });

  it("is an empty object when the checkout has no params file", () => {
    expect(readDeploymentParams(checkout())).toEqual({});
  });

  it("is an empty object when the checkout has no deploy directory", () => {
    const root = mkdtempSync(join(tmpdir(), "fractals-params-"));
    roots.push(root);

    expect(readDeploymentParams(root)).toEqual({});
  });

  it("refuses JSON that does not parse rather than reading it as no values", () => {
    for (const contents of ["{", "", "not json"]) {
      expect(() => readDeploymentParams(checkout(contents))).toThrow(
        /not valid JSON/,
      );
    }
  });

  it("refuses a params path it cannot read rather than reading it as absent", () => {
    // deploy is a file, not a directory, so deploy/params.json is ENOTDIR:
    // an unreadable deployment config must not look like a checkout without one.
    const root = mkdtempSync(join(tmpdir(), "fractals-params-"));
    roots.push(root);
    writeFileSync(join(root, "deploy"), "");

    expect(() => readDeploymentParams(root)).toThrow();
  });
});

describe("twitterCreatorAtBuild", () => {
  it("is the handle the params file names", () => {
    expect(
      twitterCreatorAtBuild(
        checkout(JSON.stringify({ twitterCreator: "@made-up-name" })),
      ),
    ).toBe("@made-up-name");
  });

  it("is null when the checkout has no params file", () => {
    expect(twitterCreatorAtBuild(checkout())).toBeNull();
  });

  it("is null when the file names no handle", () => {
    for (const contents of [
      JSON.stringify({}),
      JSON.stringify({ twitterCreator: null }),
      JSON.stringify({ twitterCreator: "  " }),
    ]) {
      expect(twitterCreatorAtBuild(checkout(contents))).toBeNull();
    }
  });

  it("fails the build on JSON that does not parse", () => {
    expect(() => twitterCreatorAtBuild(checkout("{"))).toThrow(
      /not valid JSON/,
    );
  });

  it("fails the build on a creator that is not a string", () => {
    expect(() =>
      twitterCreatorAtBuild(checkout(JSON.stringify({ twitterCreator: 7 }))),
    ).toThrow(/twitterCreator must be a string/);
  });
});

describe("the build", () => {
  it("compiles the params file's creator into the environment Next inlines", () => {
    const config = require("../../../next.config.js");

    expect(config.env.DEPLOYMENT_TWITTER_CREATOR).toBe(
      twitterCreatorAtBuild(ROOT) ?? "",
    );
  });
});

describe("the head's creator", () => {
  /** The metadata module as a build that compiled `creator` into `env` runs. */
  async function headBuiltWith(creator: string) {
    vi.stubEnv("DEPLOYMENT_TWITTER_CREATOR", creator);
    vi.resetModules();

    return import("../pageMetadata");
  }

  it("is the handle the build compiled in", async () => {
    const { pageMetadata: built } = await headBuiltWith("@made-up-name");

    expect(creatorOf(built(ORIGIN))).toBe("@made-up-name");
    expect(creatorOf(built(ORIGIN, { v: "1" }))).toBe("@made-up-name");
  });

  it("is absent when the build compiled in no handle", async () => {
    const { pageMetadata: built } = await headBuiltWith("");

    expect(built(ORIGIN).twitter).not.toHaveProperty("creator");
  });

  it("carries a params file's handle from the file to the tag", () => {
    const root = checkout(JSON.stringify({ twitterCreator: "@made-up-name" }));

    const metadata = pageMetadata(ORIGIN, {}, {
      twitterCreator: twitterCreatorAtBuild(root),
    });

    expect(creatorOf(metadata)).toBe("@made-up-name");
  });

  it("emits no tag for a params file that names none", () => {
    const root = checkout(JSON.stringify({ twitterCreator: "" }));

    const metadata = pageMetadata(ORIGIN, {}, {
      twitterCreator: twitterCreatorAtBuild(root),
    });

    expect(metadata.twitter).not.toHaveProperty("creator");
  });
});
