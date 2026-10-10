import { describe, expect, it } from "vitest";

import { defaultViewFor } from "../fractalTypes";
import { copyLinkUrl, readLocationLink } from "../viewQuery";
import { decodeView, encodeView } from "../viewLink";
import { viewLinkUpdatesFrom } from "../viewLinkState";

const LINK = "v=1&f=julia&k=Dendrite&x=-0.5&y=0.25&z=400&s=fire&i=auto";
const OTHER = "v=1&f=tricorn&x=0&y=0&z=1";

describe("copyLinkUrl", () => {
  it("is the codec's text as a query on the origin and path", () => {
    expect(copyLinkUrl("https://example.com", "/", LINK)).toBe(
      `https://example.com/?${LINK}`,
    );
    expect(copyLinkUrl("http://localhost:3000", "/fractals/", LINK)).toBe(
      `http://localhost:3000/fractals/?${LINK}`,
    );
  });

  it("round-trips: the copied query reads back as the view that was copied", () => {
    const link = encodeView({
      fractalType: "multibrot",
      variant: "4",
      centerX: 0.1234567891,
      centerY: -0.5,
      zoomLevel: 12.5,
      colorScheme: "ocean",
      autoIterationsOn: false,
      maxIterations: 300,
      canvasWidth: 1200,
      canvasHeight: 900,
    });
    const url = new URL(copyLinkUrl("https://example.com", "/", link));
    const location = readLocationLink(url.search, url.hash);

    expect(location).toEqual({ fragment: `#${link}`, dropQuery: true });
    expect(viewLinkUpdatesFrom(location.fragment)).toEqual(
      viewLinkUpdatesFrom(`#${link}`),
    );
    expect(decodeView(location.fragment).variant).toBe("4");
  });

  it("carries a reversed and shifted scheme through the query and back", () => {
    const link = encodeView({
      fractalType: "julia",
      variant: "Classic",
      centerX: -0.644,
      centerY: -0.094,
      zoomLevel: 2.56,
      colorScheme: "fire",
      reverse: true,
      shift: 0.25,
      autoIterationsOn: true,
      canvasWidth: 800,
      canvasHeight: 600,
    });

    expect(link).toContain("&r=1&o=0.25&");

    const url = new URL(copyLinkUrl("https://example.com", "/", link));
    const location = readLocationLink(url.search, url.hash);

    // The query form is a view the page reads, so it settles on the hash and
    // the settings come with the rest of the view.
    expect(location.dropQuery).toBe(true);
    expect(viewLinkUpdatesFrom(location.fragment)).toMatchObject({
      colorScheme: "fire",
      reverse: true,
      shift: 0.25,
    });
  });
});

describe("readLocationLink", () => {
  it("reads nothing from an address with neither form", () => {
    expect(readLocationLink("", "")).toEqual({
      fragment: "",
      dropQuery: false,
    });
    expect(readLocationLink("?", "#")).toEqual({
      fragment: "#",
      dropQuery: false,
    });
  });

  it("reads a hash as it always has, and leaves a query that is no view alone", () => {
    expect(readLocationLink("", `#${LINK}`)).toEqual({
      fragment: `#${LINK}`,
      dropQuery: false,
    });
    expect(readLocationLink("?utm_source=mail&ref=x", "")).toEqual({
      fragment: "",
      dropQuery: false,
    });
  });

  it("reads a query as the same text as a fragment", () => {
    expect(readLocationLink(`?${LINK}`, "")).toEqual({
      fragment: `#${LINK}`,
      dropQuery: true,
    });
    // A bare "#" is no hash.
    expect(readLocationLink(`?${LINK}`, "#")).toEqual({
      fragment: `#${LINK}`,
      dropQuery: true,
    });
  });

  it("lets a hash win when both are present, and still drops the query", () => {
    expect(readLocationLink(`?${OTHER}`, `#${LINK}`)).toEqual({
      fragment: `#${LINK}`,
      dropQuery: true,
    });
  });

  it("leaves a hash that is no view to win over a good query, as the rule says", () => {
    expect(readLocationLink(`?${LINK}`, "#section")).toEqual({
      fragment: "#section",
      dropQuery: true,
    });
  });

  it("reads a query that asks for a tour, and the tour survives into the fragment", () => {
    const location = readLocationLink("?v=1&tour=1", "");

    expect(location).toEqual({ fragment: "#v=1&tour=1", dropQuery: true });
  });

  it("is not fooled by a version it does not read or a version with nothing in it", () => {
    expect(readLocationLink("?v=2&f=julia&z=4", "").dropQuery).toBe(false);
    expect(readLocationLink("?v=1", "").dropQuery).toBe(false);
    expect(readLocationLink("?f=julia&z=4", "").dropQuery).toBe(false);
    expect(readLocationLink("?tour=1", "").dropQuery).toBe(false);
  });

  it("reads a repeated key by its first value, as the decoder does", () => {
    const location = readLocationLink("?v=1&f=julia&f=tricorn&z=4&z=9", "");
    const view = viewLinkUpdatesFrom(location.fragment);

    expect(view.fractalType).toBe("julia");
    expect(view.zoomLevel).toBe(4);
  });

  it("drops a value it cannot read and keeps the rest, the way a hash does", () => {
    const view = viewLinkUpdatesFrom(
      readLocationLink("?v=1&f=julia&x=oops&z=9&s=nope", "").fragment,
    );

    expect(view.fractalType).toBe("julia");
    expect(view.zoomLevel).toBe(9);
    // The centre it could not read is the frame of the fractal it named, not
    // the page's own — the Mandelbrot set's centre under a Julia set is empty
    // plane.
    expect(view.centerX).toBe(defaultViewFor("julia").centerX);
    expect(view.colorScheme).toBe("classic");
  });

  it("bounds a 600-character value and never throws on garbage", () => {
    const long = `?v=1&f=julia&k=${"A".repeat(600)}&z=4`;
    const location = readLocationLink(long, "");

    // Past the fragment limit the decoder reads nothing, so it is no view and
    // the address is left as it was.
    expect(location.dropQuery).toBe(false);
    expect(() => viewLinkUpdatesFrom(location.fragment)).not.toThrow();

    for (const garbage of [
      "?%",
      "?%E0%A4%A",
      "?===&&&",
      "?v=1&f=%00&x=%zz",
      "?<script>alert(1)</script>",
      "?v=1&f=julia&k=custom:9,9",
    ]) {
      expect(() => readLocationLink(garbage, "")).not.toThrow();
      expect(() =>
        viewLinkUpdatesFrom(readLocationLink(garbage, "").fragment),
      ).not.toThrow();
    }
  });

  it("ignores fields it does not know", () => {
    const view = viewLinkUpdatesFrom(
      readLocationLink("?v=1&f=julia&evil=<b>&z=4&fbclid=abc", "").fragment,
    );

    expect(view.fractalType).toBe("julia");
    expect(view.zoomLevel).toBe(4);
  });
});
