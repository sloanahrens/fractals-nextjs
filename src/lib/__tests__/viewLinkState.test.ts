/**
 * What the page makes of a link, and when it writes the address bar
 *
 * Two halves of the share feature that have nothing to do with the DOM: the
 * mapping from a decoded link to the page's state, and the throttle that keeps
 * a gesture from rewriting the URL on every settled view. Both are pure, so
 * both are driven here; the effect that reads the fragment at mount and the
 * button that copies the URL are left to the page's own source-reading test,
 * because Node has no window to give them.
 */
import { describe, expect, it } from "vitest";

import { getAvailableColorSchemes } from "../colorMapping";
import { JULIA_CONSTANTS } from "../julia";
import { decodeView, encodeView, type ViewLinkState } from "../viewLink";
import {
  DEFAULT_VIEW_LINK_UPDATES,
  LINK_WRITE_INTERVAL_MS,
  linkWriteDelayMs,
  shouldWriteLink,
  viewLinkToUpdates,
} from "../viewLinkState";

/** The example link the feature is described with. */
const EXAMPLE_LINK =
  "#v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600";

describe("viewLinkToUpdates", () => {
  it("applies every field of a full link", () => {
    expect(viewLinkToUpdates(decodeView(EXAMPLE_LINK))).toEqual({
      fractalType: "julia",
      juliaConstant: "Classic",
      centerX: -0.644,
      centerY: -0.094,
      zoomLevel: 2.56,
      colorScheme: "fire",
      autoIterationsOn: true,
      // An auto view carries no count, so the slider keeps the page's own.
      maxIterations: DEFAULT_VIEW_LINK_UPDATES.maxIterations,
      canvasWidth: 800,
      canvasHeight: 600,
    });
  });

  it("applies a canvas size and an iteration count that are not the defaults", () => {
    // The example link happens to carry the page's own canvas size and an auto
    // count, so it cannot tell a read field from a defaulted one. This one
    // carries a size the resolution buttons offer and a count the slider can
    // hold, and both have to arrive.
    expect(
      viewLinkToUpdates(
        decodeView(
          "#v=1&f=burning-ship&x=0.2925755&y=-0.0149977&z=42.5&s=rainbow&i=700&w=1200&h=900",
        ),
      ),
    ).toEqual({
      fractalType: "burning-ship",
      juliaConstant: DEFAULT_VIEW_LINK_UPDATES.juliaConstant,
      centerX: 0.2925755,
      centerY: -0.0149977,
      zoomLevel: 42.5,
      colorScheme: "rainbow",
      autoIterationsOn: false,
      maxIterations: 700,
      canvasWidth: 1200,
      canvasHeight: 900,
    });
  });

  it("reads a link into the view the page opens on when it says nothing", () => {
    // The page holds this exact object as its initial state, so the assertion
    // is the acceptance criterion: a link with nothing usable in it leaves the
    // page's own defaults standing, field by field.
    expect(viewLinkToUpdates(decodeView(""))).toEqual(
      DEFAULT_VIEW_LINK_UPDATES,
    );
  });

  it("applies the fields a partial link carries and defaults the rest", () => {
    const updates = viewLinkToUpdates(decodeView("#v=1&x=0.25&s=ocean&i=300"));

    expect(updates.centerX).toBe(0.25);
    expect(updates.colorScheme).toBe("ocean");
    expect(updates.autoIterationsOn).toBe(false);
    expect(updates.maxIterations).toBe(300);

    // Everything the link did not name is the page's opening view.
    expect(updates.centerY).toBe(DEFAULT_VIEW_LINK_UPDATES.centerY);
    expect(updates.zoomLevel).toBe(DEFAULT_VIEW_LINK_UPDATES.zoomLevel);
    expect(updates.fractalType).toBe(DEFAULT_VIEW_LINK_UPDATES.fractalType);
    expect(updates.juliaConstant).toBe(DEFAULT_VIEW_LINK_UPDATES.juliaConstant);
    expect(updates.canvasWidth).toBe(DEFAULT_VIEW_LINK_UPDATES.canvasWidth);
  });

  it("takes a Julia constant only beside the Julia fractal", () => {
    // The codec writes the constant only beside `f=julia`; the reader agrees,
    // so a constant in a link about another picture is not a choice about that
    // picture and is not applied.
    const wrongFractal = viewLinkToUpdates(
      decodeView("#v=1&f=mandelbrot&k=Dendrite"),
    );
    expect(wrongFractal.juliaConstant).toBe(
      DEFAULT_VIEW_LINK_UPDATES.juliaConstant,
    );

    const julia = viewLinkToUpdates(decodeView("#v=1&f=julia&k=Dendrite"));
    expect(julia.juliaConstant).toBe("Dendrite");
  });

  it("gives a Julia link with no constant the page's own", () => {
    // The fractal is the part that was asked for; the constant it opens on is
    // the one the app draws for a name it has no answer for, which is what the
    // picker shows too.
    expect(viewLinkToUpdates(decodeView("#v=1&f=julia")).juliaConstant).toBe(
      DEFAULT_VIEW_LINK_UPDATES.juliaConstant,
    );
  });

  it("changes nothing for a hostile fragment", () => {
    // Anything the codec refuses is absent by the time the page sees it, so a
    // link from a build that means something else by these keys, one naming
    // fractals and colours this build has not got, and one that is not a link
    // at all all land on the same view.
    const hostile = [
      "#v=2&f=julia&k=Dendrite&x=1&y=1&z=8&s=fire&i=auto",
      "#v=1&f=hyperbolic&k=Worm&x=1e9&y=abc&z=-3&s=neon&i=7&w=1&h=1",
      "#v=1&x=&y=&z=&i=",
      "not a link at all",
      "#" + "v=1&x=0.5&".repeat(80),
    ];

    for (const fragment of hostile) {
      expect(viewLinkToUpdates(decodeView(fragment))).toEqual(
        DEFAULT_VIEW_LINK_UPDATES,
      );
    }
  });

  it("answers with the view the codec would write for it", () => {
    // The mapping and the codec meet in the middle: a link read and applied
    // produces the string it came from, so an applied link leaves the address
    // bar alone rather than rewriting it into something else.
    const state: ViewLinkState = {
      fractalType: "julia",
      juliaConstant: JULIA_CONSTANTS[2].name,
      centerX: 0.2925755,
      centerY: -0.0149977,
      zoomLevel: 42.5,
      colorScheme: getAvailableColorSchemes()[3].value,
      autoIterationsOn: false,
      maxIterations: 700,
      canvasWidth: 400,
      canvasHeight: 300,
    };
    const link = encodeView(state);

    expect(
      encodeView({ ...state, ...viewLinkToUpdates(decodeView(link)) }),
    ).toBe(link);
  });
});

describe("shouldWriteLink", () => {
  it("writes a first fragment however recently the page started", () => {
    // A page that has never written the address bar passes 0 for its last
    // write, which is decades of milliseconds ago: nothing holds a first write
    // back.
    expect(shouldWriteLink("", "#v=1&x=0.25", 1_700_000_000_000, 0)).toBe(true);
  });

  it("does not write a fragment the address bar already carries", () => {
    const link = "#v=1&x=0.25";

    expect(
      shouldWriteLink(link, link, 1_700_000_000_000, 1_699_999_000_000),
    ).toBe(false);
    // Even when the interval is out: the same view is not news.
    expect(shouldWriteLink(link, link, 1_700_000_000_000, 0)).toBe(false);
  });

  it("holds a second write back until the interval is out", () => {
    const last = 1_700_000_000_000;

    expect(shouldWriteLink("#v=1", "#v=1&x=1", last + 1, last)).toBe(false);
    expect(
      shouldWriteLink(
        "#v=1",
        "#v=1&x=1",
        last + LINK_WRITE_INTERVAL_MS - 1,
        last,
      ),
    ).toBe(false);
    expect(
      shouldWriteLink("#v=1", "#v=1&x=1", last + LINK_WRITE_INTERVAL_MS, last),
    ).toBe(true);
  });
});

describe("linkWriteDelayMs", () => {
  it("counts down the interval and stops at nothing", () => {
    const last = 1_700_000_000_000;

    expect(linkWriteDelayMs(last, last)).toBe(LINK_WRITE_INTERVAL_MS);
    expect(linkWriteDelayMs(last + 200, last)).toBe(
      LINK_WRITE_INTERVAL_MS - 200,
    );
    expect(linkWriteDelayMs(last + LINK_WRITE_INTERVAL_MS, last)).toBe(0);
    expect(linkWriteDelayMs(last + 60_000, last)).toBe(0);
  });
});
