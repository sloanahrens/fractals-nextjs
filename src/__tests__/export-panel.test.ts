/**
 * Export size: the parts of the feature that live in the page
 *
 * What an export *is* — which sizes exist and what a file is called — is
 * `exportSize`'s own test's business. What is decided here and nowhere else is
 * how the page uses it: a size larger than the screen draws the captured view
 * on a detached canvas rather than the one on screen, the button says how far
 * along that render is and offers to cancel it, a cancelled picture is thrown
 * away, and the screen size still takes exactly the path it took before.
 *
 * The suite runs in Node with no DOM to render into, so this reads the page
 * source instead, the way the manual coordinates, share link and version tests
 * here do.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC_DIRECTORY = fileURLToPath(new URL("..", import.meta.url));
const PAGE_PATH = fileURLToPath(
  new URL("../app/FractalExplorer.tsx", import.meta.url),
);
const page = readFileSync(PAGE_PATH, "utf8");

/**
 * The body of a `const NAME = ...` function in a source, braces and all.
 *
 * What a handler does, in order, is the whole of several of these assertions —
 * the picture is thrown away only after the render returns, the memory is
 * handed back only once the blob exists — and a source walk is the only way to
 * see it without a browser.
 */
function functionBody(source: string, name: string): string {
  const declaration = source.indexOf(`const ${name} = `);
  if (declaration === -1) throw new Error(`${name} is not in the page`);

  const open = source.indexOf("{", declaration);
  let depth = 0;

  for (let index = open; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) {
      return source.slice(open, index + 1);
    }
  }

  throw new Error(`unbalanced braces in ${name}`);
}

describe("the export size panel", () => {
  it("reads the page it is checking", () => {
    expect(relative(SRC_DIRECTORY, PAGE_PATH)).toBe("app/FractalExplorer.tsx");
    expect(page.length).toBeGreaterThan(1000);
  });

  it("sits in the Settings drawer, with the button that saves it", () => {
    // The select's own text, not the label in a comment: an anchor that landed
    // in prose would pass wherever the control was.
    const drawer = page.indexOf("<SettingsDrawer");
    const exportSelect = page.indexOf('label="Export size"');
    // The text the buttons carry. Download PNG's is a string in the label the
    // exporting state switches to, and Cancel is the element's own text.
    const downloadButton = page.indexOf('"Download PNG"');
    const cancelButton = page.search(/>\s*Cancel\s*</);
    const drawerEnd = page.indexOf("</SettingsDrawer>");

    expect(drawer).toBeGreaterThan(-1);
    expect(exportSelect).toBeGreaterThan(drawer);
    expect(downloadButton).toBeGreaterThan(exportSelect);
    expect(cancelButton).toBeGreaterThan(downloadButton);
    expect(drawerEnd).toBeGreaterThan(cancelButton);
  });

  it("adds nothing to the canvas or the top bar", () => {
    // The bead draws the line at the drawer: an export control on the picture
    // or in the bar is the change it rules out.
    for (const component of ["<TopBar", "<FractalSwitcher", "<WanderControl"]) {
      const start = page.indexOf(component);
      expect(start).toBeGreaterThan(-1);
      const end = page.indexOf("/>", start);
      expect(page.slice(start, end)).not.toContain("Export size");
    }
  });

  it("builds its options from the canvas size", () => {
    // The list is the helper's, asked for the canvas on screen now, and each
    // option's label is the helper's own wording — the pixel counts come from
    // the code that decided the sizes, not from a second copy here.
    const options = page.indexOf("exportSizeOptions = useMemo(");

    expect(options).toBeGreaterThan(-1);
    expect(page).toContain("exportSizes(canvasWidth, canvasHeight)");
    expect(page).toContain("label: size.label");
  });

  it("drops a selection the new canvas size no longer offers", () => {
    // A <select> whose value is not among its options paints blank, and the
    // canvas size is a control the user can move at any moment.
    const fallback = page.indexOf(
      "if (!exportSizeOptions.some((size) => size.scale === exportScale)) {",
    );

    expect(fallback).toBeGreaterThan(-1);
    expect(page.indexOf("setExportScale(1)", fallback)).toBeGreaterThan(
      fallback,
    );
  });
});

describe("the screen size", () => {
  it("saves the canvas on screen, under the name it always had", () => {
    const download = functionBody(page, "handleDownload");
    const screenPath = download.indexOf("if (size.scale === 1) {");
    // Everything the screen-size branch does, up to the export it never
    // reaches.
    const branchEnd = download.indexOf("void runExport(");
    const branch = download.slice(screenPath, branchEnd);

    expect(screenPath).toBeGreaterThan(-1);
    expect(branchEnd).toBeGreaterThan(screenPath);
    // The canvas it saves is the one on screen, and the name is the one
    // downloadFileName builds: a screen-size download is the save this button
    // has always done, with no export step in it.
    expect(download).toContain("canvasRef.current");
    expect(branch).toContain("saveCanvasPng(");
    expect(branch).toContain("downloadFileName(");
    expect(branch).not.toContain("exportFileName(");
    expect(branch).not.toContain("runExport(");
  });

  it("waits for the render drawing on that canvas, unlike the larger sizes", () => {
    // The screen-size save reads a canvas that may be half drawn; an export
    // draws a canvas of its own and has nothing to wait for.
    expect(page).toContain("exporting || (exportScale === 1 && isRendering)");
  });
});

describe("a size larger than the screen", () => {
  it("draws the captured view on a detached canvas", () => {
    const export_ = functionBody(page, "runExport");

    expect(export_).toContain('document.createElement("canvas")');
    expect(export_).toContain("new FractalRenderer(canvas, fractalKind)");
    expect(export_).toContain("renderer.renderFractal(config, onProgress)");
    // The view and the settings are read here, where the export was asked for,
    // and the canvas the page shows is not among them: it is neither read nor
    // resized, so it keeps its size and its content while this draws.
    expect(export_).toContain("bounds,");
    expect(export_).toContain("colorScheme,");
    expect(export_).not.toContain("canvasRef");
  });

  it("names the file after the size and the view", () => {
    const export_ = functionBody(page, "runExport");

    expect(export_).toContain("exportFileName(");
    expect(export_).toContain("downloadFileName(centerX, centerY, zoomLevel");
    expect(export_).toContain("size.scale,");
  });
});

describe("an export running", () => {
  it("says how far along it is, no more often than the throttle allows", () => {
    const export_ = functionBody(page, "runExport");

    expect(export_).toContain("exportProgressDue(now, exportReportedAtRef");
    expect(export_).toContain("exportReportedAtRef.current = now");
    // The button's own text, and it carries the percentage the render last
    // reported.
    expect(page).toContain("Exporting... ${Math.round(exportState.progress");
  });

  it("offers a Cancel button that stops the render and discards the picture", () => {
    const cancel = functionBody(page, "handleCancelExport");
    const export_ = functionBody(page, "runExport");

    expect(cancel).toContain("exportTokenRef.current++");
    expect(cancel).toContain("cancelRender()");
    // A picture that arrives after the token moved on is dropped rather than
    // handed to the browser, and the check is before the save.
    const dropped = export_.indexOf("if (token !== exportTokenRef.current)");
    const saved = export_.indexOf("saveCanvasPng(canvas, name");

    expect(dropped).toBeGreaterThan(-1);
    expect(saved).toBeGreaterThan(dropped);
  });

  it("only runs one at a time", () => {
    // The button carries both states, so a second export cannot be asked for
    // while one is drawing.
    expect(page).toContain('if (exportState.kind === "running") return;');
    expect(page).toContain("disabled={downloadDisabled}");
  });

  it("hands the export's memory back once the picture is saved", () => {
    const release = functionBody(page, "releaseExport");

    expect(release).toContain("canvas.width = 0");
    expect(release).toContain("canvas.height = 0");
    // The blob's URL is released as before, and the export's canvas goes when
    // the browser has taken the blob rather than while it is still reading it.
    expect(page).toContain("URL.revokeObjectURL(url)");

    const export_ = functionBody(page, "runExport");
    const settled = export_.indexOf("saveCanvasPng(canvas, name");
    expect(export_.indexOf("releaseExport()", settled)).toBeGreaterThan(
      settled,
    );
  });
});

describe("an export that cannot be made", () => {
  it("says so, and leaves the page usable", () => {
    const export_ = functionBody(page, "runExport");

    // A canvas the browser will not give an image buffer for is caught where
    // it is created, and the failure is a message rather than a crash.
    const creation = export_.indexOf("new FractalRenderer(canvas, fractalKind)");
    const caught = export_.indexOf("catch (error)", creation);

    expect(caught).toBeGreaterThan(creation);
    expect(export_.indexOf("EXPORT_FAILED_MESSAGE", caught)).toBeGreaterThan(
      caught,
    );
    // The same message when the browser declines to make the blob, which is
    // the export's other way of not arriving.
    expect(export_).toContain(
      ': { kind: "error", text: EXPORT_FAILED_MESSAGE }',
    );
  });

  it("shows the message in a status region", () => {
    const status = page.indexOf('role="status"', page.indexOf('exportState.kind === "error"'));

    expect(page).toContain('exportState.kind === "error" && (');
    expect(status).toBeGreaterThan(-1);
    expect(page).toContain("{exportState.text}");
  });
});
