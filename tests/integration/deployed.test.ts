import { describe, expect, it } from "vitest";

import { requestUrl, resolveIntegrationTarget } from "@/lib/integrationTarget";
import { get } from "./http";

// Read once, while the suite is collected: a missing STAGING_URL fails the file
// with the command to type, instead of four checks that each cannot run.
const target = resolveIntegrationTarget();

const HEALTH = "/api/health";
const HOME = "/";
const VERSION = "/api/version";
// The social preview src/app/layout.tsx points its metadata at, which the
// Dockerfile serves out of public/.
const PREVIEW = "/fractal-preview.png";

const url = (path: string) => requestUrl(target.baseUrl, path);

describe(`the deployment at ${target.baseUrl}`, () => {
  it("answers /api/health with healthy", async () => {
    const response = await get(url(HEALTH));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({ status: "healthy" });
  });

  it("serves the home page, its heading and its title", async () => {
    const response = await get(url(HOME));

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<h1[^>]*>\s*Fractal Explorer\s*<\/h1>/);
    expect(html).toMatch(
      /<title>\s*Next Fractals - Interactive Fractal Explorer\s*<\/title>/,
    );
  });

  it("reports the commit it is serving", async () => {
    const response = await get(url(VERSION));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as { commit?: unknown };
    expect(body).toHaveProperty("commit");

    if (target.expectSha) {
      expect(
        body.commit,
        `the deployment is not serving ${target.expectSha} (its commit is ${JSON.stringify(body.commit)}), so staging has not caught up with this build`,
      ).toBe(target.expectSha);
    }
  });

  it("serves the static asset the page's metadata needs", async () => {
    const response = await get(url(PREVIEW));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
  });
});
