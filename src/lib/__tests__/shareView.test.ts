/**
 * The share sheet's three decisions, without a browser.
 *
 * Whether there is a sheet, what it is handed and what a refusal means are the
 * whole of what the Share button does; the button itself only calls these. The
 * payload reuses `copyLinkUrl`, so the sheet and the clipboard cannot disagree
 * about the URL — which is what the first case below pins.
 */
import { describe, expect, it, vi } from "vitest";

import {
  canSharePayload,
  getServerShareSupportSnapshot,
  getShareSupportSnapshot,
  shareOutcome,
  shareSheet,
  shareTitle,
  shareViewPayload,
  type ShareNavigator,
  type SharePayload,
} from "../shareView";
import { TITLE } from "../siteText";
import { copyLinkUrl } from "../viewQuery";

const PAYLOAD: SharePayload = {
  title: "Julia set, Dendrite, 400x - a title",
  url: "https://example.test/?v=1&f=julia",
};

describe("finding the sheet", () => {
  it("is the browser's own, and only when it has one", () => {
    const share = vi.fn(() => Promise.resolve());

    expect(shareSheet({ share })).toBeTypeOf("function");
    expect(shareSheet({ share: undefined })).toBeNull();
    expect(shareSheet({})).toBeNull();
    expect(shareSheet(undefined)).toBeNull();
    expect(shareSheet(null)).toBeNull();
    // A browser with something else under that name has no sheet either.
    expect(
      shareSheet({ share: "yes" } as unknown as ShareNavigator),
    ).toBeNull();
  });

  it("opens with the payload, on the navigator it came from", async () => {
    const calls: { on: unknown; data: SharePayload }[] = [];
    const browser = {
      share(this: unknown, data: SharePayload) {
        calls.push({ on: this, data });
        return Promise.resolve();
      },
    };

    await shareSheet(browser)!(PAYLOAD);

    expect(calls).toHaveLength(1);
    expect(calls[0].data).toBe(PAYLOAD);
    // The receiver is the navigator it was asked of, not the detached method.
    expect(calls[0].on).toBe(browser);
  });

  it("is what decides the button, and never on the server", () => {
    // The snapshot the page hydrates with: no navigator, no button. The client
    // snapshot is read from the browser's own `navigator`, which is the real
    // one under the test runner's Node environment and has no share there.
    expect(getServerShareSupportSnapshot()).toBe(false);
    expect(getShareSupportSnapshot()).toBe(
      typeof globalThis.navigator?.share === "function",
    );
  });
});

describe("asking whether the sheet will open", () => {
  it("is a yes from a browser that cannot answer", () => {
    expect(canSharePayload({ share: () => Promise.resolve() }, PAYLOAD)).toBe(
      true,
    );
    expect(canSharePayload(undefined, PAYLOAD)).toBe(true);
  });

  it("is the browser's own answer where there is one", () => {
    const canShare = vi.fn(() => true);

    expect(canSharePayload({ share: () => Promise.resolve(), canShare }, PAYLOAD)).toBe(
      true,
    );
    expect(canShare).toHaveBeenCalledWith(PAYLOAD);

    expect(
      canSharePayload(
        { share: () => Promise.resolve(), canShare: () => false },
        PAYLOAD,
      ),
    ).toBe(false);
  });

  it("is a no from a browser that throws instead of answering", () => {
    expect(
      canSharePayload(
        {
          share: () => Promise.resolve(),
          canShare: () => {
            throw new TypeError("cannot share that");
          },
        },
        PAYLOAD,
      ),
    ).toBe(false);
  });
});

describe("what a rejection means", () => {
  it("stays silent when the visitor dismissed the sheet", () => {
    expect(shareOutcome(new DOMException("Share canceled", "AbortError"))).toBe(
      "cancelled",
    );
    // The name is the whole of the test: an error of any shape that carries it.
    expect(shareOutcome({ name: "AbortError" })).toBe("cancelled");
  });

  it("offers Copy link for anything else", () => {
    expect(shareOutcome(new Error("no sheet"))).toBe("fallback");
    expect(shareOutcome(new DOMException("nope", "NotAllowedError"))).toBe(
      "fallback",
    );
    expect(shareOutcome(undefined)).toBe("fallback");
    expect(shareOutcome(null)).toBe("fallback");
    expect(shareOutcome("AbortError")).toBe("fallback");
  });
});

describe("what the sheet is handed", () => {
  it("is the query form Copy link copies, so the two cannot drift", () => {
    const view = {
      origin: "https://example.test",
      pathname: "/explore",
      link: "v=1&f=julia&k=Dendrite&x=-0.5&y=0.25&z=400&s=rainbow&i=auto",
      line: "Julia set, Dendrite, 400x",
    };

    const payload = shareViewPayload(view);

    expect(payload.url).toBe(copyLinkUrl(view.origin, view.pathname, view.link));
    expect(payload.url).toBe(
      `https://example.test/explore?${view.link}`,
    );
    // A query and not a fragment: a crawler never sees after the `#`, so only
    // this form previews as the view.
    expect(payload.url).not.toContain("#");
  });

  it("carries the view's own title, as the head writes it", () => {
    expect(shareTitle("Julia set, Dendrite, 400x")).toBe(
      `Julia set, Dendrite, 400x - ${TITLE}`,
    );
    expect(
      shareViewPayload({
        origin: "https://example.test",
        pathname: "/",
        link: "v=1",
        line: "Mandelbrot set, 1x",
      }).title,
    ).toBe(`Mandelbrot set, 1x - ${TITLE}`);
  });
});
