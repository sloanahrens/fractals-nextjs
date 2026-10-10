import { describe, expect, it } from "vitest";

import { FRACTAL_TYPES } from "../fractalTypes";
import {
  CARD_ALT,
  CARD_TAGLINE,
  CARD_TITLE_LINES,
  DESCRIPTION,
  TITLE,
  TWITTER_DESCRIPTION,
  FRACTAL_NAMES,
  joinNames,
} from "../siteText";

const LABELS = FRACTAL_TYPES.map((type) => type.label);

describe("the description", () => {
  it("names every fractal the picker offers", () => {
    for (const label of LABELS) {
      expect(DESCRIPTION).toContain(label);
    }
  });

  it("is read from FRACTAL_TYPES, in the picker's own order", () => {
    expect(FRACTAL_NAMES).toEqual(LABELS);
    expect(DESCRIPTION).toContain(`Explore the ${joinNames(LABELS)} fractals`);
  });
});

describe("the social card's text", () => {
  it("names no fractal, so it stays true as the list grows", () => {
    for (const label of LABELS) {
      expect(CARD_TAGLINE).not.toContain(label);
    }
  });

  it("counts nothing: no digit in the tagline", () => {
    expect(CARD_TAGLINE).not.toMatch(/\d/);
  });

  it("is short enough for two lines at the card's size", () => {
    // The card wraps at 520 px in 34 px Inter; the proxy a Node suite can hold
    // is a character count, and the drawn card is the check that it reads.
    expect(CARD_TAGLINE.length).toBeLessThanOrEqual(60);
  });

  it("is the only place the tagline is written down", () => {
    // The card's picture carries the line and its alt text says so: one
    // constant, so the picture and the alt text cannot describe different
    // things.
    expect(CARD_ALT).toContain(CARD_TAGLINE);
    expect(CARD_TITLE_LINES).toEqual(["Fractal", "Explorer"]);
  });
});

describe("joinNames", () => {
  it("reads a list as English", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["a"])).toBe("a");
    expect(joinNames(["a", "b"])).toBe("a and b");
    expect(joinNames(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("the rest of the module", () => {
  it("keeps the title and the twitter line the head has always had", () => {
    expect(TITLE).toBe("Next Fractals - Interactive Fractal Explorer");
    expect(TWITTER_DESCRIPTION).toMatch(/^Generate beautiful fractals/);
  });
});
