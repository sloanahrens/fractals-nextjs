/**
 * Where the integration tier points, and what it expects to find there.
 *
 * `make test` is the unit suite and never leaves this machine. The integration
 * tier is the other half of the tests and calls an app that is already
 * deployed, so it has no default to fall back on: a default would be a guess
 * about which environment a change was just shipped to. The two things it needs
 * from the environment — the URL to call and the commit that URL should be
 * serving — are read here, once, and the tests are then only about what came
 * back.
 */

/** How long one request may take before it is abandoned, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The deployment to test, whichever environment it is. Required — there is
 * nothing sensible to default to.
 */
export const INTEGRATION_URL_VAR = "INTEGRATION_URL";

/**
 * The older name for the same thing, from when the tier only called staging. It
 * still works, and INTEGRATION_URL wins when both are set.
 */
export const STAGING_URL_VAR = "STAGING_URL";

/** The commit the deployment should be serving. Optional. */
export const EXPECT_SHA_VAR = "EXPECT_SHA";

/** What the tier reads, and what it will not read. */
export interface IntegrationTarget {
  /** The deployment to call, with no trailing slash. */
  baseUrl: string;
  /** The commit it should be serving, or null when the caller did not say. */
  expectSha: string | null;
}

/**
 * Said, on one line, when neither variable is set. The Makefile's
 * `check-integration-url` echoes the same line before node_modules exists, and
 * `make-targets.test.ts` fails if the two stop being identical.
 */
export const MISSING_URL_MESSAGE =
  "INTEGRATION_URL (or its alias STAGING_URL) is not set: make integration INTEGRATION_URL=<url> [EXPECT_SHA=<commit>]";

/** The hint after a URL that is set but unusable. */
const USAGE = `Set ${INTEGRATION_URL_VAR} to the deployment to test, for example:
  make integration INTEGRATION_URL=https://fractals-nextjs-staging-example.run.app
  INTEGRATION_URL=https://... npm run test:integration

EXPECT_SHA=<commit> is optional, and makes the version check exact.`;

/** A value that is there rather than blank, with the blanks gone. */
function present(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * Read the integration tier's target from an environment.
 *
 * @param env - The environment to read; the process's own by default
 * @returns The URL to call and the commit to expect, if one was given
 * @throws When neither INTEGRATION_URL nor STAGING_URL is set, or the one that
 *   is, is blank, not a URL, or not http(s) — each with the command to type,
 *   because a run without it has nothing to test and the message is the only
 *   thing it can usefully say
 */
export function resolveIntegrationTarget(
  env: Record<string, string | undefined> = process.env,
): IntegrationTarget {
  const name = present(env[INTEGRATION_URL_VAR])
    ? INTEGRATION_URL_VAR
    : STAGING_URL_VAR;
  const raw = present(env[name]);
  if (!raw) throw new Error(MISSING_URL_MESSAGE);

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} is not a URL: ${raw}\n\n${USAGE}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `${name} must be an http or https URL, not ${parsed.protocol}\n\n${USAGE}`,
    );
  }

  return {
    // A URL pasted with a trailing slash is the same deployment, and the paths
    // below start with their own slash.
    baseUrl: raw.replace(/\/+$/, ""),
    expectSha: present(env[EXPECT_SHA_VAR]),
  };
}

/**
 * `baseUrl` and `path` as one URL, with exactly one slash between them, so a
 * caller can write either `/api/health` or `api/health`.
 */
export function requestUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
