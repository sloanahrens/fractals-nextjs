import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  readDeploymentParams,
  readPageMetadataConfig,
  twitterCreatorFromParams,
} from "../deploymentParams";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

const roots: string[] = [];

/** A temporary checkout under `t.TempDir`'s counterpart, never the real one. */
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

describe("readPageMetadataConfig", () => {
  it("gives the head the handle the params file names", () => {
    const root = checkout(
      JSON.stringify({ twitterCreator: "@made-up-name", projectId: "p" }),
    );

    expect(readPageMetadataConfig(root)).toEqual({
      twitterCreator: "@made-up-name",
    });
  });

  it("gives the head no handle when the file gives none", () => {
    expect(readPageMetadataConfig(checkout(JSON.stringify({})))).toEqual({
      twitterCreator: null,
    });
    expect(readPageMetadataConfig(checkout())).toEqual({ twitterCreator: null });
  });
});

describe("the deployment wiring", () => {
  it("hands the params value to the head from both metadata call sites", () => {
    for (const file of ["src/app/page.tsx", "src/app/layout.tsx"]) {
      expect(source(file), file).toContain("pageMetadataConfig()");
    }
  });

  it("carries the params file into the image the page runs in", () => {
    expect(source("Dockerfile")).toContain(
      "COPY --from=builder /app/deploy/params.json ./deploy/params.json",
    );
    expect(source(".dockerignore")).toContain("!deploy/params.json");
  });
});
