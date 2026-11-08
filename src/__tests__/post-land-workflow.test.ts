/**
 * The post-land workflow: the text an operator copies, and what it must say
 *
 * The live workflow is committed by a human, separately from this test, so
 * this file pins the reviewed copy under `ci/` and compares the live copy to
 * it byte for byte when the live copy is there. The rig setting the workflow
 * feeds (`merge_queue.post_land_status_context`) lives outside the repository,
 * so no test here can read it; the header of the reviewed copy says what
 * renaming the workflow or the job would orphan.
 *
 * The workflow is read as text, because the suite runs in Node with no YAML
 * parser: each assertion says which line it needs, and the reader throws on a
 * file that has lost a section rather than reading it as empty.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// `import.meta.url` is this file: src/__tests__/, so ".." twice is the root.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WORKFLOW = join(ROOT, "ci/post-land.workflow.yml");
const LIVE_WORKFLOW = join(ROOT, ".forgejo/workflows/post-land.yml");

const SOURCE = readFileSync(WORKFLOW, "utf8");

/** A line's indent in spaces, or null for a blank or comment-only line. */
function indentOf(line: string): number | null {
  const trimmed = line.trimStart();
  if (trimmed === "" || trimmed.startsWith("#")) return null;
  return line.length - trimmed.length;
}

/**
 * The non-comment lines under a top-level `key:` line, up to the next
 * top-level key. A file with no such line throws, naming it, so a lost
 * section cannot read as an empty one.
 */
function section(source: string, key: string): string[] {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start === -1) {
    throw new Error(`the workflow has no top-level '${key}:' line`);
  }

  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const indent = indentOf(line);
    if (indent === null) continue;
    if (indent === 0) break;
    body.push(line);
  }
  return body;
}

/** The lines under `key:` at `depth` two-space levels, up to the next line at that depth or above. */
function block(lines: string[], key: string, depth: number): string[] {
  const pad = " ".repeat(depth * 2);
  const start = lines.findIndex((line) => line === `${pad}${key}:`);
  if (start === -1) {
    throw new Error(`the workflow has no '${pad}${key}:' line`);
  }

  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const indent = indentOf(line);
    if (indent === null) continue;
    if (indent <= pad.length) break;
    body.push(line);
  }
  return body;
}

/** The keys written at `depth` two-space levels in these lines, in order. */
function keysAt(lines: string[], depth: number): string[] {
  const pad = " ".repeat(depth * 2);
  const keys: string[] = [];
  for (const line of lines) {
    const key = /^\s*([A-Za-z0-9_.-]+):/.exec(line);
    if (key && indentOf(line) === pad.length) keys.push(key[1]);
  }
  return keys;
}

/** The trimmed `key: value` line in these lines, or null. */
function valueOf(lines: string[], key: string): string | null {
  for (const line of lines) {
    const match = new RegExp(`^\\s*${key}:\\s*(\\S.*)$`).exec(line);
    if (match) return match[1];
  }
  return null;
}

/**
 * Why the live copy is not this file byte for byte, or null when it is
 * absent or identical.
 *
 * An absent live copy is the state before the operator's human step (the
 * workflow-protect hook refuses an agent pushing there), so it is not a
 * mismatch. Only a missing file reads that way: any other read error throws,
 * because a copy that cannot be read is not the same thing as no copy.
 */
function liveCopyProblem(livePath: string): string | null {
  let live: Buffer;
  try {
    live = readFileSync(livePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  if (live.equals(readFileSync(WORKFLOW))) return null;

  return `${livePath} differs from ci/post-land.workflow.yml: the operator copies that file, so the two must be the same bytes`;
}

/** Read per test, so a renamed or lost section fails the test that names it. */
const jobs = () => section(SOURCE, "jobs");
const check = () => block(jobs(), "check", 1);

describe("the reviewed post-land workflow", () => {
  it("starts with the header an operator needs", () => {
    // The first line is a comment, and the header carries the one token an
    // operator cannot rename silently: the setting the status context feeds.
    expect(SOURCE.startsWith("#")).toBe(true);
    const lines = SOURCE.split("\n");
    const header = lines
      .slice(
        0,
        lines.findIndex((line) => !line.startsWith("#")),
      )
      .join("\n");
    expect(header).toContain("human step");
    expect(header).toContain("merge_queue.post_land_status_context");
  });

  it("is named post-land", () => {
    expect(SOURCE).toMatch(/^name: post-land$/m);
  });

  it("has exactly one job, keyed check", () => {
    expect(keysAt(jobs(), 1)).toEqual(["check"]);
  });

  it("runs on ci-base", () => {
    expect(valueOf(check(), "runs-on")).toBe("ci-base");
  });

  it("is triggered by a push to main and nothing else", () => {
    const trigger = section(SOURCE, "on");

    // One trigger, its one child is `branches`, and that child names main.
    expect(keysAt(trigger, 1)).toEqual(["push"]);
    expect(keysAt(block(trigger, "push", 1), 2)).toEqual(["branches"]);
    expect(valueOf(block(trigger, "push", 1), "branches")).toBe("[main]");
  });

  it("checks the repository out and runs the landing gate's own target", () => {
    expect(check().map((line) => line.trim())).toContain(
      "- uses: actions/checkout@v4",
    );
    expect(check().map((line) => line.trim())).toContain("- run: make gate");
  });

  it("bounds the run", () => {
    expect(valueOf(check(), "timeout-minutes")).toBe("15");
  });

  it("holds no concurrency block, at any level", () => {
    // A cancelled or replaced run would leave a false red or no status.
    expect(SOURCE).not.toMatch(/^\s*concurrency:/m);
  });

  it("holds no secret, env block or credential", () => {
    for (const forbidden of [
      /secrets\./,
      /^\s*env:/m,
      /^\s*with:/m,
      /\bpassword\b/i,
      /\bapi[_-]?key\b/i,
      /\btoken\b/i,
    ]) {
      expect(SOURCE, String(forbidden)).not.toMatch(forbidden);
    }
  });
});

describe("the live copy an operator commits", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it("is byte-identical to the reviewed copy when it is there", () => {
    const problem = liveCopyProblem(LIVE_WORKFLOW);

    // No live copy is the state until the operator's human step, and it is
    // not a mismatch: the reviewed copy above is all a tree without one can
    // be held to. A present copy that differs is the string above.
    expect(problem).toBeNull();
  });

  it("sees one changed byte as a difference, so the check is not a no-op", () => {
    // The real live copy is a human step, so exercise the same function on a
    // throwaway copy: identical bytes pass, and one extra byte at the end is
    // the drift the check exists to catch.
    const dir = mkdtempSync(join(tmpdir(), "fractals-post-land-"));
    dirs.push(dir);
    const livePath = join(dir, "post-land.yml");

    writeFileSync(livePath, SOURCE);
    expect(liveCopyProblem(livePath)).toBeNull();

    writeFileSync(livePath, `${SOURCE}\n`);
    expect(liveCopyProblem(livePath)).not.toBeNull();
  });
});
