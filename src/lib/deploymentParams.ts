/**
 * The deployment's params file, `deploy/params.json`: the one place a value
 * that belongs to this deployment rather than to the app is written down.
 *
 * The file is read once, as `next build` starts, by `next.config.js` through
 * `deploymentParamsFile.js` — a missing file means no values, an unreadable one
 * or JSON that does not parse fails the build. The one value the head needs,
 * `twitterCreator`, is compiled into the server as `DEPLOYMENT_TWITTER_CREATOR`
 * and fixed for the life of the image, so the running container carries no
 * params file and no request reads one.
 *
 * The value is never rewritten: an empty or absent one means no creator tag at
 * all, and a set one is the handle that tag carries.
 */

import type { PageMetadataConfig } from "./pageMetadata";

/**
 * The handle the build compiled in, or the empty string when the params file
 * named none. Next replaces this reference with the value `next.config.js`
 * wrote, so a running server reads no file.
 */
const BUILD_TWITTER_CREATOR = process.env.DEPLOYMENT_TWITTER_CREATOR ?? "";

/**
 * The head's deployment values, fixed at build time: the creator the params
 * file named when the app was built, or null when it named none.
 */
export function pageMetadataConfig(): PageMetadataConfig {
  const creator = BUILD_TWITTER_CREATOR.trim();

  return { twitterCreator: creator === "" ? null : creator };
}
