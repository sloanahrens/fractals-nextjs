import { describe, expect, it } from "vitest";

import { Journey, MAX_JOURNEY_ENTRIES } from "../journey";

/** A journey holding the given fragments, the last one current. */
function journeyOf(...fragments: string[]): Journey {
  const journey = new Journey();

  for (const fragment of fragments) journey.push(fragment);

  return journey;
}

describe("Journey", () => {
  describe("when empty", () => {
    it("has no current entry and nowhere to go", () => {
      const journey = new Journey();

      expect(journey.current).toBeNull();
      expect(journey.canGoBack).toBe(false);
      expect(journey.canGoForward).toBe(false);
      expect(journey.length).toBe(0);
      expect(journey.back()).toBeNull();
      expect(journey.forward()).toBeNull();
    });

    it("takes a replace as its first entry", () => {
      const journey = new Journey();

      journey.replace("#a");

      expect(journey.current).toBe("#a");
      expect(journey.length).toBe(1);
    });
  });

  describe("push", () => {
    it("makes the new fragment current and the old one reachable", () => {
      const journey = journeyOf("#a", "#b");

      expect(journey.current).toBe("#b");
      expect(journey.canGoBack).toBe(true);
      expect(journey.canGoForward).toBe(false);
    });

    it("does nothing for the fragment that is already current", () => {
      const journey = journeyOf("#a", "#b");

      expect(journey.push("#b")).toBe(false);
      expect(journey.length).toBe(2);
      expect(journey.current).toBe("#b");
    });

    it("reports an entry it added", () => {
      expect(new Journey().push("#a")).toBe(true);
    });

    it("drops the entries ahead when pushed after going back", () => {
      const journey = journeyOf("#a", "#b", "#c");

      journey.back();
      journey.back();
      journey.push("#d");

      expect(journey.current).toBe("#d");
      expect(journey.canGoForward).toBe(false);
      expect(journey.length).toBe(2);
      expect(journey.back()).toBe("#a");
    });

    it("keeps the newest 200 entries, dropping the oldest", () => {
      const journey = new Journey();

      for (let n = 0; n < MAX_JOURNEY_ENTRIES + 5; n++) journey.push(`#${n}`);

      expect(MAX_JOURNEY_ENTRIES).toBe(200);
      expect(journey.length).toBe(MAX_JOURNEY_ENTRIES);
      expect(journey.current).toBe(`#${MAX_JOURNEY_ENTRIES + 4}`);

      // Walk all the way back: the oldest entry left is the sixth pushed.
      let oldest = journey.current;
      for (let step = journey.back(); step !== null; step = journey.back()) {
        oldest = step;
      }
      expect(oldest).toBe("#5");
    });

    it("stays on the newest entry when the cap drops the oldest", () => {
      const journey = new Journey();

      for (let n = 0; n < MAX_JOURNEY_ENTRIES + 1; n++) journey.push(`#${n}`);

      expect(journey.canGoForward).toBe(false);
      expect(journey.back()).toBe(`#${MAX_JOURNEY_ENTRIES - 1}`);
    });
  });

  describe("back and forward", () => {
    it("walk the entries in order and report the end", () => {
      const journey = journeyOf("#a", "#b", "#c");

      expect(journey.back()).toBe("#b");
      expect(journey.back()).toBe("#a");
      expect(journey.canGoBack).toBe(false);
      expect(journey.back()).toBeNull();
      expect(journey.current).toBe("#a");

      expect(journey.forward()).toBe("#b");
      expect(journey.forward()).toBe("#c");
      expect(journey.canGoForward).toBe(false);
      expect(journey.forward()).toBeNull();
      expect(journey.current).toBe("#c");
    });

    it("say which directions are open from the middle", () => {
      const journey = journeyOf("#a", "#b", "#c");

      journey.back();

      expect(journey.canGoBack).toBe(true);
      expect(journey.canGoForward).toBe(true);
    });
  });

  describe("replace", () => {
    it("rewrites the current entry without adding one", () => {
      const journey = journeyOf("#a", "#b");

      journey.replace("#b2");

      expect(journey.current).toBe("#b2");
      expect(journey.length).toBe(2);
      expect(journey.back()).toBe("#a");
    });

    it("leaves the entries ahead alone", () => {
      const journey = journeyOf("#a", "#b", "#c");

      journey.back();
      journey.replace("#b2");

      expect(journey.forward()).toBe("#c");
    });
  });

  describe("arrive", () => {
    it("ignores the fragment already current", () => {
      const journey = journeyOf("#a", "#b");

      expect(journey.arrive("#b")).toBe("same");
      expect(journey.length).toBe(2);
    });

    it("follows the browser's Back to the entry before", () => {
      const journey = journeyOf("#a", "#b");

      expect(journey.arrive("#a")).toBe("back");
      expect(journey.current).toBe("#a");
      expect(journey.canGoForward).toBe(true);
    });

    it("follows the browser's Forward to the entry after", () => {
      const journey = journeyOf("#a", "#b");

      journey.back();

      expect(journey.arrive("#b")).toBe("forward");
      expect(journey.current).toBe("#b");
      expect(journey.canGoForward).toBe(false);
    });

    it("takes a fragment it has not seen as a new step", () => {
      const journey = journeyOf("#a", "#b", "#c");

      journey.back();

      expect(journey.arrive("#pasted")).toBe("push");
      expect(journey.current).toBe("#pasted");
      expect(journey.canGoForward).toBe(false);
      expect(journey.back()).toBe("#b");
    });

    it("lands on the first entry from an empty journey", () => {
      const journey = new Journey();

      expect(journey.arrive("#a")).toBe("push");
      expect(journey.current).toBe("#a");
    });

    it("keeps a view that sits on both sides of the current one consistent", () => {
      const journey = journeyOf("#a", "#b", "#a");

      journey.back();

      // #a is both the entry before and the entry after: Back wins the tie,
      // and what the page reads, the current fragment, is right either way.
      expect(journey.arrive("#a")).toBe("back");
      expect(journey.current).toBe("#a");
      expect(journey.arrive("#b")).toBe("forward");
    });
  });
});
