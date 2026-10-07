import { describe, expect, it } from "vitest";

import { RenderQualityDecider } from "../renderQuality";

describe("RenderQualityDecider", () => {
  it("draws at full quality when no gesture is moving the view", () => {
    const decider = new RenderQualityDecider();

    expect(decider.requestRender()).toBe("full");
  });

  it("draws a preview for every step of a gesture", () => {
    const decider = new RenderQualityDecider();
    decider.beginGesture();

    expect(decider.requestRender()).toBe("preview");
    expect(decider.requestRender()).toBe("preview");
    expect(decider.requestRender()).toBe("preview");
  });

  it("owes a full render when a gesture moved the view", () => {
    const decider = new RenderQualityDecider();
    decider.beginGesture();
    decider.requestRender();

    expect(decider.endGesture()).toBe(true);
  });

  it("owes nothing when a gesture never moved the view", () => {
    const decider = new RenderQualityDecider();
    decider.beginGesture();

    expect(decider.endGesture()).toBe(false);
  });

  it("owes a full render for a frame cancelled while the gesture ran", () => {
    // Nothing moved, but the canvas was left holding a half-drawn frame from
    // a full render the gesture interrupted.
    const decider = new RenderQualityDecider();
    decider.beginGesture();
    decider.invalidate();

    expect(decider.endGesture()).toBe(true);
  });

  it("owes the same full render only once", () => {
    const decider = new RenderQualityDecider();
    decider.beginGesture();
    decider.requestRender();

    expect(decider.endGesture()).toBe(true);
    expect(decider.endGesture()).toBe(false);
  });

  it("draws at full quality again once the gesture is over", () => {
    const decider = new RenderQualityDecider();
    decider.beginGesture();
    decider.requestRender();
    decider.endGesture();

    expect(decider.requestRender()).toBe("full");
  });

  it("owes nothing after the owed render has been drawn", () => {
    const decider = new RenderQualityDecider();
    decider.beginGesture();
    decider.requestRender();
    expect(decider.endGesture()).toBe(true);

    // The caller draws the full render the gesture was owed.
    expect(decider.requestRender()).toBe("full");

    expect(decider.endGesture()).toBe(false);
  });

  it("does not carry one gesture's debt into the next", () => {
    const decider = new RenderQualityDecider();
    decider.beginGesture();
    decider.requestRender();
    decider.endGesture();

    decider.beginGesture();
    expect(decider.endGesture()).toBe(false);
  });
});
