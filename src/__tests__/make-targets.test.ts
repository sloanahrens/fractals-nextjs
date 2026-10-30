/**
 * `make integration` installs what it needs, and the gate still does not run it
 *
 * The staging workflow runs `make integration` in a fresh checkout, so the
 * target takes `ci-install` as a prerequisite, and no path through `gate`
 * reaches the integration tier. Both facts live in the Makefile and nowhere
 * else, so this parses it; the install check at the end runs `make -n` in a
 * temporary directory, because what it pins is make's own decision.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  INTEGRATION_URL_VAR,
  STAGING_URL_VAR,
  resolveIntegrationTarget,
} from "@/lib/integrationTarget";

// `import.meta.url` is this file: src/__tests__/, so ".." twice is the root.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MAKEFILE = `${ROOT}Makefile`;

/** One rule in the Makefile: what it needs, and what it runs. */
interface Target {
  prerequisites: string[];
  recipe: string[];
}

/** A rule line: `name: prerequisites`, but not a `:=` assignment. */
const RULE = /^([A-Za-z0-9_./-]+)\s*:(?!=)\s*(.*)$/;

/**
 * Every rule in a Makefile, as written.
 *
 * Recipe lines are the tab-indented lines under their rule; a rule of the same
 * name written twice adds to the one before it, which is how `make` reads it.
 */
function readTargets(source: string): Map<string, Target> {
  const targets = new Map<string, Target>();
  let current: Target | null = null;

  for (const line of source.split("\n")) {
    if (line.startsWith("\t")) {
      current?.recipe.push(line.trim());
      continue;
    }

    const rule = RULE.exec(line);
    if (!rule) {
      // A comment, a blank line, a variable, or a continuation: the recipe of
      // whatever rule was open has ended either way.
      current = null;
      continue;
    }

    const [, name, prerequisites] = rule;
    current = targets.get(name) ?? { prerequisites: [], recipe: [] };
    current.prerequisites.push(
      ...prerequisites.split(/\s+/).filter((word) => word !== ""),
    );
    targets.set(name, current);
  }

  return targets;
}

/** Every target `gate` reaches, itself included. */
function reachable(targets: Map<string, Target>, from: string): string[] {
  const reached: string[] = [];
  const pending = [from];

  while (pending.length > 0) {
    const name = pending.pop()!;
    if (reached.includes(name)) continue;
    reached.push(name);
    pending.push(...(targets.get(name)?.prerequisites ?? []));
  }

  return reached;
}

const targets = readTargets(readFileSync(MAKEFILE, "utf8"));

/** The target as the Makefile writes it, or a failure naming what is missing. */
function target(name: string): Target {
  const found = targets.get(name);
  if (!found) throw new Error(`the Makefile has no '${name}' target`);
  return found;
}

/** The message the integration tier gives when no URL is set. */
function missingUrlMessage(): string {
  try {
    resolveIntegrationTarget({});
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("resolveIntegrationTarget({}) was expected to throw");
}

/** What a recipe's `echo` lines would print, in order. */
function echoed(recipe: string[]): string {
  return recipe
    .flatMap((line) => [...line.matchAll(/echo\s+"([^"]*)"/g)].map((m) => m[1]))
    .join("\n");
}

/**
 * Run `make` with these arguments and no inherited URL, so a variable set in
 * the shell running the suite cannot answer for the one under test.
 */
function make(...args: string[]) {
  const env = { ...process.env };
  for (const name of [INTEGRATION_URL_VAR, STAGING_URL_VAR, "PROD_URL"]) {
    delete env[name];
  }
  const run = spawnSync("make", ["--no-print-directory", ...args], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe("the integration target", () => {
  it("has the guard and the dependency install ahead of its own command", () => {
    // In order: a missing URL is answered before the install, which is
    // answered before the tests. Swapping these is the failure this pins.
    expect(target("integration").prerequisites).toEqual([
      "check-integration-url",
      "ci-install",
    ]);
  });

  it("runs the integration suite, not the gate's", () => {
    expect(target("integration").recipe.join("\n")).toContain(
      "npm run test:integration",
    );
  });

  it("says in one line how to run itself when no URL is set", () => {
    const message = missingUrlMessage();

    // Both names, so a caller using either is told about the other.
    expect(message).toContain(INTEGRATION_URL_VAR);
    expect(message).toContain(STAGING_URL_VAR);
    expect(message).not.toContain("\n");
    // The shell guard has to answer before node_modules exists, so it cannot
    // read the TypeScript below; this is what keeps the two copies one message.
    expect(echoed(target("check-integration-url").recipe)).toBe(message);
  });

  it("refuses to run with neither name set, and accepts either one", () => {
    const refused = make("check-integration-url");
    expect(refused.status).not.toBe(0);
    expect(refused.output.split("\n")[0]).toBe(missingUrlMessage());

    for (const name of [INTEGRATION_URL_VAR, STAGING_URL_VAR]) {
      const accepted = make("check-integration-url", `${name}=https://x.test`);
      expect(accepted.status, name).toBe(0);
    }
  });
});

describe("the integration-prod target", () => {
  it("has its guard and the dependency install ahead of the run", () => {
    expect(target("integration-prod").prerequisites).toEqual([
      "check-integration-prod-url",
      "ci-install",
    ]);
  });

  it("runs the same suite as integration, pointed at PROD_URL", () => {
    const recipe = target("integration-prod").recipe.join("\n");

    expect(recipe).toContain("npm run test:integration");
    expect(recipe).toContain(`${INTEGRATION_URL_VAR}="$(PROD_URL)"`);
  });

  it("hands the suite PROD_URL as INTEGRATION_URL and passes EXPECT_SHA on", () => {
    // A dry run prints the recipe without running the guard or the install.
    const dry = make(
      "-n",
      "integration-prod",
      "PROD_URL=https://prod.example.test",
      "EXPECT_SHA=abc1234",
    );

    expect(dry.status).toBe(0);
    expect(dry.output).toContain(
      'INTEGRATION_URL="https://prod.example.test" npm run test:integration',
    );
  });

  it("refuses a run with no PROD_URL, before it installs anything", () => {
    const run = make("integration-prod");

    expect(run.status).not.toBe(0);
    expect(run.output).toContain("PROD_URL is not set");
    expect(run.output).not.toMatch(/npm ci|npm run/);
  });

  it("refuses a URL that names staging, whatever its case", () => {
    for (const url of [
      "https://fractals-nextjs-staging-abc.run.app",
      "https://FRACTALS-STAGING.example.test/",
    ]) {
      const run = make("integration-prod", `PROD_URL=${url}`);

      expect(run.status, url).not.toBe(0);
      expect(run.output, url).toContain("names staging");
      expect(run.output, url).not.toMatch(/npm ci|npm run/);
    }
  });

  it("lets a production URL through its guard", () => {
    const run = make(
      "check-integration-prod-url",
      "PROD_URL=https://fractals-nextjs-prod-abc.run.app",
    );

    expect(run.status).toBe(0);
  });
});

describe("the smoke target", () => {
  it("runs the read-only script against the URL it was given", () => {
    expect(target("smoke").recipe.join("\n")).toContain(
      'scripts/smoke.sh --url "$(PROD_URL)"',
    );
  });

  it("names the URL PROD_URL, ahead of the run", () => {
    // The hourly prod check runs `make smoke PROD_URL=<url>` and devops' app
    // readiness check reads the Makefile for a variable named for the
    // environment, so the variable is the target's, not the script's. The
    // guard is a prerequisite, as check-staging-url is on `integration`: a run
    // handed no URL is refused before the script is reached, with the name the
    // caller was given.
    expect(target("smoke").prerequisites).toEqual(["check-prod-url"]);
  });
});

describe("the gate", () => {
  it("installs its own dependencies", () => {
    expect(target("gate").prerequisites).toEqual([
      "ci-install",
      "check",
      "build",
      "test",
    ]);
  });

  it("reaches no tier that needs a deployment, however the chain is written", () => {
    const reached = reachable(targets, "gate");

    expect(reached).not.toContain("integration");
    expect(reached).not.toContain("integration-prod");
    expect(reached).not.toContain("check-integration-url");
    expect(reached).not.toContain("check-integration-prod-url");
    expect(reached).not.toContain("check-prod-url");
    // `smoke` calls a service like `integration` does. Its own checks run in
    // the suite against a stand-in on this machine, which is not the same
    // thing as the gate needing a deployment to pass.
    expect(reached).not.toContain("smoke");
  });
});

/** The stamp npm writes into node_modules on every install. */
const STAMP = "node_modules/.package-lock.json";

describe("dependencies install themselves", () => {
  it("has a deps target that needs the install stamp, and the stamp needs the lockfile", () => {
    expect(target("deps").prerequisites).toEqual([STAMP]);
    expect(target(".PHONY").prerequisites).toContain("deps");
    expect(target(STAMP).prerequisites).toEqual(["package-lock.json"]);
    expect(target(STAMP).recipe).toContain("npm ci");
  });

  it("is taken by the targets an agent runs before it submits, and by presubmit through them", () => {
    for (const name of ["lint", "typecheck", "build", "test"]) {
      expect(target(name).prerequisites, name).toContain("deps");
    }
    for (const from of ["check", "presubmit", "gate"]) {
      expect(reachable(targets, from), from).toContain("deps");
    }
  });

  it("leaves the gate's own install alone, and the deployed tiers and docker out of it", () => {
    expect(target("ci-install").recipe).toEqual(["npm ci"]);
    expect(target("ci-install").prerequisites).toEqual([]);
    // The gate's install comes first, so the stamp is fresh when `check` runs.
    expect(target("gate").prerequisites.indexOf("ci-install")).toBe(0);

    for (const name of [
      "integration",
      "integration-prod",
      "smoke",
      "test-docker",
    ]) {
      expect(reachable(targets, name), name).not.toContain("deps");
    }
  });
});

describe("make decides to install from the lockfile and the stamp", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  /**
   * A directory with the Makefile and a package-lock.json, and the stamp if
   * `stamp` is a time. File times are set outright, so the answer does not
   * depend on how fast the files were written or on the filesystem's clock.
   */
  function tree(lockfile: Date, stamp?: Date): string {
    const dir = mkdtempSync(join(tmpdir(), "fractals-make-"));
    dirs.push(dir);
    copyFileSync(MAKEFILE, join(dir, "Makefile"));
    writeFileSync(join(dir, "package-lock.json"), "{}\n");
    utimesSync(join(dir, "package-lock.json"), lockfile, lockfile);
    if (stamp) {
      mkdirSync(join(dir, "node_modules"));
      writeFileSync(join(dir, STAMP), "{}\n");
      utimesSync(join(dir, STAMP), stamp, stamp);
    }
    return dir;
  }

  /** How many times a dry run of `make lint` would run `npm ci`. */
  function installs(dir: string): number {
    const run = spawnSync("make", ["--no-print-directory", "-n", "lint"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(run.status, run.stderr).toBe(0);
    return run.stdout.split("\n").filter((line) => line === "npm ci").length;
  }

  const OLD = new Date("2026-01-01T00:00:00Z");
  const NEW = new Date("2026-01-01T00:01:00Z");

  it("installs once in a fresh checkout with no node_modules", () => {
    expect(installs(tree(OLD))).toBe(1);
  });

  it("installs once when the lockfile is newer than what is installed", () => {
    expect(installs(tree(NEW, OLD))).toBe(1);
  });

  it("installs nothing when what is installed is newer than the lockfile", () => {
    expect(installs(tree(OLD, NEW))).toBe(0);
  });
});
