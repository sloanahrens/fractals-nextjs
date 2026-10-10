import { describe, expect, it } from "vitest";

import { DESCRIPTION, TITLE, pageMetadata } from "../pageMetadata";

const ORIGIN = "https://fractals.example.com";
const VIEW = {
  v: "1",
  f: "julia",
  k: "Dendrite",
  x: "-0.5",
  y: "0.25",
  z: "400",
  s: "fire",
  i: "auto",
};
const FRAGMENT =
  "v=1&f=julia&k=Dendrite&x=-0.5&y=0.25&z=400&s=fire&i=auto&w=800&h=600";

/** The og:image and twitter:image entries of a metadata object. */
function images(metadata: ReturnType<typeof pageMetadata>) {
  const og = metadata.openGraph as { images: { url: string; alt: string }[] };
  const twitter = metadata.twitter as {
    images: { url: string; alt: string }[];
  };

  return { og: og.images[0], twitter: twitter.images[0] };
}

describe("pageMetadata without a view", () => {
  it("is the static card exactly as fr-nd5 left it", () => {
    for (const params of [undefined, {}, { utm_source: "x" }, { v: "1" }]) {
      const metadata = pageMetadata(ORIGIN, params);

      expect(metadata.title).toBe(TITLE);
      expect(metadata.description).toBe(DESCRIPTION);
      expect(metadata.openGraph?.url).toBe(`${ORIGIN}/`);
      expect(images(metadata).og.url).toBe(`${ORIGIN}/og-card.png`);
      expect(images(metadata).twitter.url).toBe(`${ORIGIN}/og-card.png`);
      expect(String(metadata.metadataBase)).toBe(`${ORIGIN}/`);
    }
  });
});

describe("pageMetadata with a view", () => {
  it("points og:image and twitter:image at /api/og for the re-encoded view", () => {
    const metadata = pageMetadata(ORIGIN, VIEW);
    const { og, twitter } = images(metadata);

    expect(og.url).toBe(`${ORIGIN}/api/og?${FRAGMENT}`);
    expect(twitter.url).toBe(og.url);
    expect(metadata.openGraph?.url).toBe(`${ORIGIN}/?${FRAGMENT}`);
    expect(og.alt).toBe("Julia set, Dendrite, 400x, drawn by Fractal Explorer");
  });

  it("adds one short line to the title and the descriptions", () => {
    const metadata = pageMetadata(ORIGIN, VIEW);

    expect(metadata.title).toBe(`Julia set, Dendrite, 400x - ${TITLE}`);
    expect(metadata.description).toBe(
      `Julia set, Dendrite, 400x. ${DESCRIPTION}`,
    );
    expect(metadata.openGraph?.title).toBe(metadata.title);
    expect((metadata.twitter as { description: string }).description).toMatch(
      /^Julia set, Dendrite, 400x\. /,
    );
  });

  it("keeps the card's declared size, which /api/og draws", () => {
    const og = pageMetadata(ORIGIN, VIEW).openGraph as {
      images: { width: number; height: number }[];
    };

    expect(og.images[0].width).toBe(1200);
    expect(og.images[0].height).toBe(630);
  });

  it("stays on the origin it was given", () => {
    const local = pageMetadata("http://localhost:3000", VIEW);

    expect(
      images(local).og.url.startsWith("http://localhost:3000/api/og?"),
    ).toBe(true);
  });
});

describe("pageMetadata with hostile parameters", () => {
  const STATIC = pageMetadata(ORIGIN);

  it("falls back to the static card for a view the route would refuse", () => {
    for (const params of [
      { ...VIEW, x: "<script>alert(1)</script>" },
      { ...VIEW, f: "../../etc/passwd" },
      { ...VIEW, k: "A".repeat(600) },
      { v: "1", f: ["julia", "tricorn"], z: ["not", "a number"] },
      { v: "1&f=julia" },
      { "v=1&f=julia": "" },
    ]) {
      expect(pageMetadata(ORIGIN, params)).toEqual(STATIC);
    }
  });

  it("never carries a visitor's text into any field", () => {
    const params = {
      ...VIEW,
      evil: '"><script>alert(1)</script>',
      q: "javascript:alert(1)",
      "<b>": "1",
    };
    const metadata = pageMetadata(ORIGIN, params);

    expect(JSON.stringify(metadata)).not.toMatch(
      /<script|javascript|alert\(|evil|<b>/,
    );
    expect(images(metadata).og.url).toBe(`${ORIGIN}/api/og?${FRAGMENT}`);
  });

  it("does not decode a nested encoding a second time", () => {
    expect(pageMetadata(ORIGIN, { ...VIEW, f: "%2566ractal" })).toEqual(STATIC);
    expect(pageMetadata(ORIGIN, { ...VIEW, k: "%43lassic" })).toEqual(STATIC);
  });
});
