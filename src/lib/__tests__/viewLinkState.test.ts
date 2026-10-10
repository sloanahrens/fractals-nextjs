/**
 * What the page makes of a link, and when it writes the address bar
 *
 * Two halves of the share feature that have nothing to do with the DOM: what a
 * fragment means for the page's state — both when the page loads with one and
 * when one arrives afterwards, since `viewLinkUpdatesFrom` is the one answer to
 * both — and the throttle that keeps a gesture from rewriting the URL on every
 * settled view. Both are pure, so both are driven here; the effects that read
 * the fragment at mount and on `hashchange`, and the button that copies the
 * URL, are left to the page's own source-reading test, because Node has no
 * window to give them.
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
  viewLinkUpdatesFrom,
} from "../viewLinkState";

/** The example link the feature is described with. */
const EXAMPLE_LINK =
  "#v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600";

describe("viewLinkToUpdates", () => {
  it("applies every field of a full link", () => {
    expect(viewLinkToUpdates(decodeView(EXAMPLE_LINK))).toEqual({
      fractalType: "julia",
      variant: "Classic",
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

  it("puts a Tricorn link's fractal on the page and leaves the constant standing", () => {
    expect(
      viewLinkToUpdates(
        decodeView(
          "#v=1&f=tricorn&x=-1.768&y=0&z=60&s=classic&i=auto&w=800&h=600",
        ),
      ),
    ).toMatchObject({
      fractalType: "tricorn",
      variant: DEFAULT_VIEW_LINK_UPDATES.variant,
      centerX: -1.768,
      centerY: 0,
      zoomLevel: 60,
    });
  });

  it("puts a Newton link's fractal on the page and leaves the variant standing", () => {
    expect(
      viewLinkToUpdates(
        decodeView("#v=1&f=newton&x=0&y=0&z=8&s=rainbow&i=auto&w=800&h=600"),
      ),
    ).toMatchObject({
      fractalType: "newton",
      variant: DEFAULT_VIEW_LINK_UPDATES.variant,
      centerX: 0,
      centerY: 0,
      zoomLevel: 8,
      colorScheme: "rainbow",
    });
  });

  it("drops a variant a Newton link carries, which the fractal cannot use", () => {
    expect(
      viewLinkToUpdates(decodeView("#v=1&f=newton&k=4&x=0&y=0&z=1")),
    ).toMatchObject({
      fractalType: "newton",
      variant: DEFAULT_VIEW_LINK_UPDATES.variant,
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
      variant: DEFAULT_VIEW_LINK_UPDATES.variant,
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
    expect(updates.variant).toBe(DEFAULT_VIEW_LINK_UPDATES.variant);
    expect(updates.canvasWidth).toBe(DEFAULT_VIEW_LINK_UPDATES.canvasWidth);
  });

  it("takes a Julia constant only beside the Julia fractal", () => {
    // The codec writes the constant only beside `f=julia`; the reader agrees,
    // so a constant in a link about another picture is not a choice about that
    // picture and is not applied.
    const wrongFractal = viewLinkToUpdates(
      decodeView("#v=1&f=mandelbrot&k=Dendrite"),
    );
    expect(wrongFractal.variant).toBe(DEFAULT_VIEW_LINK_UPDATES.variant);

    const julia = viewLinkToUpdates(decodeView("#v=1&f=julia&k=Dendrite"));
    expect(julia.variant).toBe("Dendrite");
  });

  it("takes a Multibrot power only beside the Multibrot, and a constant only beside Julia", () => {
    const multibrot = viewLinkToUpdates(decodeView("#v=1&f=multibrot&k=4"));
    expect(multibrot.fractalType).toBe("multibrot");
    expect(multibrot.variant).toBe("4");

    // A power in a Julia link, and a constant in a Multibrot one, are fields
    // that mean nothing there: each fractal opens on its own default.
    const julia = viewLinkToUpdates(decodeView("#v=1&f=julia&k=4"));
    expect(julia.variant).toBe(DEFAULT_VIEW_LINK_UPDATES.variant);

    const wrongConstant = viewLinkToUpdates(
      decodeView("#v=1&f=multibrot&k=Dendrite"),
    );
    expect(wrongConstant.variant).toBe("3");

    // Nor a power in a link about a fractal that takes none.
    const mandelbrot = viewLinkToUpdates(decodeView("#v=1&f=mandelbrot&k=5"));
    expect(mandelbrot.variant).toBe(DEFAULT_VIEW_LINK_UPDATES.variant);
  });

  it("opens a Multibrot link that names no usable power on power 3, not on Julia's constant", () => {
    for (const fragment of [
      "#v=1&f=multibrot",
      "#v=1&f=multibrot&k=6",
      "#v=1&f=multibrot&k=3.0",
      "#v=1&f=multibrot&k=Classic",
    ]) {
      expect(viewLinkToUpdates(decodeView(fragment)).variant, fragment).toBe(
        "3",
      );
    }
  });

  it("round-trips each Multibrot power through the link and back to the page's state", () => {
    for (const power of ["3", "4", "5"]) {
      const link = encodeView({
        ...viewLinkToUpdates(decodeView("#v=1&f=multibrot")),
        variant: power,
      });

      expect(link).toContain(`f=multibrot&k=${power}&`);
      expect(viewLinkUpdatesFrom(`#${link}`)).toMatchObject({
        fractalType: "multibrot",
        variant: power,
      });
    }
  });

  it("gives a Julia link with no constant the page's own", () => {
    // The fractal is the part that was asked for; the constant it opens on is
    // the one the app draws for a name it has no answer for, which is what the
    // picker shows too.
    expect(viewLinkToUpdates(decodeView("#v=1&f=julia")).variant).toBe(
      DEFAULT_VIEW_LINK_UPDATES.variant,
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

  it("round-trips a Julia variant, named or custom, through the same bytes as before", () => {
    // The state calls it `variant`; the link still writes it as `k`, and only
    // beside `f=julia`.
    const named =
      "#v=1&f=julia&k=Siegel+disk&x=0&y=0&z=1&s=fire&i=auto&w=800&h=600";
    const custom = encodeView({
      ...viewLinkToUpdates(decodeView(named)),
      variant: "custom:-0.8,0.156",
    });

    expect(viewLinkToUpdates(decodeView(named)).variant).toBe("Siegel disk");
    expect(custom).toContain("&k=custom%3A-0.8%2C0.156&");
    expect(viewLinkToUpdates(decodeView(custom)).variant).toBe(
      "custom:-0.8,0.156",
    );
    expect(
      encodeView({
        fractalType: "mandelbrot",
        variant: "Dendrite",
        centerX: 0,
        centerY: 0,
        zoomLevel: 1,
        colorScheme: getAvailableColorSchemes()[0].value,
        autoIterationsOn: true,
        maxIterations: 100,
        canvasWidth: 800,
        canvasHeight: 600,
      }),
    ).not.toContain("k=");
  });

  it("answers with the view the codec would write for it", () => {
    // The mapping and the codec meet in the middle: a link read and applied
    // produces the string it came from, so an applied link leaves the address
    // bar alone rather than rewriting it into something else.
    const state: ViewLinkState = {
      fractalType: "julia",
      variant: JULIA_CONSTANTS[2].name,
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

describe("viewLinkUpdatesFrom", () => {
  it("reads a fragment with its `#`, which is how a paste arrives", () => {
    // The mount read and the hashchange read both pass `window.location.hash`,
    // which keeps the leading `#` the codec's Copy link output does not carry.
    // The link has to mean the same view either way.
    const expected = viewLinkUpdatesFrom(EXAMPLE_LINK);

    expect(expected.fractalType).toBe("julia");
    expect(expected.centerX).toBe(-0.644);
    expect(expected.zoomLevel).toBe(2.56);
    expect(viewLinkUpdatesFrom(EXAMPLE_LINK.slice(1))).toEqual(expected);
  });

  it("settles on the view the URL describes when it cannot be read in full", () => {
    // The documented answer for a fragment this build cannot read in full:
    // nothing is refused and nothing is half-applied, so the fields it does
    // carry are applied and the page's opening view stands for the rest. The
    // follower then writes that view back, which is what leaves the bar and the
    // canvas agreeing.
    const partial = viewLinkUpdatesFrom("#v=1&x=0.25&s=nonsense&z=typo");

    expect(partial.centerX).toBe(0.25);
    expect(partial.colorScheme).toBe(DEFAULT_VIEW_LINK_UPDATES.colorScheme);
    expect(partial.zoomLevel).toBe(DEFAULT_VIEW_LINK_UPDATES.zoomLevel);

    // A fragment that names no field this build reads at all — another
    // version, or something that is not a link — means the page's opening
    // view, exactly as an empty address bar does.
    for (const fragment of ["#v=2&x=0.25&z=8", "#", "not a link at all"]) {
      expect(viewLinkUpdatesFrom(fragment)).toEqual(DEFAULT_VIEW_LINK_UPDATES);
    }
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
