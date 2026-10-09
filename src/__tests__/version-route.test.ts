import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/api/version/route";

/** The four the route is allowed to read, and nothing besides. */
const VERSION_KEYS = ["builtAt", "commit", "deployedAt", "revision"];

async function versionBody(): Promise<Record<string, unknown>> {
  const response = await GET();
  return (await response.json()) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/version", () => {
  it("answers 200 with JSON", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("reports each value the deployment left in the environment", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "2026-10-08T19:10:00Z");
    vi.stubEnv("DEPLOYED_AT", "2026-10-09T00:14:30Z");
    vi.stubEnv("GIT_SHA", "abc1234def5678901234567890123456789012");
    vi.stubEnv("K_REVISION", "fractals-nextjs-00007-abc");

    expect(await versionBody()).toEqual({
      builtAt: "2026-10-08T19:10:00.000Z",
      deployedAt: "2026-10-09T00:14:30.000Z",
      commit: "abc1234def5678901234567890123456789012",
      revision: "fractals-nextjs-00007-abc",
    });
  });

  it("is null for a value the environment does not have", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", undefined);
    vi.stubEnv("DEPLOYED_AT", undefined);
    vi.stubEnv("GIT_SHA", undefined);
    vi.stubEnv("K_REVISION", undefined);

    expect(await versionBody()).toEqual({
      builtAt: null,
      deployedAt: null,
      commit: null,
      revision: null,
    });
  });

  it("is null for a value that is not shaped like what it claims to be", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "");
    vi.stubEnv("DEPLOYED_AT", "garbage");
    vi.stubEnv("GIT_SHA", "not-hex");
    vi.stubEnv("K_REVISION", "Fractals NextJS/1");

    expect(await versionBody()).toEqual({
      builtAt: null,
      deployedAt: null,
      commit: null,
      revision: null,
    });
  });

  it("keeps a good value when a neighbour is unusable", async () => {
    vi.stubEnv("DEPLOYED_AT", "garbage");
    vi.stubEnv("GIT_SHA", "abc1234");
    vi.stubEnv("K_REVISION", "fractals-nextjs-00007-abc");

    expect(await versionBody()).toEqual({
      builtAt: null,
      deployedAt: null,
      commit: "abc1234",
      revision: "fractals-nextjs-00007-abc",
    });
  });

  it("reads no environment variable but the four it names", async () => {
    // A secret of any name, including one that looks like a version variable,
    // has no route into this response.
    vi.stubEnv("DEPLOYED_AT", "2026-10-09T00:14:30Z");
    vi.stubEnv("SECRET_TOKEN", "s3cr3t-do-not-echo");
    vi.stubEnv("GIT_SHA_SECRET", "s3cr3t-do-not-echo");

    const body = await versionBody();

    expect(Object.keys(body).sort()).toEqual(VERSION_KEYS);
    expect(JSON.stringify(body)).not.toContain("s3cr3t-do-not-echo");
  });
});
