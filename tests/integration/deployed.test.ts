import { describe, expect, it } from "vitest";

import { requestUrl, resolveIntegrationTarget } from "@/lib/integrationTarget";
import { decodeView, encodeView } from "@/lib/viewLink";
import { copyLinkUrl } from "@/lib/viewQuery";
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
// The image route: GET /api/og?<view link> draws that view as a 1200x630 PNG.
const OG = "/api/og";

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

  it("draws a view as a 1200x630 PNG at /api/og, and refuses what is not a view", async () => {
    const view = "v=1&f=mandelbrot&x=-0.75&y=0&z=1&s=classic&i=auto";

    const drawn = await get(url(`${OG}?${view}`));

    expect(drawn.status).toBe(200);
    expect(drawn.headers.get("content-type")).toContain("image/png");
    expect(drawn.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const body = Buffer.from(await drawn.arrayBuffer());
    expect(body.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);

    for (const bad of ["", "?v=1&x=banana", "?v=2&f=julia"]) {
      const refused = await get(url(`${OG}${bad}`));
      expect(refused.status, `${OG}${bad}`).toBe(400);
      await refused.body?.cancel();
    }
  });

  it("previews a query link as that view: og:image is /api/og for it, on the same origin", async () => {
    const origin = new URL(target.baseUrl).origin;
    const view = encodeView({
      fractalType: "julia",
      variant: "Dendrite",
      centerX: -0.5,
      centerY: 0.25,
      zoomLevel: 400,
      colorScheme: "fire",
      autoIterationsOn: true,
      canvasWidth: 800,
      canvasHeight: 600,
    });

    const html = await (await get(url(`${HOME}?${view}`))).text();
    const image = metaContent(html, "og:image");

    expect(image).toBe(`${origin}${OG}?${view}`);
    expect(metaContent(html, "twitter:image")).toBe(image);
    expect(metaContent(html, "og:url")).toBe(`${origin}/?${view}`);
    expect(html).toMatch(/<title>\s*Julia set, Dendrite, 400x - /);

    // The card the preview names is drawn, not a dead link.
    const drawn = await get(image as string);
    expect(drawn.status).toBe(200);
    expect(drawn.headers.get("content-type")).toContain("image/png");
    await drawn.body?.cancel();
  });

  it("serves the static card for a query that is not a view, and for no query", async () => {
    const origin = new URL(target.baseUrl).origin;
    const queries = [
      "",
      "?utm_source=mail",
      "?v=1",
      "?v=2&f=julia&z=4",
      "?v=1&f=julia&x=banana",
      "?garbage=%E0%A4%A&%",
      `?v=1&f=julia&k=${"A".repeat(600)}`,
      "?v=1&f=%3Cscript%3Ealert(1)%3C/script%3E",
    ];

    for (const query of queries) {
      const response = await get(url(`${HOME}${query}`));
      expect(response.status, query).toBe(200);
      const html = await response.text();

      expect(metaContent(html, "og:image"), query).toBe(`${origin}${CARD}`);
      expect(metaContent(html, "twitter:image"), query).toBe(
        `${origin}${CARD}`,
      );
      expect(html, query).not.toContain("<script>alert(1)");
    }
  });

  it("round-trips the link Copy link writes: the same view comes back out of the preview", async () => {
    const view = {
      fractalType: "multibrot",
      variant: "4",
      centerX: 0.1234567891,
      centerY: -0.5,
      zoomLevel: 12.5,
      colorScheme: "ocean" as const,
      autoIterationsOn: false,
      maxIterations: 300,
      canvasWidth: 1200,
      canvasHeight: 900,
    };
    const copied = copyLinkUrl(
      new URL(target.baseUrl).origin,
      "/",
      encodeView(view),
    );

    const html = await (await get(copied)).text();
    const image = new URL(metaContent(html, "og:image") as string);

    expect(image.pathname).toBe(OG);
    expect(decodeView(image.search.slice(1))).toEqual(
      decodeView(encodeView(view)),
    );
    expect(new URL(metaContent(html, "og:url") as string).search).toBe(
      image.search,
    );
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
