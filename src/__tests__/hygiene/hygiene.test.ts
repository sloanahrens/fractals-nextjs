/**
 * Unit tests for the scanner's pieces: hashing, the two data-file parsers and
 * the root finder. They work on in-memory text and a temporary directory and
 * never run git; the tests that scan a file set, and the one that needs git,
 * live in tree.test.ts.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type AllowEntry,
  BLOCKED_WORD_RULE,
  DefaultRules,
  HashLine,
  HashWord,
  LoadAllow,
  LoadBlocked,
  MASKED_WORD,
  Scan,
  findRepoRoot,
  memoryFileSystem,
} from "./hygiene";

/** Joins word pieces, so a planted word is not spelled in the source. */
function words(...parts: string[]): string {
  return parts.join("");
}

/** The word the path tests plant, assembled at run time only. */
function plantedWord(): string {
  return words("ze", "bra");
}

describe("hygiene", () => {
  it("hashes a word lower-cased", () => {
    expect(HashWord("ZeBra")).toBe(HashWord(words("ze", "bra")));
    expect(HashWord("zebra")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes a line as it is, terminator excluded", () => {
    expect(HashLine("a b")).toBe(HashLine("a b"));
    expect(HashLine("a b")).not.toBe(HashLine("a  b"));
  });

  it("loads digests and ignores comments and blank lines", () => {
    const digest = HashWord("zebra");
    const blocked = LoadBlocked(
      ["# a comment", "", "  " + digest + "  "].join("\n"),
    );
    expect(blocked).toEqual(new Set([digest]));
  });

  it("refuses a blocked line that is not a lower-case digest", () => {
    expect(() => LoadBlocked("zebra")).toThrow();
    expect(() => LoadBlocked(HashWord("zebra").toUpperCase())).toThrow();
  });

  it("loads the four allow columns", () => {
    const entries = LoadAllow(
      ["# path\trule\thash\treason", "a.ts\temail\tdeadbeef\ta reason", ""].join(
        "\n",
      ),
    );
    expect(entries).toEqual([
      { path: "a.ts", rule: "email", lineHash: "deadbeef", reason: "a reason" },
    ]);
  });

  it("refuses an allow row without four columns", () => {
    expect(() => LoadAllow("a.ts\temail\tdeadbeef")).toThrow();
  });

  it("finds the root by package.json, not by a .git directory", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "hygiene-root-"));
    try {
      const nested = join(sandbox, "a", "b");
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(sandbox, "package.json"), "{}\n");
      expect(findRepoRoot(nested)).toBe(sandbox);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("refuses an unsafe path before reading it", () => {
    const fsys = memoryFileSystem({});
    expect(() =>
      Scan(fsys, ["../secret"], DefaultRules(), new Set()),
    ).toThrow(/parent segment/);
    expect(() =>
      Scan(fsys, ["/etc/passwd"], DefaultRules(), new Set()),
    ).toThrow(/absolute/);
  });

  it("fails when a listed file cannot be read", () => {
    expect(() =>
      Scan(memoryFileSystem({}), ["missing.txt"], DefaultRules(), new Set()),
    ).toThrow(/cannot read/);
  });

  it("refuses a tree with no package.json above it", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "hygiene-root-"));
    try {
      expect(() => findRepoRoot(sandbox)).toThrow();
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("finds a blocked word in a tracked path's own name, once per path", () => {
    const word = plantedWord();
    const blocked = new Set([HashWord(word)]);
    const notes = "docs/" + word + "-notes.md";
    const readme = "crew/" + word + "/readme.md";
    const fsys = memoryFileSystem({
      [notes]: "clean\n",
      [readme]: "clean\n",
      "docs/plain.md": "clean\n",
    });
    const paths = [notes, readme, "docs/plain.md"];

    const findings = Scan(fsys, paths, DefaultRules(), blocked);

    expect(findings).toEqual([
      { path: "crew/" + MASKED_WORD + "/readme.md", line: 0, rule: BLOCKED_WORD_RULE },
      { path: "docs/" + MASKED_WORD + "-notes.md", line: 0, rule: BLOCKED_WORD_RULE },
    ]);
    // The printed path masks the word; the word itself never reaches a report.
    expect(JSON.stringify(findings)).not.toContain(word);
  });

  it("matches a path word case-insensitively and whole-word only", () => {
    const word = plantedWord();
    const blocked = new Set([HashWord(word)]);
    const fires = (path: string) =>
      Scan(memoryFileSystem({ [path]: "clean\n" }), [path], DefaultRules(), blocked)
        .length;

    expect(fires("docs/" + word.toUpperCase() + ".md")).toBe(1);
    expect(fires("docs/" + word + "2x.md")).toBe(0);
    expect(fires("docs/x" + word + ".md")).toBe(0);
  });

  it("does not let an allow row excuse a blocked word in a path", () => {
    const word = plantedWord();
    const blocked = new Set([HashWord(word)]);
    const notes = "docs/" + word + "-notes.md";
    const fsys = memoryFileSystem({ [notes]: "clean\n" });
    const allow: AllowEntry = {
      path: notes,
      rule: BLOCKED_WORD_RULE,
      lineHash: HashLine("clean"),
      reason: "an attempt to excuse the path by a line row",
    };

    expect(Scan(fsys, [notes], DefaultRules(), blocked, [allow])).toEqual([
      { path: "docs/" + MASKED_WORD + "-notes.md", line: 0, rule: BLOCKED_WORD_RULE },
    ]);
  });
});
