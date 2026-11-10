import { headers } from "next/headers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requestOrigin } from "../app/requestOrigin";
import { FALLBACK_ORIGIN } from "../lib/siteOrigin";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

/** The request headers the page would see, as the proxy sent them. */
function requestWith(values: Record<string, string>): void {
  vi.mocked(headers).mockResolvedValue(new Headers(values));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestOrigin", () => {
  it("reads the forwarded host and protocol the proxy sent", async () => {
    requestWith({
      "x-forwarded-host": "staging.fractals.example.com",
      "x-forwarded-proto": "http",
    });

    await expect(requestOrigin()).resolves.toBe(
      "http://staging.fractals.example.com",
    );
  });

  it("falls back to NEXT_PUBLIC_APP_URL when the request names no host", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fractals.example.org");
    requestWith({});

    await expect(requestOrigin()).resolves.toBe("https://fractals.example.org");
  });

  it("falls back to the local origin when neither the request nor the environment names one", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
    requestWith({});

    await expect(requestOrigin()).resolves.toBe(FALLBACK_ORIGIN);
  });
});
