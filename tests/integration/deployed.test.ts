import { describe, expect, it } from "vitest";

import { requestUrl, resolveIntegrationTarget } from "@/lib/integrationTarget";
import { linkHref, metaContent } from "./html";
import { get } from "./http";

// Read once, while the suite is collected: a missing STAGING_URL fails the file
// with the command to type, instead of four checks that each cannot run.
const target = resolveIntegrationTarget();

const HEALTH = "/api/health";
const HOME = "/";
const VERSION = "/api/version";
// The social card src/app/layout.tsx points its metadata at, which the
// Dockerfile serves out of public/.
const CARD = "/og-card.png";

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

  it("names the card and the page's own url on the origin that served it", async () => {
    const html = await (await get(url(HOME))).text();
    const origin = new URL(target.baseUrl).origin;

    // Next writes the root url without its slash; either spelling is the origin.
    expect(metaContent(html, "og:url")?.replace(/\/$/, "")).toBe(origin);
    expect(metaContent(html, "og:image")).toBe(`${origin}${CARD}`);
    expect(metaContent(html, "twitter:image")).toBe(`${origin}${CARD}`);
  });

  it("serves the social card as a 1200x630 PNG under 300 KB", async () => {
    const response = await get(url(CARD));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(1, 4).toString("latin1")).toBe("PNG");
    // IHDR is the first chunk: width and height are big-endian u32s at 16 and 20.
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);
    expect(body.length).toBeLessThan(300 * 1024);
  });

  it("links the favicon and the touch icon from the page", async () => {
    const html = await (await get(url(HOME))).text();

    for (const rel of ["icon", "apple-touch-icon"]) {
      const href = linkHref(html, rel);
      expect(href, `no <link rel="${rel}"> in the head`).not.toBeNull();
      const response = await get(new URL(href as string, target.baseUrl).href);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
    }
  });
});
