/**
 * The repository hygiene scanner.
 *
 * It walks a list of tracked files (never a directory), reports a finding by
 * path, line and rule, and never repeats the matched text: the text is the
 * thing the scan exists to keep out. Blocked names are held only as SHA-256
 * hashes of lower-case words, in `blocked.sha256` beside this file, so the
 * repository holds no plaintext name. Excuses are line-scoped entries in
 * `allow.tsv`; a tracked binary is excused by path alone, because binary
 * content is never scanned.
 *
 * The shape rules are the ones the cleanup bead names: a home-directory path
 * (`/Users/<name>`, `/home/<name>`), an email-shaped string, and a tracked file
 * whose bytes hold a NUL. A word is a maximal run of Unicode letters and
 * digits, so a hypothetical blocked word `zebra` is held by `crew/zebra` and
 * `zebra-7fc`, and not by `zebra2x`. The blocked-word rule also reads a
 * tracked path's own name: a path holding a blocked word is one finding at
 * line 0, with the word masked, and no allow row excuses it.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The rule names a finding can carry. */
export const BLOCKED_WORD_RULE = "blocked word";
export const HOME_PATH_RULE = "home path";
export const EMAIL_RULE = "email";
export const BINARY_FILE_RULE = "binary file";

/** Reads a repository-relative path. */
export interface FileSystem {
  readFile(path: string): Buffer;
}

/**
 * The text a blocked word becomes wherever a report prints a path. It stands
 * in for the word in a finding's path, so the report never repeats the word.
 */
export const MASKED_WORD = "[blocked]";

/**
 * One report: what, where, and which rule. It never carries the text. A
 * finding about the path's own name has line 0, and its path is the masked
 * name.
 */
export interface Finding {
  path: string;
  line: number;
  rule: string;
}

/**
 * One excused line. `lineHash` is empty only for a file-scoped rule (the
 * binary rule); a line-scoped rule needs the hash of the exact line content,
 * and an empty path is refused because it would excuse the rule everywhere.
 */
export interface AllowEntry {
  path: string;
  rule: string;
  lineHash: string;
  reason: string;
}

/** A rule either inspects one line or the file's bytes as a whole. */
export interface Rule {
  name: string;
  scope: "line" | "file";
  fires?: (line: string, blocked: ReadonlySet<string>) => boolean;
}

/** The SHA-256 hex digest of a word, lower-cased first. */
export function HashWord(word: string): string {
  return createHash("sha256").update(word.toLowerCase()).digest("hex");
}

/**
 * The SHA-256 hex digest of one line of content, without its terminator. A
 * CRLF file is hashed on the line without the `\r`, the same normalization
 * `Scan` and `ValidateAllow` use, so a row survives a checkout on either
 * platform.
 */
export function HashLine(line: string): string {
  return createHash("sha256").update(line).digest("hex");
}

/**
 * Parses `blocked.sha256`: one 64-character lower-case hex digest per line,
 * with `#` comments and blank lines ignored. Anything else is refused, so a
 * malformed file fails instead of quietly excusing a name.
 */
export function LoadBlocked(text: string): Set<string> {
  const blocked = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (!/^[0-9a-f]{64}$/.test(trimmed)) {
      throw new Error(
        "blocked.sha256 holds a line that is not a lower-case SHA-256 digest",
      );
    }
    blocked.add(trimmed);
  }
  return blocked;
}

/**
 * Parses `allow.tsv`: `path<TAB>rule<TAB>line hash<TAB>reason`, with `#`
 * comments and blank lines ignored. The hash column is empty for the binary
 * rule. A row with the wrong number of columns is refused.
 */
export function LoadAllow(text: string): AllowEntry[] {
  const entries: AllowEntry[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.trim() === "" || line.startsWith("#")) return;
    const columns = line.split("\t");
    if (columns.length !== 4) {
      throw new Error(`allow.tsv row ${index + 1} does not hold four columns`);
    }
    entries.push({
      path: columns[0],
      rule: columns[1],
      lineHash: columns[2],
      reason: columns[3],
    });
  });
  return entries;
}

const WORD = /[\p{L}\p{Nd}]+/gu;
// A handle in a github.com URL path. The literal is assembled at run time so
// this source line is not itself an ssh-remote shape the email rule reports.
const GITHUB_HANDLE = new RegExp(
  "(?:github\\.com/|git@" + "github\\.com:)([\\p{L}\\p{Nd}_.-]+)",
  "gu",
);
const HOME_PATH = /\/(?:Users|home)\/[A-Za-z0-9_.-]+/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*/g;

const RESERVED_DOMAINS = ["example.com", "example.org", "example.net"];
const RESERVED_LAST_LABELS = new Set([
  "invalid",
  "example",
  "test",
  "localhost",
]);
// An image digest reference, `name@sha256:<hex>`, is not an address: the label
// after the at-sign is a hash algorithm, never a domain.
const DIGEST_LABELS = new Set(["sha1", "sha256", "sha512", "md5"]);

/**
 * The ranges that hold a github.com handle on this line. A blocked word inside
 * one is excused by class 3 (an import path or package URL names the handle
 * and must not change); a name, an email or a home path anywhere else on the
 * same line is still a finding.
 */
function githubHandleRanges(line: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of line.matchAll(GITHUB_HANDLE)) {
    const handle = match[1];
    const start = (match.index ?? 0) + match[0].length - handle.length;
    ranges.push([start, start + handle.length]);
  }
  return ranges;
}

function blockedWordFires(
  line: string,
  blocked: ReadonlySet<string>,
): boolean {
  if (blocked.size === 0) return false;
  const excused = githubHandleRanges(line);
  for (const match of line.matchAll(WORD)) {
    if (!blocked.has(HashWord(match[0]))) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (excused.some(([from, to]) => start >= from && end <= to)) continue;
    return true;
  }
  return false;
}

/**
 * The path with each blocked word masked, or `undefined` when no word of the
 * path's own name is blocked. A word is hashed the same way a line's words are,
 * so `docs/<word>-notes.md` and `crew/<word>/readme.md` both hit.
 */
function maskedPathIfBlocked(
  path: string,
  blocked: ReadonlySet<string>,
): string | undefined {
  if (blocked.size === 0) return undefined;
  let hit = false;
  const masked = path.replace(WORD, (word) => {
    if (!blocked.has(HashWord(word))) return word;
    hit = true;
    return MASKED_WORD;
  });
  return hit ? masked : undefined;
}

function homePathFires(line: string): boolean {
  return HOME_PATH.test(line);
}

function domainExempt(domain: string): boolean {
  const lower = domain.toLowerCase();
  const labels = lower.split(".");
  if (RESERVED_LAST_LABELS.has(labels[labels.length - 1])) return true;
  for (const base of RESERVED_DOMAINS) {
    if (lower === base || lower.endsWith("." + base)) return true;
  }
  return lower === "gastown.local" || lower.endsWith(".gastown.local");
}

/** True for the character an ssh remote puts right after the colon. */
function isPathChar(ch: string): boolean {
  return /[A-Za-z0-9._~/-]/.test(ch);
}

/**
 * True when the match at `start` follows a `user:password@` userinfo in a URL
 * rather than reading as an address in prose.
 */
function inUrlUserinfo(line: string, start: number): boolean {
  if (start === 0 || line[start - 1] !== ":") return false;
  let tokenStart = start - 1;
  while (tokenStart > 0 && !/\s/.test(line[tokenStart - 1])) tokenStart -= 1;
  return line.slice(tokenStart, start).includes("://");
}

/**
 * An email-shaped string is a finding unless its domain is a reserved name
 * (whole labels), a gastown.local identity, or the whole match is a valid ssh
 * remote: user exactly `git`, a colon, then a path character.
 *
 * A candidate is email-shaped when the domain holds a dot, or when a colon
 * follows it (the ssh-remote shape). A bare `name@word` with neither is an
 * action reference such as `checkout@v4`, not an address.
 */
function emailFires(line: string): boolean {
  for (const match of line.matchAll(EMAIL)) {
    const start = match.index ?? 0;
    const text = match[0];
    const at = text.lastIndexOf("@");
    const user = text.slice(0, at);
    const domain = text.slice(at + 1);
    const after = start + text.length;
    const colonAfter = line[after] === ":";
    if (!domain.includes(".") && !colonAfter) continue;
    const lastLabel = domain.slice(domain.lastIndexOf(".") + 1);
    if (!domain.includes(".") && DIGEST_LABELS.has(lastLabel.toLowerCase())) {
      continue;
    }
    if (inUrlUserinfo(line, start)) continue;
    if (!/^[A-Za-z]/.test(lastLabel)) continue;
    if (user === "git" && colonAfter && isPathChar(line[after + 1] ?? "")) {
      continue;
    }
    if (domainExempt(domain)) continue;
    return true;
  }
  return false;
}

/** The rules a scan applies, in the order the bead names them. */
export function DefaultRules(): Rule[] {
  return [
    { name: BLOCKED_WORD_RULE, scope: "line", fires: blockedWordFires },
    { name: HOME_PATH_RULE, scope: "line", fires: homePathFires },
    { name: EMAIL_RULE, scope: "line", fires: emailFires },
    { name: BINARY_FILE_RULE, scope: "file" },
  ];
}

function isBinary(bytes: Buffer): boolean {
  return bytes.indexOf(0) !== -1;
}

function splitLines(bytes: Buffer): string[] {
  return bytes
    .toString("utf8")
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

function assertSafePath(path: string): void {
  if (path.startsWith("/") || path.includes("\0")) {
    throw new Error(`refusing an absolute or NUL-bearing path: ${path}`);
  }
  for (const segment of path.split("/")) {
    if (segment === "..") {
      throw new Error(`refusing a path with a parent segment: ${path}`);
    }
  }
}

/**
 * Reads a tracked file. A failure names `shown`, the path a report may print,
 * so the read error holds the same masked name as the file's findings.
 */
function readTracked(
  fsys: FileSystem,
  path: string,
  shown: string = path,
): Buffer {
  try {
    return fsys.readFile(path);
  } catch {
    throw new Error(`cannot read a tracked file: ${shown}`);
  }
}

/**
 * Scans `paths` through `fsys` and returns the findings no allow entry
 * excuses. A path whose own name holds a blocked word is one finding at line 0,
 * with the word masked, and no allow row excuses it. Every path is read in
 * full; a file with a NUL byte is a binary finding at line 1 and its content is
 * never hash-scanned. Every finding of such a file, and its read error, prints
 * the masked name; allow rows still match the real path.
 */
export function Scan(
  fsys: FileSystem,
  paths: readonly string[],
  rules: readonly Rule[],
  blocked: ReadonlySet<string>,
  allow: readonly AllowEntry[] = [],
): Finding[] {
  const findings: Finding[] = [];
  for (const path of [...paths].sort()) {
    assertSafePath(path);
    const maskedPath = maskedPathIfBlocked(path, blocked);
    const shown = maskedPath ?? path;
    if (maskedPath !== undefined) {
      findings.push({ path: shown, line: 0, rule: BLOCKED_WORD_RULE });
    }
    const bytes = readTracked(fsys, path, shown);
    if (isBinary(bytes)) {
      const excused = allow.some(
        (entry) => entry.path === path && entry.rule === BINARY_FILE_RULE,
      );
      if (!excused) findings.push({ path: shown, line: 1, rule: BINARY_FILE_RULE });
      continue;
    }
    splitLines(bytes).forEach((line, index) => {
      const lineHash = HashLine(line);
      for (const rule of rules) {
        if (rule.scope !== "line" || rule.fires === undefined) continue;
        if (!rule.fires(line, blocked)) continue;
        const excused = allow.some(
          (entry) =>
            entry.path === path &&
            entry.rule === rule.name &&
            entry.lineHash === lineHash,
        );
        if (!excused) findings.push({ path: shown, line: index + 1, rule: rule.name });
      }
    });
  }
  return findings;
}

/**
 * Refuses an allow list that cannot be trusted: an empty reason, an empty path
 * (a file-wide excuse), an unknown rule, a path that is not tracked, a line
 * hash for a file-scoped rule, a missing line hash for a line-scoped one, a
 * hash that matches no line, and a hash whose line no longer breaks the rule.
 * The last check is why a fixed line must drop its row: a row that no longer
 * fires is stale even while the line is still there.
 */
export function ValidateAllow(
  allow: readonly AllowEntry[],
  fsys: FileSystem,
  paths: readonly string[],
  rules: readonly Rule[],
  blocked: ReadonlySet<string>,
): void {
  const problems: string[] = [];
  const rulesByName = new Map(rules.map((rule) => [rule.name, rule]));
  const tracked = new Set(paths);
  allow.forEach((entry, index) => {
    const row = `allow row ${index + 1}`;
    if (entry.reason.trim() === "") problems.push(`${row}: empty reason`);
    if (entry.path === "") {
      problems.push(`${row}: empty path`);
      return;
    }
    const rule = rulesByName.get(entry.rule);
    if (rule === undefined) {
      problems.push(`${row}: unknown rule`);
      return;
    }
    if (!tracked.has(entry.path)) {
      problems.push(`${row}: path is not tracked`);
      return;
    }
    const bytes = readTracked(fsys, entry.path);
    if (rule.scope === "file") {
      if (entry.lineHash !== "") {
        problems.push(`${row}: a file-scoped rule takes no line hash`);
      }
      if (!isBinary(bytes)) {
        problems.push(`${row}: path holds no binary file (stale)`);
      }
      return;
    }
    if (entry.lineHash === "") {
      problems.push(`${row}: ${rule.name} needs a line hash, not a file excuse`);
      return;
    }
    if (isBinary(bytes)) {
      problems.push(`${row}: path holds a binary file`);
      return;
    }
    const line = splitLines(bytes).find(
      (candidate) => HashLine(candidate) === entry.lineHash,
    );
    if (line === undefined) {
      problems.push(`${row}: hash matches no line in the file`);
      return;
    }
    if (rule.fires === undefined || !rule.fires(line, blocked)) {
      problems.push(`${row}: stale, the rule no longer fires on the line`);
    }
  });
  if (problems.length > 0) {
    throw new Error("allowlist refused:\n" + problems.join("\n"));
  }
}

/** Reads tracked files from a checkout rooted at `root`. */
export function nodeFileSystem(root: string): FileSystem {
  return {
    readFile: (path: string) => readFileSync(join(root, path)),
  };
}

/** Reads tracked files from an in-memory set, for unit tests. */
export function memoryFileSystem(
  files: Readonly<Record<string, string | Buffer>>,
): FileSystem {
  return {
    readFile: (path: string) => {
      const file = files[path];
      if (file === undefined) throw new Error(`no such file: ${path}`);
      return typeof file === "string" ? Buffer.from(file, "utf8") : file;
    },
  };
}

/**
 * Finds the repository root by walking up from `start` to the directory that
 * holds `package.json`. It never looks for `.git`: a linked worktree has a
 * `.git` file, not a directory, and polecats and crew work in one.
 */
export function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`no package.json above: ${start}`);
    }
    dir = parent;
  }
}

/**
 * Lists the files a scan covers: tracked files plus untracked files that are
 * not ignored, so a name is caught before it is committed. It runs git with
 * `-z` so a path holding a newline stays one path.
 */
export function trackedFiles(root: string): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split("\0").filter((path) => path.length > 0);
}
