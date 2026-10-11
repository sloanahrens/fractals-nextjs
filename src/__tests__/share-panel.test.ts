/**
 * The Share button: the parts of it that live in the page.
 *
 * Whether the browser has a sheet, what it is handed and what a refusal means
 * are `shareView.test.ts`'s business. What is left is a wiring question no
 * browser is needed for: the button is beside Copy link, it is drawn only where
 * there is a sheet (after mounting, so no hydration can mismatch), it hands the
 * sheet the same link Copy link copies, and a sheet that will not open leaves
 * the link to the copy flow rather than to nothing. The suite runs in Node with
 * no DOM to render into, so this reads the page source instead, the way the
 * share link and Copy tour link tests here do.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PAGE_PATH = fileURLToPath(
  new URL("../app/FractalExplorer.tsx", import.meta.url),
);
const page = readFileSync(PAGE_PATH, "utf8");

/** The body of a `const NAME = ...` function in the page, braces and all. */
function functionBody(name: string): string {
  const declaration = page.indexOf(`const ${name} = `);
  if (declaration === -1) throw new Error(`${name} is not in the page`);

  const open = page.indexOf("{", declaration);
  let depth = 0;

  for (let index = open; index < page.length; index++) {
    if (page[index] === "{") depth++;
    if (page[index] === "}" && --depth === 0) {
      return page.slice(open, index + 1);
    }
  }

  throw new Error(`unbalanced braces in ${name}`);
}

describe("the Share button", () => {
  it("sits beside Copy link in the Navigation card, and only there", () => {
    const copy = page.search(/>\s*Copy link\s*</);
    const share = page.search(/>\s*Share\s*</);
    const tour = page.search(/>\s*Copy tour link\s*</);

    expect(copy).toBeGreaterThan(-1);
    expect(share).toBeGreaterThan(copy);
    expect(tour).toBeGreaterThan(share);
    expect(page.match(/>\s*Share\s*</g)).toHaveLength(1);
    expect(page).toContain("onClick={handleShare}");
    expect(page).toContain("const handleShare = ");
  });

  it("is drawn in the neighbours' own style, and only where there is a sheet", () => {
    const onClick = page.indexOf("onClick={handleShare}");
    const button = page.slice(
      page.lastIndexOf("<Button", onClick),
      page.indexOf("</Button>", onClick),
    );

    expect(button).toContain('variant="secondary"');
    expect(button).toContain('size="sm"');
    // The words are the accessible name, and they are the button's own.
    expect(button).toContain("Share");
    expect(page).toContain("{shareOffered && (");
  });

  it("is decided after mounting, so the server and the first render agree", () => {
    // The lookup is the hook's, not an effect that sets state: the server
    // snapshot is the fallback and the client snapshot is read afterwards,
    // which is what keeps the button out of the prerendered HTML and out of
    // the first client render. A read of `navigator` while rendering would be
    // markup the server cannot produce.
    const from = page.indexOf("const shareOffered = useSyncExternalStore(");
    const store = page.slice(from, page.indexOf(");", from));

    expect(store).toContain("subscribeToShareSupport");
    expect(store).toContain("getShareSupportSnapshot");
    expect(store).toContain("getServerShareSupportSnapshot");
    // Nothing sets it from an effect.
    expect(page).not.toContain("setShareOffered");
  });

  it("hands the sheet the same link Copy link copies, and no other", () => {
    const share = functionBody("handleShare");

    // The palette rule is Copy link's: the picture on screen now, which while
    // the palette is cycling is where the animation has reached.
    expect(share).toContain("const link = viewLinkFor(cycleShiftRef.current);");
    expect(share).toContain("shareViewPayload({");
    expect(share).toContain("window.location.origin");
    expect(share).toContain("window.location.pathname");
    // The title is the head's own line for the view, so the sheet and a chat
    // that follows the link say the same words.
    expect(share).toContain("describeViewLine(viewLinkUpdatesFrom(`#${link}`))");
    // The URL is the helper's, which builds it with Copy link's own
    // `copyLinkUrl`: the page has exactly one call to it, in Copy link, and
    // Share invents no second form.
    expect(share).not.toContain("copyLinkUrl");
    expect(page.match(/copyLinkUrl\(/g)).toHaveLength(1);
    expect(functionBody("handleCopyLink")).toContain("copyLinkUrl(");
    // The address bar names the view on screen already, and the sheet needs
    // nothing of it.
    expect(share).not.toContain("writeViewLink");
  });

  it("falls back to the copy flow when the sheet will not open", () => {
    const share = functionBody("handleShare");

    // A browser with no sheet, and one that says this payload is not
    // shareable, are the same answer: the link goes to the clipboard.
    expect(share).toContain("shareSheet(navigator)");
    expect(share).toContain("canSharePayload(navigator, payload)");
    expect(share).toContain("copyUrl(payload.url)");
    // The visitor dismissing the sheet is silent; anything else falls back.
    expect(share).toContain('shareOutcome(error) === "fallback"');
    // The clipboard itself is Copy link's: Share goes through the one function
    // both buttons use, so there is no second write.
    expect(share).not.toContain("navigator.clipboard");
    expect(page.match(/clipboard\.writeText\(/g)).toHaveLength(1);
  });
});
