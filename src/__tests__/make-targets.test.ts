/**
 * `make integration` installs what it needs, and the gate still does not run it
 *
 * The staging workflow checks the repository out fresh and runs `make
 * integration` as its one command. `make gate` installs first (`ci-install`),
 * but the integration target did not, so that first real run died on `sh: 1:
 * vitest: not found` and never reached the deployment it exists to check. The
 * two facts that keep it working are in the Makefile and nowhere else, so this
 * reads the Makefile: `integration` takes `ci-install` as a prerequisite, and
 * no path through `gate` reaches the integration tier.
 *
 * The suite runs in Node with no shell of its own, so this parses the Makefile
 * rather than shelling out to `make -n`. Prerequisites are what `make` runs
 * before a target's recipe, in the order written, which is what makes the dry
 * run print `npm ci` ahead of `npm run test:integration`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  STAGING_URL_VAR,
  resolveIntegrationTarget,
} from "@/lib/integrationTarget";

// `import.meta.url` is this file: src/__tests__/, so ".." twice is the root.
const MAKEFILE = fileURLToPath(new URL("../../Makefile", import.meta.url));

/** One rule in the Makefile: what it needs, and what it runs. */
interface Target {
  prerequisites: string[];
  recipe: string[];
}

/** A rule line: `name: prerequisites`, but not a `:=` assignment. */
const RULE = /^([A-Za-z0-9_.-]+)\s*:(?!=)\s*(.*)$/;

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

/** The message the integration tier gives for a missing STAGING_URL. */
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

describe("the integration target", () => {
  it("has the guard and the dependency install ahead of its own command", () => {
    // In order: a missing STAGING_URL is answered before the install, which is
    // answered before the tests. Swapping these is the failure this pins.
    expect(target("integration").prerequisites).toEqual([
      "check-staging-url",
      "ci-install",
    ]);
  });

  it("runs the integration suite, not the gate's", () => {
    expect(target("integration").recipe.join("\n")).toContain(
      "npm run test:integration",
    );
  });

  it("still says how to run itself when STAGING_URL is missing", () => {
    const message = missingUrlMessage();

    expect(message).toContain(STAGING_URL_VAR);
    // The shell guard has to answer before node_modules exists, so it cannot
    // read the TypeScript below; this is what keeps the two copies one message.
    expect(echoed(target("check-staging-url").recipe)).toBe(message);
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

  it("reaches no integration tier, however the chain is written", () => {
    const reached = reachable(targets, "gate");

    expect(reached).not.toContain("integration");
    expect(reached).not.toContain("check-staging-url");
  });
});
