import { describe, expect, it } from "vitest";

import { twitterCreatorFromParams } from "../deploymentParamsFile";
import { defaultVariant } from "../fractalTypes";
import { ogUrl, pageMetadata } from "../pageMetadata";
import { DESCRIPTION, TITLE } from "../siteText";
import { encodeTourLink } from "../tourLink";
import {
  DEFAULT_VIEW_LINK_UPDATES,
  type ViewLinkUpdates,
} from "../viewLinkState";

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
  it("is the static card, on the origin", () => {
    for (const params of [undefined, {}, { utm_source: "x" }, { v: "1" }]) {
      const metadata = pageMetadata(ORIGIN, params);

      expect(metadata.title).toBe(TITLE);
      expect(metadata.description).toBe(DESCRIPTION);
      expect(images(metadata).og.url).toBe(`${ORIGIN}/og-card-2.png`);
      expect(images(metadata).twitter.url).toBe(`${ORIGIN}/og-card-2.png`);
      expect(String(metadata.metadataBase)).toBe(`${ORIGIN}/`);
    }
  });

  it("leaves og:url to `ogUrl`, which the page renders itself", () => {
    // Next's metadata API would strip the root's slash, so nothing in the
    // Metadata object carries a url and the page writes the tag (`ogUrl`).
    expect(pageMetadata(ORIGIN, { v: "1" }).openGraph).not.toHaveProperty(
      "url",
    );
  });
});

describe("the Twitter card creator", () => {
  /** The head's configuration as the deployment's params file gives it. */
  const config = (params: Record<string, unknown>) => ({
    twitterCreator: twitterCreatorFromParams(params),
  });
  const creatorOf = (metadata: ReturnType<typeof pageMetadata>) =>
    (metadata.twitter as { creator?: string }).creator;

  it("is the handle the params file gives", () => {
    const metadata = pageMetadata(
      ORIGIN,
      {},
      config({ twitterCreator: "@made-up-name" }),
    );

    expect(creatorOf(metadata)).toBe("@made-up-name");
  });

  it("is the handle on a view's preview too", () => {
    const metadata = pageMetadata(
      ORIGIN,
      VIEW,
      config({ twitterCreator: "@made-up-name" }),
    );

    expect(creatorOf(metadata)).toBe("@made-up-name");
    expect(metadata.title).toBe(`Julia set, Dendrite, 400x - ${TITLE}`);
  });

  it("is absent, tag and all, when the params file gives none", () => {
    for (const params of [
      {},
      { twitterCreator: null },
      { twitterCreator: "" },
      { twitterCreator: "   " },
    ]) {
      for (const searchParams of [{}, VIEW]) {
        const metadata = pageMetadata(ORIGIN, searchParams, config(params));

        expect(metadata.twitter).not.toHaveProperty("creator");
      }
    }
  });

  it("is absent from a head built without a configuration", () => {
    expect(pageMetadata(ORIGIN).twitter).not.toHaveProperty("creator");
    expect(pageMetadata(ORIGIN, VIEW).twitter).not.toHaveProperty("creator");
  });
});

describe("ogUrl", () => {
  it("is the origin under its own trailing slash", () => {
    for (const params of [undefined, {}, { utm_source: "x" }, { v: "1" }]) {
      expect(ogUrl(ORIGIN, params)).toBe(`${ORIGIN}/`);
    }
  });

  it("is the view's own address when the query names one", () => {
    expect(ogUrl(ORIGIN, VIEW)).toBe(`${ORIGIN}/?${FRAGMENT}`);
  });

  it("stays on the origin it was given", () => {
    expect(ogUrl("http://localhost:3000", VIEW)).toBe(
      `http://localhost:3000/?${FRAGMENT}`,
    );
  });
});

describe("pageMetadata with a view", () => {
  it("points og:image and twitter:image at the nearest place's picture", () => {
    const metadata = pageMetadata(ORIGIN, VIEW);
    const { og, twitter } = images(metadata);

    // The only Dendrite place in the catalogue, which is what a view of any
    // part of the Dendrite set is shown as.
    expect(og.url).toBe(`${ORIGIN}/og/julia-dendrite-whole.jpg`);
    expect(twitter.url).toBe(og.url);
    expect(og.alt).toBe(
      "Julia set, Dendrite, 400x, a picture of Dendrite: the whole set",
    );
  });

  it("declares the picture a JPEG of the card's shape", () => {
    const og = pageMetadata(ORIGIN, VIEW).openGraph as {
      images: { type: string; width: number; height: number }[];
    };

    expect(og.images[0].type).toBe("image/jpeg");
    expect(og.images[0].width).toBe(1200);
    expect(og.images[0].height).toBe(630);
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

  it("stays on the origin it was given", () => {
    const local = pageMetadata("http://localhost:3000", VIEW);

    expect(images(local).og.url.startsWith("http://localhost:3000/og/")).toBe(
      true,
    );
  });
});

describe("pageMetadata with a tour link", () => {
  const stop = (changes: Partial<ViewLinkUpdates>): ViewLinkUpdates => ({
    fractalType: "mandelbrot",
    variant: defaultVariant("julia"),
    centerX: 0,
    centerY: 0,
    zoomLevel: 1,
    colorScheme: "classic",
    reverse: false,
    shift: 0,
    trap: null,
    autoIterationsOn: true,
    maxIterations: DEFAULT_VIEW_LINK_UPDATES.maxIterations,
    canvasWidth: 800,
    canvasHeight: 600,
    ...changes,
  });
  const TOUR = encodeTourLink([
    stop({
      fractalType: "julia",
      variant: "Dendrite",
      centerX: -0.5,
      centerY: 0.25,
      zoomLevel: 400,
      colorScheme: "fire",
    }),
    stop({ fractalType: "tricorn", zoomLevel: 8 }),
  ])!;
  const FIRST =
    "v=1&f=julia&k=Dendrite&x=-0.5&y=0.25&z=400&s=fire&i=auto&w=800&h=600";
  const LINE = "Tour of 2 views, starting at Julia set, Dendrite, 400x";

  /** A link as the route's `searchParams` hand it over. */
  const params = (link: string) => {
    const out: Record<string, string> = {};

    for (const [key, value] of new URLSearchParams(link)) out[key] = value;

    return out;
  };

  it("previews the tour as the first stop the card can draw", () => {
    const metadata = pageMetadata(ORIGIN, params(TOUR));
    const { og, twitter } = images(metadata);

    expect(og.url).toBe(`${ORIGIN}/og/julia-dendrite-whole.jpg`);
    expect(twitter.url).toBe(og.url);
    expect(og.alt).toBe(`${LINE}, a picture of Dendrite: the whole set`);
    expect(metadata.title).toBe(`${LINE} - ${TITLE}`);
    expect(metadata.description).toBe(`${LINE}. ${DESCRIPTION}`);
    expect((metadata.twitter as { description: string }).description).toMatch(
      new RegExp(`^${LINE}\\. `),
    );
    expect(ogUrl(ORIGIN, params(TOUR))).toBe(`${ORIGIN}/?${FIRST}`);
  });

  it("falls back to the static card for a tour link it cannot read", () => {
    expect(pageMetadata(ORIGIN, params("v=1&t.f=julia"))).toEqual(
      pageMetadata(ORIGIN),
    );
    expect(pageMetadata(ORIGIN, params("v=2&t.f=julia~tricorn"))).toEqual(
      pageMetadata(ORIGIN),
    );
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
    expect(images(metadata).og.url).toBe(
      `${ORIGIN}/og/julia-dendrite-whole.jpg`,
    );
  });

  it("does not decode a nested encoding a second time", () => {
    expect(pageMetadata(ORIGIN, { ...VIEW, f: "%2566ractal" })).toEqual(STATIC);
    expect(pageMetadata(ORIGIN, { ...VIEW, k: "%43lassic" })).toEqual(STATIC);
  });
});
