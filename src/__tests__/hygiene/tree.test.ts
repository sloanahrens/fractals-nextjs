/**
 * The tracked-file hygiene tests.
 *
 * `TestNoOperatorNameInTree` reads every tracked file through the filesystem
 * API and holds the repository to the rules. There is no result to cache:
 * vitest does not cache test results, so reading the tracked files on every
 * run is enough.
 *
 * The in-memory tests build their file sets in memory and never run git. The
 * linked-worktree test is the one that needs git: it builds its own repository
 * in a temporary directory, adds a linked worktree, and scans that, so a
 * `.git` file (which is what a linked worktree has) is exercised without ever
 * touching the real repository. When git is missing that test fails; it never
 * skips.
 *
 * Every planted string is assembled from pieces, so no source line of this
 * file forms an address or a blocked word the tree scan would report.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  type AllowEntry,
  BINARY_FILE_RULE,
  BLOCKED_WORD_RULE,
  DefaultRules,
  EMAIL_RULE,
  HashLine,
  HashWord,
  HOME_PATH_RULE,
  LoadAllow,
  LoadBlocked,
  Scan,
  ValidateAllow,
  findRepoRoot,
  memoryFileSystem,
  nodeFileSystem,
  trackedFiles,
} from "./hygiene";

/** This directory: src/__tests__/hygiene/. */
const HERE = fileURLToPath(new URL(".", import.meta.url));

/** Joins two pieces around an at-sign, so this file forms no address. */
function planted(a: string, b: string): string {
  return a + "@" + b;
}

/** Joins word pieces, so a planted blocked word is not spelled in the source. */
function words(...parts: string[]): string {
  return parts.join("");
}

/** The word every in-memory test plants, at run time only. */
function plantedWord(): string {
  return words("ze", "bra");
}

describe("tracked-file hygiene", () => {
  it("TestNoOperatorNameInTree", () => {
    const root = findRepoRoot(HERE);
    const paths = trackedFiles(root);
    const fsys = nodeFileSystem(root);
    const blocked = LoadBlocked(
      readFileSync(join(HERE, "blocked.sha256"), "utf8"),
    );
    const allow = LoadAllow(readFileSync(join(HERE, "allow.tsv"), "utf8"));
    const rules = DefaultRules();

    ValidateAllow(allow, fsys, paths, rules, blocked);

    expect(Scan(fsys, paths, rules, blocked, allow)).toEqual([]);
  });

  it("TestScanReportsFindings", () => {
    const word = plantedWord();
    const home = "/Users/" + words("no", "m");
    const email = planted("someone", "corp" + ".io");
    const fsys = memoryFileSystem({
      "a.txt": "clean\n" + word + "\n",
      "b.txt": "home " + home + "\n",
      "c.txt": "mail " + email + "\n",
      "d.bin": Buffer.from([0, 1, 2, 255]),
    });
    const paths = ["a.txt", "b.txt", "c.txt", "d.bin"];

    const findings = Scan(
      fsys,
      paths,
      DefaultRules(),
      new Set([HashWord(word)]),
    );

    expect(findings).toEqual([
      { path: "a.txt", line: 2, rule: BLOCKED_WORD_RULE },
      { path: "b.txt", line: 1, rule: HOME_PATH_RULE },
      { path: "c.txt", line: 1, rule: EMAIL_RULE },
      { path: "d.bin", line: 1, rule: BINARY_FILE_RULE },
    ]);
    // A finding names path, line and rule; it never repeats the text.
    const report = JSON.stringify(findings);
    expect(report).not.toContain(word);
    expect(report).not.toContain(home);
    expect(report).not.toContain(email);
  });

  it("TestTreeScanWorksInLinkedWorktree", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "hygiene-worktree-"));
    try {
      const main = join(sandbox, "main");
      const linked = join(sandbox, "linked");
      mkdirSync(main);
      // A minimal environment: the repository's own config is built here, and
      // the machine's global config (signing, identity) cannot change what the
      // commit contains.
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: join(sandbox, "gitconfig"),
      };
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: main, env, encoding: "utf8" });

      const word = plantedWord();
      const author = planted("hygiene", "example.invalid");
      git("init", "-q", "-b", "main");
      writeFileSync(join(main, "planted.txt"), "clean\n" + word + "\n");
      git("add", "-A");
      git(
        "-c",
        "user.name=hygiene",
        "-c",
        "user.email=" + author,
        "commit",
        "-q",
        "-m",
        "plant",
      );
      git("worktree", "add", "-q", "-b", "linked-branch", linked);

      const blocked = new Set([HashWord(word)]);
      const scan = (root: string) =>
        Scan(
          nodeFileSystem(root),
          trackedFiles(root),
          DefaultRules(),
          blocked,
        );

      const expected = [
        { path: "planted.txt", line: 2, rule: BLOCKED_WORD_RULE },
      ];
      expect(scan(main)).toEqual(expected);
      expect(scan(linked)).toEqual(expected);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("TestBlockedWordsWholeWord", () => {
    const word = plantedWord();
    const blocked = new Set([HashWord(word)]);
    const fires = (line: string) =>
      Scan(memoryFileSystem({ "f.txt": line }), ["f.txt"], DefaultRules(), blocked)
        .length;

    expect(fires("clean")).toBe(0);
    expect(fires(word.toUpperCase())).toBe(1);
    expect(fires(word + "2x")).toBe(0);
    expect(fires("x" + word)).toBe(0);
    expect(fires("crew/" + word)).toBe(1);
    expect(fires(word + "-7fc")).toBe(1);
  });

  it("TestAllowlistIsValid", () => {
    const word = plantedWord();
    const blocked = new Set([HashWord(word)]);
    const rules = DefaultRules();
    const files = {
      "f.txt": "clean\n" + word + "\n",
      "h.txt": "/Users/" + words("no", "m") + "\n",
      "b.bin": Buffer.from([0]),
    };
    const paths = Object.keys(files);
    const fsys = memoryFileSystem(files);
    const valid: AllowEntry = {
      path: "f.txt",
      rule: BLOCKED_WORD_RULE,
      lineHash: HashLine(word),
      reason: "a planted word, excused for this test",
    };

    expect(() => ValidateAllow([valid], fsys, paths, rules, blocked)).not.toThrow();

    const refused: Array<[AllowEntry, RegExp]> = [
      [{ ...valid, reason: "   " }, /empty reason/],
      [{ ...valid, path: "" }, /empty path/],
      [{ ...valid, rule: "no such rule" }, /unknown rule/],
      [{ ...valid, path: "missing.txt" }, /not tracked/],
      [{ ...valid, lineHash: "" }, /file excuse/],
      [
        {
          path: "h.txt",
          rule: HOME_PATH_RULE,
          lineHash: "",
          reason: "a file-wide home excuse",
        },
        /file excuse/,
      ],
      [{ ...valid, lineHash: HashLine("no such line") }, /matches no line/],
      [
        {
          path: "f.txt",
          rule: BINARY_FILE_RULE,
          lineHash: "",
          reason: "a text file is not a binary",
        },
        /holds no binary file/,
      ],
      [
        {
          path: "b.bin",
          rule: BLOCKED_WORD_RULE,
          lineHash: HashLine("anything"),
          reason: "a line rule cannot excise a binary",
        },
        /holds a binary file/,
      ],
    ];
    for (const [row, message] of refused) {
      expect(
        () => ValidateAllow([row], fsys, paths, rules, blocked),
        JSON.stringify(row),
      ).toThrow(message);
    }

    const binary: AllowEntry = {
      path: "b.bin",
      rule: BINARY_FILE_RULE,
      lineHash: "",
      reason: "a planted binary",
    };
    expect(() =>
      ValidateAllow([binary], fsys, paths, rules, blocked),
    ).not.toThrow();
    expect(() =>
      ValidateAllow([{ ...binary, lineHash: "abc" }], fsys, paths, rules, blocked),
    ).toThrow(/no line hash/);
  });

  it("TestLineExcuseCoversOnlyTheHandle", () => {
    const word = plantedWord();
    const blocked = new Set([HashWord(word)]);
    const email = planted("writer", "corp.io");
    const home = "/Users/" + words("no", "m");
    const line =
      "see github.com/" + word + " and " + word + " " + email + " " + home;

    const findings = Scan(
      memoryFileSystem({ "f.txt": line }),
      ["f.txt"],
      DefaultRules(),
      blocked,
    );

    // The handle word is excused; the prose word, the address and the home
    // path on the same line are each still a finding.
    expect(findings.map((finding) => finding.rule).sort()).toEqual(
      [BLOCKED_WORD_RULE, EMAIL_RULE, HOME_PATH_RULE].sort(),
    );
    expect(findings.every((finding) => finding.line === 1)).toBe(true);

    // The handle on its own is excused; without the excuse this line would be
    // a blocked-word finding.
    const onlyHandle = "see github.com/" + word;
    expect(
      Scan(
        memoryFileSystem({ "g.txt": onlyHandle }),
        ["g.txt"],
        DefaultRules(),
        blocked,
      ),
    ).toEqual([]);
  });

  it("TestAnAddressFollowedByAColonInProseIsAFinding", () => {
    const cases: Array<[string, boolean]> = [
      [planted("someone", "example.com"), false],
      [planted("someone", "sub.example.org"), false],
      [planted("someone", "host.invalid"), false],
      [planted("someone", "host.test"), false],
      [planted("someone", "host.example"), false],
      [planted("someone", "localhost"), false],
      [planted("someone", "mayor.gastown.local"), false],
      [planted("git", "host") + ":owner/repo", false],
      ["https://" + planted("user:password", "127.0.0.1") + "/x", false],
      // An image digest reference names an algorithm, not a domain.
      [planted("image", "sha256") + ":" + "abc123", false],
      [planted("someone", "notexample.com"), true],
      [planted("someone", "example.com.evil.io"), true],
      [planted("someone", "example.com-x.io"), true],
      [planted("someone", "x.invalid.io"), true],
      [planted("someone", "testing.io"), true],
      [planted("gitx", "host") + ":path", true],
      [planted("xgit", "host") + ":path", true],
      [planted("writer", "host") + ":path", true],
      [planted("git", "host") + ": prose", true],
      [planted("writer", "corp.io") + ":", true],
    ];

    for (const [line, expected] of cases) {
      const findings = Scan(
        memoryFileSystem({ "f.txt": line }),
        ["f.txt"],
        DefaultRules(),
        new Set(),
      );
      expect(
        findings.some((finding) => finding.rule === EMAIL_RULE),
        line,
      ).toBe(expected);
    }
  });

  it("TestAStaleRowForAFixedLineIsRefusedEvenWhenTheLineIsStillThere", () => {
    const fsys = memoryFileSystem({ "f.txt": "clean text\n" });
    const stale: AllowEntry = {
      path: "f.txt",
      rule: BLOCKED_WORD_RULE,
      lineHash: HashLine("clean text"),
      reason: "the word was removed but the row was not",
    };

    expect(() =>
      ValidateAllow(
        [stale],
        fsys,
        ["f.txt"],
        DefaultRules(),
        new Set([HashWord(plantedWord())]),
      ),
    ).toThrow(/stale/);
  });

  it("TestTrackedBinaryIsAFinding", () => {
    const word = plantedWord();
    const blocked = new Set([HashWord(word)]);
    const bytes = Buffer.concat([Buffer.from(word + "\n"), Buffer.from([0])]);
    const fsys = memoryFileSystem({ "img.png": bytes });

    expect(Scan(fsys, ["img.png"], DefaultRules(), blocked)).toEqual([
      { path: "img.png", line: 1, rule: BINARY_FILE_RULE },
    ]);
    // The word in the binary is never hash-scanned: the same bytes as a text
    // file are a blocked-word finding, and the binary is only a binary one.
    expect(
      Scan(
        memoryFileSystem({ "t.txt": word }),
        ["t.txt"],
        DefaultRules(),
        blocked,
      ),
    ).toEqual([{ path: "t.txt", line: 1, rule: BLOCKED_WORD_RULE }]);

    const allow: AllowEntry = {
      path: "img.png",
      rule: BINARY_FILE_RULE,
      lineHash: "",
      reason: "a reviewed image asset",
    };
    expect(Scan(fsys, ["img.png"], DefaultRules(), blocked, [allow])).toEqual([]);
  });
});
