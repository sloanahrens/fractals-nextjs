import { NextResponse } from "next/server";

import { readVersionInfo } from "../../../lib/version";

// The environment is read per request. DEPLOYED_AT, GIT_SHA and K_REVISION
// belong to the revision answering this request rather than to the build, so a
// prerendered answer would freeze them at whatever the build machine had.
export const dynamic = "force-dynamic";

/**
 * What the running deployment knows about itself, and nothing more: each value
 * comes from one named environment variable and is null when that variable is
 * missing or not shaped like what it claims to be.
 *
 * The four are spelled out here, as `process.env.NAME`, because the build
 * replaces that exact expression with the value it baked in; a value reached
 * through an intermediate — `readVersionInfo()` reading `process.env` itself —
 * is a lookup in the server's own environment, where NEXT_PUBLIC_BUILD_TIME,
 * being a build constant, does not exist. Enumerating them is also what keeps
 * every other variable out of the response.
 */
export async function GET() {
  return NextResponse.json(
    readVersionInfo({
      NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME,
      DEPLOYED_AT: process.env.DEPLOYED_AT,
      GIT_SHA: process.env.GIT_SHA,
      K_REVISION: process.env.K_REVISION,
    }),
  );
}
