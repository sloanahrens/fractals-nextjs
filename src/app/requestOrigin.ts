import { headers } from "next/headers";
import { siteOrigin } from "@/lib/siteOrigin";

/**
 * The origin this request was served from, for the page's absolute URLs. One
 * image goes to staging and production unchanged, so the origin cannot be baked
 * in at build time; `siteOrigin` reads it from the proxy's headers and
 * validates it.
 */
export async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();

  return siteOrigin((name) => requestHeaders.get(name), {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}
