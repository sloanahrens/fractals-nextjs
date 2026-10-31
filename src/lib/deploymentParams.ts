/**
 * The deployment's params file, `deploy/params.json`: the one place a value
 * that belongs to this deployment rather than to the app is written down.
 * The file is generated for a deployment and is not committed, so a plain
 * checkout has none, and then every value in it reads as absent.
 *
 * This module reads the one value the head needs, `twitterCreator`; the rest
 * of the file belongs to the other rows of the same plan and is not read here.
 * The value is never rewritten: an empty or absent one means no creator tag at
 * all, and a set one is the handle that tag carries.
 *
 * A missing file is not an error — it is the state of every checkout that has
 * no deployment behind it. Any other failure to read it, and JSON that does
 * not parse, is thrown rather than read as "no values": a deployment whose
 * config cannot be read must not look like one that sets nothing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PageMetadataConfig } from "./pageMetadata";

/** The params file, from the root of a checkout. */
const PARAMS_FILE = join("deploy", "params.json");

/** True for a file that is simply not there; every other read error is real. */
function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * The Twitter handle the params file gives, or null when it gives none.
 *
 * A handle is passed through as written (trimmed): the head credits the handle
 * this deployment names, rather than rewriting it into a different one. An
 * absent key, null and an empty or all-space string all mean "no handle", and
 * the head then emits no creator tag.
 *
 * @param params - The parsed params file
 * @throws TypeError when the file is not a JSON object, or `twitterCreator` is
 *   neither a string nor null
 */
export function twitterCreatorFromParams(params: unknown): string | null {
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new TypeError("deploy/params.json must hold a JSON object");
  }

  const value = (params as Record<string, unknown>).twitterCreator;
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new TypeError("params.twitterCreator must be a string");
  }

  const handle = value.trim();
  return handle === "" ? null : handle;
}

/**
 * The parsed params file under `root`.
 *
 * @param root - The checkout the file is read from; the working directory by
 *   default, which is the app's root both under `next build` and in the
 *   standalone server
 * @returns The parsed file, or an empty object when there is no file
 * @throws when the file exists but cannot be read or is not valid JSON
 */
export function readDeploymentParams(root: string = process.cwd()): unknown {
  let text: string;

  try {
    text = readFileSync(join(root, PARAMS_FILE), "utf8");
  } catch (error) {
    if (isMissing(error)) return {};
    throw error;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("deploy/params.json is not valid JSON");
  }
}

/**
 * The head's deployment values, read from the params file under `root`.
 *
 * @param root - The checkout the file is read from; the working directory by
 *   default
 */
export function readPageMetadataConfig(
  root: string = process.cwd(),
): PageMetadataConfig {
  return { twitterCreator: twitterCreatorFromParams(readDeploymentParams(root)) };
}

let cached: PageMetadataConfig | undefined;

/**
 * `readPageMetadataConfig` for the running server, read once per process: the
 * params file is a property of the deployment, not of a request, so a page
 * view does not re-read it.
 */
export function pageMetadataConfig(): PageMetadataConfig {
  cached ??= readPageMetadataConfig();
  return cached;
}
