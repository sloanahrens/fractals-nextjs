import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as route from "../app/api/og/route";
import { CARD_PATH } from "../lib/ogImage";

const ROUTE_SOURCE = readFileSync(
  join(__dirname, "..", "app", "api", "og", "route.ts"),
  "utf8",
);

/** The route's answer to a query, with no headers of its own. */
const get = (query: string) =>
  route.GET(new Request(`http://localhost:3000/api/og${query}`));

/** The `Location` a response sends a caller to, or null. */
const location = (response: Response) => response.headers.get("location");

describe("GET /api/og", () => {
  it("sends a valid view to the picture it previews as", async () => {
    const response = get("?v=1&f=mandelbrot&x=-0.75&y=0&z=1&s=classic&i=auto");

    expect(response.status).toBe(308);
    expect(location(response)).toMatch(/\/og\/mandelbrot-whole\.jpg$/);
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
  });

  it("picks the place by the page's own rule, filling what the link leaves out", () => {
    // A deep view of the Dendrite is previewed as its whole set, and the
    // missing centre comes from the fractal's own frame — the same picture the
    // page's head names for this link (`viewPreview.ts`).
    expect(
      location(get("?v=1&f=julia&k=Dendrite&x=-0.5&y=0.25&z=400")),
    ).toMatch(/\/og\/julia-dendrite-whole\.jpg$/);
  });

  it("reads a repeated key by its first value, as the page does", () => {
    // The second `x` is not read, so this is the same view as the query without
    // it — and so the same picture, which is what makes an odd URL and the page
    // it was shared from agree.
    expect(location(get("?v=1&f=mandelbrot&z=1&x=-0.75&x=0.9"))).toBe(
      location(get("?v=1&f=mandelbrot&z=1&x=-0.75")),
    );
  });

  it("sends an empty, invalid or unreadable query to the static card", () => {
    const toCard = [
      "",
      "?",
      "?v=1",
      "?v=2&f=julia",
      "?v=1&f=julia&x=banana",
      "?f=julia&x=0.1&y=0.2&z=5",
      "?utm_source=mail",
      "&&&",
      "%",
      `?v=1&f=julia&k=${"A".repeat(600)}`,
      "?v=1&f=%3Cscript%3Ealert(1)%3C/script%3E",
      // A nested encoding the decoder reads as one field it then refuses, and
      // a query far past any length a link can be: neither is a view.
      "?v=1&f=julia&k=%2520&x=-0.5&z=2",
      `?${"a=1&".repeat(300)}v=1`,
    ];

    for (const query of toCard) {
      const response = get(query);
      expect(response.status, query).toBe(308);
      expect(location(response), query).toMatch(/\/og-card-2\.png$/);
      expect(location(response), query).toContain(CARD_PATH);
    }
  });

  it("reads the origin from the request and never echoes a host raw", () => {
    const forwarded = route.GET(
      new Request("http://localhost:3000/api/og?v=1&f=mandelbrot&z=1", {
        headers: {
          "x-forwarded-host": "staging.example.com",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(location(forwarded)).toBe(
      "https://staging.example.com/og/mandelbrot-whole.jpg",
    );

    // A forwarded host that is not a plain hostname and port is not used.
    const hostile = route.GET(
      new Request("http://localhost:3000/api/og", {
        headers: { "x-forwarded-host": "evil.example.com/steal?x=" },
      }),
    );

    expect(location(hostile)).not.toContain("evil.example.com/steal");
    expect(location(hostile)).toMatch(/^https?:\/\/localhost:3000\//);
  });

  it("answers with a redirect and no drawn body, whoever asks", async () => {
    for (const query of ["?v=1&f=mandelbrot", "", "?%E0%A4%A&%"]) {
      const response = get(query);

      expect(response.status, query).toBe(308);
      expect(await response.text(), query).toBe("");
    }
  });

  it("is never prerendered, so it reads the query every time", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports only what a Next route file may", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic"]);
  });

  it("imports no renderer, no encoder and no cache", () => {
    // The property this route exists for: nothing a request can give it makes
    // it draw. Every module that ever drew, encoded or bounded a render is
    // named below, the removed ones included, so that none can come back.
    for (const forbidden of [
      "ogRoute",
      "ogLimits",
      "pngEncode",
      "renderRgba",
      "node:zlib",
      "LruCache",
      "RenderGate",
      "encodePng",
      "renderOgPng",
      "createOgHandler",
      "renderRgbaRows",
      "FractalRenderer",
    ]) {
      expect(ROUTE_SOURCE, forbidden).not.toContain(forbidden);
    }

    // It picks the picture with the page's own rule and reads the origin from
    // the request, and those two are the whole of it.
    expect(ROUTE_SOURCE).toContain('from "@/lib/viewPreview"');
    expect(ROUTE_SOURCE).toContain('from "@/lib/siteOrigin"');
  });
});
