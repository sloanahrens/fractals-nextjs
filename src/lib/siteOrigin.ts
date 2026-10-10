/** Where the page is served from, when nothing in the request or the environment says. */
export const FALLBACK_ORIGIN = "http://localhost:3000";

/** A hostname (letters, digits, dots, hyphens) with an optional port, and nothing else. */
const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i;

const LOCAL_HOST_PATTERN = /^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/i;

/** Reads one request header; `null` or `undefined` when it is absent. */
export type HeaderReader = (name: string) => string | null | undefined;

/** The one environment variable the origin may come from. */
export interface SiteOriginEnv {
  NEXT_PUBLIC_APP_URL?: string;
}

/** The first entry of a proxy's comma-separated list, trimmed. */
function firstValue(value: string | null | undefined): string {
  return (value ?? "").split(",")[0].trim();
}

/** A host that is only a hostname and a port, lower-cased; `null` for anything else. */
function validHost(value: string | null | undefined): string | null {
  const host = firstValue(value);
  return HOST_PATTERN.test(host) ? host.toLowerCase() : null;
}

/** The origin of an absolute http(s) URL; `null` for anything else. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * The origin this request was served from, for the page's absolute URLs.
 *
 * One image is deployed to staging and production, so nothing about the origin
 * can be baked in at build time: it is read off the request. The proxy's
 * `x-forwarded-host` wins, then `host`; the scheme is `x-forwarded-proto`
 * (`http` or `https`), else https, except that a local host with no forwarded
 * scheme is http, as `next dev` serves it. A host header that is not a plain
 * hostname and port (a path, a space, a scheme, a quote) is not echoed: it is
 * treated as absent. With no usable host the origin is `NEXT_PUBLIC_APP_URL`
 * when that is an http(s) URL, else {@link FALLBACK_ORIGIN}.
 *
 * @param getHeader - Reads a request header by name
 * @param env - The environment, for the `NEXT_PUBLIC_APP_URL` fallback
 * @returns An origin with no trailing slash, e.g. `https://example.com`
 */
export function siteOrigin(
  getHeader: HeaderReader,
  env: SiteOriginEnv = {},
): string {
  const host =
    validHost(getHeader("x-forwarded-host")) ?? validHost(getHeader("host"));

  if (host) {
    const proto = firstValue(getHeader("x-forwarded-proto")).toLowerCase();
    if (proto === "http" || proto === "https") return `${proto}://${host}`;
    return `${LOCAL_HOST_PATTERN.test(host) ? "http" : "https"}://${host}`;
  }

  return originOf(env.NEXT_PUBLIC_APP_URL) ?? FALLBACK_ORIGIN;
}
