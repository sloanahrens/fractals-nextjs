import { describe, expect, it } from "vitest";

import { FALLBACK_ORIGIN, siteOrigin } from "../siteOrigin";

function headers(values: Record<string, string>) {
  return (name: string) => values[name.toLowerCase()];
}

describe("siteOrigin", () => {
  it("prefers the forwarded host over the host header", () => {
    expect(
      siteOrigin(
        headers({
          "x-forwarded-host": "fractals.example.com",
          host: "internal:8080",
        }),
      ),
    ).toBe("https://fractals.example.com");
  });

  it("falls back to the host header", () => {
    expect(siteOrigin(headers({ host: "fractals.example.com" }))).toBe(
      "https://fractals.example.com",
    );
  });

  it("defaults the scheme to https and honours a forwarded one", () => {
    expect(siteOrigin(headers({ host: "a.example.com" }))).toBe(
      "https://a.example.com",
    );
    expect(
      siteOrigin(
        headers({ host: "a.example.com", "x-forwarded-proto": "http" }),
      ),
    ).toBe("http://a.example.com");
    expect(
      siteOrigin(
        headers({ host: "a.example.com", "x-forwarded-proto": "https, http" }),
      ),
    ).toBe("https://a.example.com");
  });

  it("ignores a forwarded scheme that is not http or https", () => {
    expect(
      siteOrigin(
        headers({ host: "a.example.com", "x-forwarded-proto": "javascript" }),
      ),
    ).toBe("https://a.example.com");
  });

  it("takes the first entry of a forwarded host list and keeps a port", () => {
    expect(
      siteOrigin(
        headers({ "x-forwarded-host": "a.example.com, proxy.internal" }),
      ),
    ).toBe("https://a.example.com");
    expect(siteOrigin(headers({ host: "a.example.com:8443" }))).toBe(
      "https://a.example.com:8443",
    );
  });

  it("lower-cases the host", () => {
    expect(siteOrigin(headers({ host: "Fractals.Example.COM" }))).toBe(
      "https://fractals.example.com",
    );
  });

  it("serves a local host over http when no scheme is forwarded", () => {
    expect(siteOrigin(headers({ host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
    expect(
      siteOrigin(
        headers({ host: "localhost:3000", "x-forwarded-proto": "https" }),
      ),
    ).toBe("https://localhost:3000");
  });

  it.each([
    ["a path", "evil.example.com/path"],
    ["a space", "evil example.com"],
    ["a scheme", "https://evil.example.com"],
    ["a quote", 'evil.example.com"onload="x'],
    ["an angle bracket", "evil.example.com<script>"],
    ["a credential", "user@evil.example.com"],
    ["a leading dot", ".example.com"],
    ["an empty port", "example.com:"],
    ["nothing", ""],
  ])("does not echo a host with %s", (_label, host) => {
    expect(siteOrigin(headers({ host }))).toBe(FALLBACK_ORIGIN);
    expect(
      siteOrigin(headers({ "x-forwarded-host": host }), {
        NEXT_PUBLIC_APP_URL: "https://configured.example.com",
      }),
    ).toBe("https://configured.example.com");
  });

  it("uses the host header when the forwarded host is malformed", () => {
    expect(
      siteOrigin(
        headers({ "x-forwarded-host": "bad/host", host: "good.example.com" }),
      ),
    ).toBe("https://good.example.com");
  });

  it("falls back to NEXT_PUBLIC_APP_URL when there is no host", () => {
    expect(
      siteOrigin(headers({}), {
        NEXT_PUBLIC_APP_URL: "https://configured.example.com/some/path",
      }),
    ).toBe("https://configured.example.com");
  });

  it("ignores a NEXT_PUBLIC_APP_URL that is not an http(s) URL", () => {
    for (const NEXT_PUBLIC_APP_URL of [
      "",
      "not a url",
      "ftp://x.example.com",
    ]) {
      expect(siteOrigin(headers({}), { NEXT_PUBLIC_APP_URL })).toBe(
        FALLBACK_ORIGIN,
      );
    }
  });

  it("falls back to localhost with nothing at all", () => {
    expect(siteOrigin(headers({}))).toBe("http://localhost:3000");
    expect(siteOrigin(() => null, {})).toBe("http://localhost:3000");
  });

  it("lets a request's host beat the configured URL", () => {
    expect(
      siteOrigin(headers({ host: "staging.example.com" }), {
        NEXT_PUBLIC_APP_URL: "https://configured.example.com",
      }),
    ).toBe("https://staging.example.com");
  });
});
