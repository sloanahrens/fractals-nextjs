import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXPECT_SHA_VAR,
  STAGING_URL_VAR,
  requestUrl,
  resolveIntegrationTarget,
} from "../integrationTarget";

const STAGING = "https://fractals-nextjs-staging-example.run.app";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveIntegrationTarget", () => {
  it("reads the URL and the commit to expect", () => {
    expect(
      resolveIntegrationTarget({ STAGING_URL: STAGING, EXPECT_SHA: "abc1234" }),
    ).toEqual({ baseUrl: STAGING, expectSha: "abc1234" });
  });

  it("reads the process environment when given none", () => {
    vi.stubEnv(STAGING_URL_VAR, `${STAGING}/`);
    vi.stubEnv(EXPECT_SHA_VAR, undefined);

    expect(resolveIntegrationTarget()).toEqual({
      baseUrl: STAGING,
      expectSha: null,
    });
  });

  it("takes the trailing slashes off, so paths do not double them", () => {
    expect(
      resolveIntegrationTarget({ STAGING_URL: `${STAGING}//` }).baseUrl,
    ).toBe(STAGING);
  });

  it("has no commit to expect when none was given", () => {
    expect(resolveIntegrationTarget({ STAGING_URL: STAGING }).expectSha).toBe(
      null,
    );
    expect(
      resolveIntegrationTarget({ STAGING_URL: STAGING, EXPECT_SHA: "  " })
        .expectSha,
    ).toBe(null);
  });

  it("trims the values it does read", () => {
    expect(
      resolveIntegrationTarget({
        STAGING_URL: `  ${STAGING}\n`,
        EXPECT_SHA: " abc1234 ",
      }),
    ).toEqual({ baseUrl: STAGING, expectSha: "abc1234" });
  });

  it("refuses a missing or blank STAGING_URL, with the command to type", () => {
    for (const env of [{}, { STAGING_URL: "" }, { STAGING_URL: "  " }]) {
      expect(() => resolveIntegrationTarget(env)).toThrow(STAGING_URL_VAR);
      expect(() => resolveIntegrationTarget(env)).toThrow(
        /make integration STAGING_URL=/,
      );
    }
  });

  it("refuses a URL it cannot parse or call", () => {
    expect(() =>
      resolveIntegrationTarget({ STAGING_URL: "not a url" }),
    ).toThrow(/not a URL/);
    expect(() =>
      resolveIntegrationTarget({ STAGING_URL: "ftp://example.test" }),
    ).toThrow(/must be an http or https URL/);
    expect(() =>
      resolveIntegrationTarget({ STAGING_URL: "localhost:3000" }),
    ).toThrow(/must be an http or https URL/);
  });
});

describe("requestUrl", () => {
  it("joins a base and a path with one slash", () => {
    expect(requestUrl(STAGING, "/api/health")).toBe(`${STAGING}/api/health`);
    expect(requestUrl(`${STAGING}/`, "/api/health")).toBe(
      `${STAGING}/api/health`,
    );
    expect(requestUrl(STAGING, "api/health")).toBe(`${STAGING}/api/health`);
    expect(requestUrl(`${STAGING}/`, "api/health")).toBe(
      `${STAGING}/api/health`,
    );
  });

  it("leaves the root path a single slash", () => {
    expect(requestUrl(STAGING, "/")).toBe(`${STAGING}/`);
  });
});
