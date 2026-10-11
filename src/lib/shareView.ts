/**
 * The browser's own share sheet, for the view on screen.
 *
 * A phone can send a link straight to the app the visitor wants it in, which is
 * one tap instead of copy, switch app, paste. Only some browsers have the API —
 * Safari and Chrome on Android do, desktop Firefox does not — so a Share button
 * is offered only where there is a sheet to open and Copy link stands alone
 * everywhere else.
 *
 * The three decisions are here rather than in the page, so a Node suite can
 * drive them: whether there is a sheet at all, what to hand it, and what a
 * refusal means. The button the page draws makes none of its own.
 *
 * What it hands over is the link Copy link puts on the clipboard, built by
 * `copyLinkUrl` so the sheet and the clipboard cannot disagree about the URL,
 * with the head's own title for the view (`describeViewLine` plus `TITLE`) —
 * so the words the sheet shows are the words a chat shows for the same link.
 */

import { TITLE } from "./siteText";
import { copyLinkUrl } from "./viewQuery";

/** What the sheet is handed: the view's own title and the query-form link. */
export interface SharePayload {
  title: string;
  url: string;
}

/** Opening a sheet, as `navigator.share` does; it settles when the sheet closes. */
export type ShareSheet = (data: SharePayload) => Promise<void>;

/** The part of `navigator` a share sheet needs, so a test can hand over a stand-in. */
export interface ShareNavigator {
  share?: (data: SharePayload) => Promise<void>;
  canShare?: (data: SharePayload) => boolean;
}

/**
 * The sheet this browser opens, or null where there is none.
 *
 * `navigator.share` is the whole of the test. It is called after mount and
 * never while rendering, so the server and the first client render both draw a
 * page without the button and no hydration can mismatch.
 *
 * @param navigator - `navigator`, or a stand-in
 * @returns A function that opens the sheet, or null
 */
export function shareSheet(
  navigator: ShareNavigator | null | undefined,
): ShareSheet | null {
  const share = navigator?.share;
  if (typeof share !== "function") return null;

  // Called on the navigator it came from: a WebIDL method detached from its
  // receiver is allowed to refuse.
  return (data) => share.call(navigator, data);
}

/**
 * "Julia set, Dendrite, 400x - Next Fractals - Interactive Fractal Explorer":
 * the title the sheet carries, which is the title the head gives the same link
 * (`pageMetadata.ts`).
 *
 * @param line - The view's line, as `describeViewLine` writes it
 */
export function shareTitle(line: string): string {
  return `${line} - ${TITLE}`;
}

/** Where the view is: the link's own text, and the origin and path it rides on. */
export interface ShareView {
  /** `window.location.origin` */
  origin: string;
  /** `window.location.pathname` */
  pathname: string;
  /** The view as `encodeView` writes it, no leading `#` */
  link: string;
  /** The view's line, as `describeViewLine` writes it */
  line: string;
}

/**
 * What Share hands the sheet: the query form of the link Copy link copies, on
 * this origin and path, under the view's own title.
 *
 * The query form rather than the fragment, for the reason Copy link uses it: a
 * crawler sees a query and never a fragment, so only that form previews as the
 * view it names.
 *
 * @param view - The link and the title to build from
 */
export function shareViewPayload(view: ShareView): SharePayload {
  return {
    title: shareTitle(view.line),
    url: copyLinkUrl(view.origin, view.pathname, view.link),
  };
}

/**
 * Whether this browser will open a sheet for that payload.
 *
 * `navigator.canShare` is optional and, where it is there, it is asked with the
 * payload actually being sent rather than about sharing in general. A browser
 * without it shares whatever it is given, so it counts as a yes.
 *
 * @param navigator - `navigator`, or a stand-in
 * @param payload - What the sheet would be handed
 * @returns False when the sheet must not be opened
 */
export function canSharePayload(
  navigator: ShareNavigator | null | undefined,
  payload: SharePayload,
): boolean {
  if (typeof navigator?.canShare !== "function") return true;

  try {
    return navigator.canShare(payload) === true;
  } catch {
    // A browser that throws instead of answering has not said yes.
    return false;
  }
}

/**
 * What a rejected share means for the visitor.
 *
 * Dismissing the sheet rejects with `AbortError`. That is the visitor's own
 * answer — they chose not to share — so it says nothing and does nothing.
 * Every other rejection (a sheet that failed to open, a payload the platform
 * refused) leaves the link with Copy link instead.
 *
 * @param error - What the share rejected with, of any shape
 * @returns `"cancelled"` to stay silent, `"fallback"` to offer the copy flow
 */
export function shareOutcome(error: unknown): "cancelled" | "fallback" {
  const name =
    typeof error === "object" && error !== null
      ? (error as { name?: unknown }).name
      : undefined;

  return name === "AbortError" ? "cancelled" : "fallback";
}

// The store `useSyncExternalStore` reads, in the shape orbitPlot.ts uses for
// `prefers-reduced-motion`. Having a sheet is a fact about the browser that
// never changes while the page is open, so there is nothing to subscribe to:
// the hook reads the client snapshot once after mounting, finds it differs from
// the server snapshot it hydrated with, and renders the button then. That is
// what keeps the button out of the prerendered HTML and out of the first client
// render, and so out of any hydration mismatch.

/** Nothing to listen to: a browser does not grow a share sheet while the page is open. */
export function subscribeToShareSupport(): () => void {
  return () => {};
}

/** Whether this browser opens a sheet. */
export function getShareSupportSnapshot(): boolean {
  return shareSheet(globalThis.navigator) !== null;
}

/** The server has no `navigator`, so it draws no Share button. */
export function getServerShareSupportSnapshot(): boolean {
  return false;
}
