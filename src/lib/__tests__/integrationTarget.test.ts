import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXPECT_SHA_VAR,
  INTEGRATION_URL_VAR,
  MISSING_URL_MESSAGE,
  STAGING_URL_VAR,
  requestUrl,
  resolveIntegrationTarget,
} from "../integrationTarget";

const STAGING = "https://fractals-nextjs-staging-example.run.app";
const PROD = "https://fractals-nextjs-prod-example.run.app";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveIntegrationTarget", () => {
  it("reads the URL and the commit to expect", () => {
    expect(
      resolveIntegrationTarget({
        INTEGRATION_URL: STAGING,
        EXPECT_SHA: "abc1234",
      }),
    ).toEqual({ baseUrl: STAGING, expectSha: "abc1234" });
  });

  it("still reads STAGING_URL, as an alias for INTEGRATION_URL", () => {
    expect(
      resolveIntegrationTarget({ STAGING_URL: STAGING, EXPECT_SHA: "abc1234" }),
    ).toEqual({ baseUrl: STAGING, expectSha: "abc1234" });
  });

  it("prefers INTEGRATION_URL when both names are set", () => {
    expect(
      resolveIntegrationTarget({ INTEGRATION_URL: PROD, STAGING_URL: STAGING })
        .baseUrl,
    ).toBe(PROD);
  });

  it("falls back to STAGING_URL when INTEGRATION_URL is blank", () => {
    expect(
      resolveIntegrationTarget({ INTEGRATION_URL: "  ", STAGING_URL: STAGING })
        .baseUrl,
    ).toBe(STAGING);
  });

  it("returns the commit to expect, so a prod run can prove the release", () => {
    expect(
      resolveIntegrationTarget({ INTEGRATION_URL: PROD, EXPECT_SHA: "0123abc" })
        .expectSha,
    ).toBe("0123abc");
  });

  it("reads the process environment when given none", () => {
    vi.stubEnv(INTEGRATION_URL_VAR, undefined);
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

  it("refuses a missing or blank URL in one line naming both variables", () => {
    expect(MISSING_URL_MESSAGE).not.toContain("\n");
    expect(MISSING_URL_MESSAGE).toContain(INTEGRATION_URL_VAR);
    expect(MISSING_URL_MESSAGE).toContain(STAGING_URL_VAR);

    for (const env of [
      {},
      { STAGING_URL: "" },
      { STAGING_URL: "  " },
      { INTEGRATION_URL: " ", STAGING_URL: "" },
    ]) {
      expect(() => resolveIntegrationTarget(env)).toThrow(MISSING_URL_MESSAGE);
    }
  });

  it("names the variable that held an unusable URL", () => {
    expect(() =>
      resolveIntegrationTarget({ INTEGRATION_URL: "not a url" }),
    ).toThrow(/INTEGRATION_URL is not a URL/);
    expect(() =>
      resolveIntegrationTarget({ STAGING_URL: "not a url" }),
    ).toThrow(/STAGING_URL is not a URL/);
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
