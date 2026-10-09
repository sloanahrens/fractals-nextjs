import { describe, expect, it } from "vitest";

import { describeVersion, readVersionInfo, type VersionInfo } from "../version";

// A moment in Chicago's daylight time, so the zone abbreviation in the line is
// the one the summer clock uses. 00:14Z is 19:14 CDT the evening before.
const DEPLOYED_AT = "2026-10-09T00:14:00.000Z";
const DEPLOYED_LABEL = "2026-10-08 19:14 CDT";

const NOW = new Date("2026-10-09T03:14:00.000Z"); // three hours later

/** An info object with everything missing, so a test sets only what it needs. */
function info(overrides: Partial<VersionInfo> = {}): VersionInfo {
  return {
    builtAt: null,
    deployedAt: null,
    commit: null,
    revision: null,
    ...overrides,
  };
}

describe("readVersionInfo", () => {
  it("reads the four values the deployment leaves behind", () => {
    expect(
      readVersionInfo({
        NEXT_PUBLIC_BUILD_TIME: "2026-10-08T19:10:00Z",
        DEPLOYED_AT: "2026-10-09T00:14:00Z",
        GIT_SHA: "abc1234def5678901234567890123456789012",
        K_REVISION: "fractals-nextjs-00007-abc",
      }),
    ).toEqual({
      // Re-serialised, so a value without milliseconds still leaves as ISO.
      builtAt: "2026-10-08T19:10:00.000Z",
      deployedAt: "2026-10-09T00:14:00.000Z",
      commit: "abc1234def5678901234567890123456789012",
      revision: "fractals-nextjs-00007-abc",
    });
  });

  it("is null for every value the environment does not provide", () => {
    expect(readVersionInfo({})).toEqual({
      builtAt: null,
      deployedAt: null,
      commit: null,
      revision: null,
    });
  });

  it("is null for a value that is not shaped like what it claims to be", () => {
    const read = readVersionInfo({
      NEXT_PUBLIC_BUILD_TIME: "garbage",
      DEPLOYED_AT: "not a date either",
      GIT_SHA: "not-hex",
      K_REVISION: "Fractals NextJS/1",
    });

    expect(read).toEqual({
      builtAt: null,
      deployedAt: null,
      commit: null,
      revision: null,
    });
  });

  it("wants a commit id of sha length and nothing shorter", () => {
    expect(readVersionInfo({ GIT_SHA: "abc123" }).commit).toBeNull(); // six
    expect(readVersionInfo({ GIT_SHA: "abc1234" }).commit).toBe("abc1234");
    expect(readVersionInfo({ GIT_SHA: "a".repeat(41) }).commit).toBeNull();
  });

  it("reads only the four variables it names", () => {
    const read = readVersionInfo({
      DEPLOYED_AT: DEPLOYED_AT,
      SECRET_TOKEN: "do-not-echo",
      GIT_SHA_SECRET: "do-not-echo",
    });

    expect(Object.keys(read).sort()).toEqual([
      "builtAt",
      "commit",
      "deployedAt",
      "revision",
    ]);
    expect(JSON.stringify(read)).not.toContain("do-not-echo");
  });
});

describe("describeVersion", () => {
  it("prefers the deploy time and says which it is", () => {
    const label = describeVersion(
      info({
        builtAt: "2026-10-08T19:10:00.000Z",
        deployedAt: DEPLOYED_AT,
      }),
      NOW,
      "America/Chicago",
    );

    expect(label.text).toBe(`Deployed ${DEPLOYED_LABEL} (3 h ago)`);
    expect(label.title).toBe(DEPLOYED_AT);
  });

  it("falls back to the build time when there was no deploy stamp", () => {
    const label = describeVersion(
      info({ builtAt: DEPLOYED_AT }),
      NOW,
      "America/Chicago",
    );

    expect(label.text).toBe(`Built ${DEPLOYED_LABEL} (3 h ago)`);
  });

  it("says nothing when it has neither time", () => {
    expect(describeVersion(info(), NOW).text).toBe("");
    expect(describeVersion(info({ commit: "abc1234" }), NOW).text).toBe("");
  });

  it("titles the line with the full UTC time", () => {
    const label = describeVersion(info({ deployedAt: DEPLOYED_AT }), NOW);

    expect(label.title).toBe("2026-10-09T00:14:00.000Z");
  });

  it("shows the commit as its first seven characters", () => {
    const label = describeVersion(
      info({ deployedAt: DEPLOYED_AT, commit: "abc1234def5678901" }),
      NOW,
      "America/Chicago",
    );

    expect(label.text).toBe(`Deployed ${DEPLOYED_LABEL} (3 h ago) · abc1234`);
  });

  it("leaves the commit out when there is not one", () => {
    const label = describeVersion(
      info({ deployedAt: DEPLOYED_AT }),
      NOW,
      "America/Chicago",
    );

    expect(label.text).not.toContain("·");
  });

  it("counts the age in the largest whole unit that fits", () => {
    const elapsed = (ms: number) =>
      describeVersion(
        info({ deployedAt: DEPLOYED_AT }),
        new Date(Date.parse(DEPLOYED_AT) + ms),
      ).text;

    expect(elapsed(59_000)).toContain("(just now)");
    expect(elapsed(60_000)).toContain("(1 min ago)");
    expect(elapsed(59 * 60_000)).toContain("(59 min ago)");
    expect(elapsed(60 * 60_000)).toContain("(1 h ago)");
    expect(elapsed(23 * 60 * 60_000)).toContain("(23 h ago)");
    expect(elapsed(24 * 60 * 60_000)).toContain("(1 d ago)");
    expect(elapsed(72 * 60 * 60_000)).toContain("(3 d ago)");
  });

  it("reads a clock running ahead of the deploy as just now", () => {
    // The reader's clock is a minute behind the deploy's; the line should not
    // become "-1 min ago".
    const before = new Date(Date.parse(DEPLOYED_AT) - 60_000);

    expect(
      describeVersion(info({ deployedAt: DEPLOYED_AT }), before).text,
    ).toContain("(just now)");
  });
});
