/**
 * The deployment's params file, `deploy/params.json`, as `next.config.js` reads
 * it: once, as `next build` starts, before any TypeScript is compiled. The
 * handle it names is compiled into the server as `DEPLOYMENT_TWITTER_CREATOR`,
 * so the running image carries no params file and no request reads one
 * (`deploymentParams.ts`).
 *
 * A missing file is not an error — it is the state of every checkout that has
 * no deployment behind it. Any other failure to read it, and JSON that does not
 * parse, is thrown: a deployment whose config cannot be read must fail its
 * build rather than look like one that sets nothing.
 */

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

/** The params file, from the root of a checkout. */
const PARAMS_FILE = join("deploy", "params.json");

/** True for a file that is simply not there; every other read error is real. */
function isMissing(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

/**
 * The parsed params file under `root`.
 *
 * @param {string} root - The checkout the file is read from
 * @returns {unknown} The parsed file, or an empty object when there is no file
 * @throws when the file exists but cannot be read or is not valid JSON
 */
function readDeploymentParams(root) {
  let text;

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
 * The Twitter handle the params file gives, or null when it gives none.
 *
 * A handle is passed through as written (trimmed): the head credits the handle
 * this deployment names, rather than rewriting it into a different one. An
 * absent key, null and an empty or all-space string all mean "no handle", and
 * the head then emits no creator tag.
 *
 * @param {unknown} params - The parsed params file
 * @returns {string | null} The handle, or null for none
 * @throws {TypeError} when the file is not a JSON object, or `twitterCreator`
 *   is neither a string nor null
 */
function twitterCreatorFromParams(params) {
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new TypeError("deploy/params.json must hold a JSON object");
  }

  const value = params.twitterCreator;
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new TypeError("params.twitterCreator must be a string");
  }

  const handle = value.trim();
  return handle === "" ? null : handle;
}

/**
 * The creator a build from `root` compiles in: the params file's handle, or
 * null when the checkout has no params file or the file names none.
 *
 * @param {string} root - The checkout `next build` runs from
 * @returns {string | null} The handle, or null for none
 * @throws when the params file cannot be read or its creator is malformed
 */
function twitterCreatorAtBuild(root) {
  return twitterCreatorFromParams(readDeploymentParams(root));
}

module.exports = {
  readDeploymentParams,
  twitterCreatorFromParams,
  twitterCreatorAtBuild,
};
