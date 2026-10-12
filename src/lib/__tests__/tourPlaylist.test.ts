/**
 * The walk a tour link names: the stops in order, the view on screen, and the
 * places a journey would be shared as.
 *
 * The clock that shows them and the page that wires it up are elsewhere
 * (`tour-mode-panel.test.ts`, `tour-link-panel.test.ts`); what is decided here
 * is which stop comes next and whether two views are the same place.
 */
import { describe, expect, it } from "vitest";

import {
  createPlaylist,
  nextPlaylistStop,
  playlistStops,
  sameView,
  stopPlaylist,
} from "../tourPlaylist";
import { viewLinkUpdatesFrom } from "../viewLinkState";

/** A stop, as a fragment read the way the page reads one. */
function stop(query: string) {
  return viewLinkUpdatesFrom(`#${query}`);
}

const MANDEBROT = "v=1&f=mandelbrot&x=-0.75&y=0&z=1";
const SEAHORSE = "v=1&f=mandelbrot&x=-0.745&y=0.113&z=400";
const JULIA = "v=1&f=julia&k=Classic&x=0&y=0&z=1";
const DENDRITE = "v=1&f=julia&k=Dendrite&x=0&y=0&z=1";

describe("sameView", () => {
  it("is the picture, not the canvas it was drawn on", () => {
    const small = stop(`${SEAHORSE}&w=400&h=300`);
    const large = stop(`${SEAHORSE}&w=1200&h=900`);

    expect(sameView(small, large)).toBe(true);
    expect(small.canvasWidth).not.toBe(large.canvasWidth);
  });

  it("tells a trap-on stop from the plain stop at the same place", () => {
    expect(sameView(stop(MANDEBROT), stop(`${MANDEBROT}&m=line`))).toBe(false);
    expect(
      sameView(stop(`${MANDEBROT}&m=line`), stop(`${MANDEBROT}&m=circle`)),
    ).toBe(false);
    expect(
      sameView(stop(`${MANDEBROT}&m=line`), stop(`${MANDEBROT}&m=line`)),
    ).toBe(true);
  });

  it("tells two places apart, and two pictures of one place", () => {
    expect(sameView(stop(SEAHORSE), stop(JULIA))).toBe(false);
    expect(sameView(stop(JULIA), stop(DENDRITE))).toBe(false);
    expect(sameView(stop(SEAHORSE), stop(SEAHORSE))).toBe(true);
    // A stop the link did not colour is the same place as one it did: the
    // scheme is how a picture is painted, not where it is.
    expect(sameView(stop(MANDEBROT), stop(`${MANDEBROT}&s=fire`))).toBe(false);
  });
});

describe("createPlaylist", () => {
  it("is not a walk of no stops or of one", () => {
    expect(createPlaylist([], stop(MANDEBROT))).toBeNull();
    expect(createPlaylist([stop(JULIA)], stop(JULIA))).toBeNull();
  });

  it("keeps the stops in the order the link names them", () => {
    const stops = [stop(MANDEBROT), stop(JULIA)];
    const walk = createPlaylist(stops, stop(MANDEBROT));

    expect(walk).not.toBeNull();
    expect(walk?.stops).toEqual(stops);
    expect(walk?.view).toEqual(stop(MANDEBROT));
  });
});

describe("nextPlaylistStop", () => {
  it("shows the stops in order, one hop each", () => {
    const walk = createPlaylist(
      [stop(MANDEBROT), stop(SEAHORSE), stop(JULIA)],
      stop(MANDEBROT),
    );
    if (walk === null) throw new Error("a walk of three stops");

    const first = nextPlaylistStop(walk);
    expect(first?.stop).toEqual(stop(SEAHORSE));

    const second = nextPlaylistStop(first!.state);
    expect(second?.stop).toEqual(stop(JULIA));

    // The stops are spent as they are shown, so the same walk asked again
    // answers the same way and never replays what it has been through.
    expect(nextPlaylistStop(first!.state)?.stop).toEqual(stop(JULIA));
    expect(nextPlaylistStop(second!.state)).toBeNull();
  });

  it("is the view on screen at the first stop, so the link's own view is not shown twice", () => {
    // The page puts the first stop up as the link opens and hands the walk the
    // view it is on, so the walk begins at the second stop.
    const walk = createPlaylist([stop(JULIA), stop(SEAHORSE)], stop(JULIA));

    expect(nextPlaylistStop(walk!)?.stop).toEqual(stop(SEAHORSE));
  });

  it("skips a stop that is the view on screen", () => {
    const walk = createPlaylist(
      [stop(MANDEBROT), stop(JULIA), stop(JULIA), stop(SEAHORSE)],
      stop(MANDEBROT),
    );

    const first = nextPlaylistStop(walk!);
    expect(first?.stop).toEqual(stop(JULIA));

    // The walk's second Julia stop is the picture already up: the next hop goes
    // on to the place after it rather than drawing the same view again.
    const second = nextPlaylistStop(first!.state);
    expect(second?.stop).toEqual(stop(SEAHORSE));
  });

  it("answers null when the walk has run out, which is the hand-over to the wandering tour", () => {
    // Two stops, the first of them the view on screen: one hop shows the other
    // and the walk is over, which is what hands the tour back to its own rules.
    const walk = createPlaylist(
      [stop(MANDEBROT), stop(JULIA)],
      stop(MANDEBROT),
    );
    const step = nextPlaylistStop(walk!);

    expect(step?.stop).toEqual(stop(JULIA));
    expect(nextPlaylistStop(step!.state)).toBeNull();
    expect(nextPlaylistStop(step!.state)).toBeNull();
  });

  it("hands back a walk without changing the one it was given", () => {
    const stops = [stop(MANDEBROT), stop(JULIA)];
    const walk = createPlaylist(stops, stop(MANDEBROT));
    const first = nextPlaylistStop(walk!);

    expect(walk?.stops).toHaveLength(2);
    expect(walk?.view).toEqual(stop(MANDEBROT));
    // Same state, same answer: nothing is drawn from a clock or a die.
    expect(nextPlaylistStop(walk!)).toEqual(first);
  });

  it("is over for good once the walk is given up", () => {
    const walk = createPlaylist(
      [stop(MANDEBROT), stop(SEAHORSE), stop(JULIA)],
      stop(MANDEBROT),
    );
    const stopped = stopPlaylist(walk!);

    expect(nextPlaylistStop(stopped)).toBeNull();
    expect(nextPlaylistStop(stopped)).toBeNull();
    // What was given up is a different walk: the one it came from still knows
    // its stops, so nothing that holds the older state is changed by stopping.
    expect(walk?.stops).toHaveLength(3);
    expect(nextPlaylistStop(walk!)?.stop).toEqual(stop(SEAHORSE));
  });
});

describe("playlistStops", () => {
  it("is the journey in order, with the view on screen last", () => {
    const stops = playlistStops([`#${MANDEBROT}`, `#${SEAHORSE}`], stop(JULIA));

    expect(stops).toEqual([stop(MANDEBROT), stop(SEAHORSE), stop(JULIA)]);
  });

  it("takes the entry a page opened with as the view it opened on", () => {
    // The journey's first entry is the fragment the page loaded with, and `""`
    // — the page opened with none — is the opening view rather than nothing.
    const stops = playlistStops(["", `#${JULIA}`], stop(JULIA));

    expect(stops).toHaveLength(2);
    expect(stops[0]).toEqual(viewLinkUpdatesFrom(""));
    expect(stops[1]).toEqual(stop(JULIA));
  });

  it("keeps a place visited twice once, at the later visit", () => {
    const stops = playlistStops(
      [`#${MANDEBROT}`, `#${JULIA}`, `#${MANDEBROT}`],
      stop(SEAHORSE),
    );

    expect(stops).toEqual([stop(JULIA), stop(MANDEBROT), stop(SEAHORSE)]);
  });

  it("does not count the view on screen twice when the journey has it", () => {
    const stops = playlistStops(
      [`#${MANDEBROT}`, `#${SEAHORSE}`],
      stop(SEAHORSE),
    );

    expect(stops).toEqual([stop(MANDEBROT), stop(SEAHORSE)]);
  });

  it("is the same view whatever canvas each entry was written at", () => {
    const stops = playlistStops(
      [`#${SEAHORSE}&w=400&h=300`],
      stop(`${SEAHORSE}&w=1200&h=900`),
    );

    expect(stops).toHaveLength(1);
  });

  it("keeps the most recent eight, the view on screen among them", () => {
    const fragments = [MANDEBROT, JULIA, DENDRITE].concat(
      [1, 2, 3, 4, 5, 6, 7].map(
        (step) => `v=1&f=mandelbrot&x=-0.7${step}&y=0.1&z=10`,
      ),
    );

    const stops = playlistStops(
      fragments.map((text) => `#${text}`),
      stop(SEAHORSE),
    );

    expect(fragments).toHaveLength(10);
    expect(stops).toHaveLength(8);
    expect(stops[stops.length - 1]).toEqual(stop(SEAHORSE));
    // The oldest two are the ones dropped.
    expect(stops).not.toContainEqual(stop(MANDEBROT));
    expect(stops).not.toContainEqual(stop(JULIA));
  });

  it("is one stop for a journey that has not moved", () => {
    expect(playlistStops([""], viewLinkUpdatesFrom(""))).toHaveLength(1);
    expect(playlistStops([], viewLinkUpdatesFrom(""))).toHaveLength(1);
  });
});
