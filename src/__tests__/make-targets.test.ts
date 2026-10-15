/**
 * `make integration` installs what it needs, and the gate still does not run it
 *
 * The staging workflow runs `make integration` in a fresh checkout, so the
 * target takes `ci-install` as a prerequisite, and no path through `gate`
 * reaches the integration tier. Both facts live in the Makefile and nowhere
 * else, so this parses it rather than shelling out to `make -n`.
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

describe("the smoke target", () => {
  it("runs the read-only script against the URL it was given", () => {
    expect(target("smoke").recipe.join("\n")).toContain(
      'scripts/smoke.sh --url "$(URL)"',
    );
  });

  it("has no prerequisite, so a missing URL is answered by the script", () => {
    // Unlike `integration`, there is nothing to install ahead of the run: a
    // guard target here would be a second copy of the script's own refusal.
    expect(target("smoke").prerequisites).toEqual([]);
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
    expect(reached).not.toContain("check-staging-url");
    // `smoke` calls a service like `integration` does. Its own checks run in
    // the suite against a stand-in on this machine, which is not the same
    // thing as the gate needing a deployment to pass.
    expect(reached).not.toContain("smoke");
  });
});
