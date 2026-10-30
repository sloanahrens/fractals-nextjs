/**
 * `make smoke` fails, and says why, when a deployed app is not answering
 *
 * The smoke target is the one check that runs against a service rather than
 * against this checkout, so the way it fails is the whole of it: a service that
 * answers a 500 on its health path, and a URL that nothing is listening on,
 * both have to come back as a non-zero exit with the reason printed.
 *
 * The two checks here watch a service fail, and health.sh polls until its
 * timeout has elapsed before it gives up: it refuses a timeout under a second,
 * and the run already sets the three waits it reads to their floor. That
 * second, twice over, is the script's own contract -- a real wait rather than
 * overhead -- which is why the checks sit here in the integration tier instead
 * of in the unit run (src/__tests__/smoke-target.test.ts holds the three that
 * answer at once). The stand-in and the run they share are
 * src/lib/__tests__/smokeHarness.ts; nothing here calls the deployment this
 * tier tests, so the check needs no INTEGRATION_URL of its own.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  HEALTH,
  PAGE,
  closeStandIn,
  closeStandIns,
  reasonFor,
  smoke,
  standIn,
} from "@/lib/__tests__/smokeHarness";

afterEach(closeStandIns);

describe("make smoke", () => {
  it("fails with the reason when the health path answers 500", async () => {
    const app = await standIn({ [HEALTH]: 500 });

    const result = await smoke(app.url);

    expect(result.status).not.toBe(0);
    expect(reasonFor(result.stdout, HEALTH)).toContain("500");
  });

  it("fails with the reason when nothing is listening on the URL", async () => {
    const app = await standIn();
    const gone = app.url;
    // The port this file's own stand-in had, now closed: a URL that was a
    // service a moment ago and is nothing at all now, which is what a torn-down
    // deployment looks like from here.
    await closeStandIn(app.server);

    const result = await smoke(gone);

    expect(result.status).not.toBe(0);
    // The health path's reason is health.sh's, and it reports curl's 000 as the
    // last status it saw; the paths after it are this script's own, and they
    // are where "nothing answered" is said in as many words.
    expect(reasonFor(result.stdout, HEALTH)).not.toBeNull();
    expect(reasonFor(result.stdout, PAGE)).toContain("no response");
  });
});
