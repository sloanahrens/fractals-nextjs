import { describe, expect, it } from "vitest";

import { GET } from "../app/api/health/route";

describe("GET /api/health", () => {
  it("answers 200 with a healthy JSON body", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as { status: string; timestamp: string };
    expect(body.status).toBe("healthy");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it("reports the time of the check, not a baked-in constant", async () => {
    const before = Date.now();
    const body = (await (await GET()).json()) as { timestamp: string };
    const after = Date.now();

    const reported = Date.parse(body.timestamp);
    expect(reported).toBeGreaterThanOrEqual(before);
    expect(reported).toBeLessThanOrEqual(after);
  });
});
