import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as route from "../app/api/og/route";

const ROUTE_SOURCE = readFileSync(
  join(__dirname, "..", "app", "api", "og", "route.ts"),
  "utf8",
);

const get = (query: string) =>
  route.GET(new Request(`http://localhost:3000/api/og${query}`));

describe("GET /api/og", () => {
  it("answers a valid view with a 1200x630 PNG, cacheable for good", async () => {
    const response = await get(
      "?v=1&f=julia&k=Classic&x=0&y=0&z=1&s=fire&i=auto",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);
  }, 30_000);

  it("answers an empty query with a 400", async () => {
    const response = await get("");

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("text/plain");
  });

  it("answers an invalid view with a 400", async () => {
    expect((await get("?v=1&f=julia&x=banana")).status).toBe(400);
    expect((await get("?v=9&f=julia")).status).toBe(400);
  });

  it("runs on Node, since the encoder is node:zlib, and is never prerendered", () => {
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports only what a Next route file may", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "runtime"]);
  });

  it("builds its handler once, so the cache and the line are shared by every request", () => {
    expect(ROUTE_SOURCE.match(/createOgHandler\(/g)).toHaveLength(1);
    expect(ROUTE_SOURCE).toMatch(/^const handle = createOgHandler\(\);$/m);
  });
});
