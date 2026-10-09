/**
 * What the running deployment can say about itself: when it was built, when it
 * was deployed, and which revision is answering. Every field is null when the
 * app has no value for it, or when the value it has is not shaped like what it
 * claims to be — a footer reading "Deployed garbage" is worse than one that
 * says nothing at all.
 */
export interface VersionInfo {
  /** When the image was built, baked in by next.config.js at `next build`. */
  builtAt: string | null;
  /** When this revision went live, from the deploy's DEPLOYED_AT. */
  deployedAt: string | null;
  /** The commit the image was built from, from GIT_SHA. */
  commit: string | null;
  /** The revision serving the request, from Cloud Run's K_REVISION. */
  revision: string | null;
}

/** The footer line `describeVersion` builds. */
export interface VersionLabel {
  /** The text to show; empty when there is nothing the app can vouch for. */
  text: string;
  /** The full UTC ISO time, for the element's title. */
  title: string;
}

/** A commit id, as a git short sha or the full 40-character object name. */
const COMMIT_ID = /^[0-9a-fA-F]{7,40}$/;

/** A Cloud Run revision name, e.g. fractals-nextjs-00007-abc. */
const REVISION_NAME = /^[a-z0-9-]{1,100}$/;

/** How much of a commit id the footer shows. */
const COMMIT_DISPLAY_LENGTH = 7;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A timestamp that parses, re-serialised as UTC ISO so what leaves here has
 * one shape; null for anything else, including a missing value.
 */
function parseTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Read the four values a deployment can leave behind, one environment
 * variable each. These four are the whole of what this reads, so no other
 * variable in the environment can reach the output.
 *
 * @param env - The environment to read; the process's own by default. A server
 *   caller should pass the values it wants, each read as `process.env.NAME` at
 *   its own call site: that expression is what the build replaces with the
 *   constants it baked in, and a default read here finds only what the running
 *   process was started with.
 * @returns What was found, with a null for every value that was not
 */
export function readVersionInfo(
  env: Record<string, string | undefined> = process.env,
): VersionInfo {
  const sha = env.GIT_SHA;
  const revision = env.K_REVISION;
  return {
    builtAt: parseTimestamp(env.NEXT_PUBLIC_BUILD_TIME),
    deployedAt: parseTimestamp(env.DEPLOYED_AT),
    commit: sha && COMMIT_ID.test(sha) ? sha : null,
    revision: revision && REVISION_NAME.test(revision) ? revision : null,
  };
}

/**
 * The stamp in the viewer's own time, as `YYYY-MM-DD HH:MM ZONE`. The parts
 * are picked out by name rather than joined in a locale's own order, so the
 * line reads the same whatever the viewer's locale does with dates.
 *
 * @param stamp - An ISO timestamp
 * @param timeZone - IANA zone to render in; the machine's own when omitted
 */
function formatLocalTime(stamp: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(new Date(stamp));

  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")} ${part("timeZoneName")}`;
}

/**
 * How long ago the stamp was, in the largest whole unit that fits: minutes,
 * hours or days. Under a minute is "just now", and so is a stamp in the
 * future — a clock a few seconds ahead of the deploy's should not read as
 * "-1 min ago".
 */
function formatAge(stamp: string, now: Date): string {
  const elapsed = now.getTime() - Date.parse(stamp);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  return `${Math.floor(elapsed / DAY)} d ago`;
}

/**
 * The footer line for `info`, as read at `now`:
 * `Deployed 2026-10-08 19:14 CDT (3 h ago) · abc1234`.
 *
 * A deploy time is what the app prefers: a build time alone still dates the
 * code, but a revision that was rolled back would make "Built" the wrong
 * answer, so DEPLOYED_AT wins whenever it is there. With neither, there is
 * nothing true to say and the text is empty, which is the footer's cue to
 * render nothing.
 *
 * @param info - What the app knows about itself
 * @param now - The clock the age is measured against
 * @param timeZone - IANA zone for the shown time; the viewer's when omitted
 * @returns The line and its full UTC time
 */
export function describeVersion(
  info: VersionInfo,
  now: Date,
  timeZone?: string,
): VersionLabel {
  const stamp = info.deployedAt ?? info.builtAt;
  if (!stamp || Number.isNaN(Date.parse(stamp))) return { text: "", title: "" };

  const line = [
    `${info.deployedAt ? "Deployed" : "Built"} ${formatLocalTime(stamp, timeZone)} (${formatAge(stamp, now)})`,
  ];
  // The commit is a label on the same facts, not a second sentence, so it
  // joins the line rather than starting one.
  const commit = info.commit?.slice(0, COMMIT_DISPLAY_LENGTH);
  if (commit) line.push(commit);

  return { text: line.join(" · "), title: new Date(stamp).toISOString() };
}
