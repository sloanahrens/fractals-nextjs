/**
 * `make smoke` answers at once when it passes, and says why when a path does
 * not
 *
 * The three checks here are the ones that come back without waiting: a service
 * that answers every path, a page that answers a 500, and a run that was given
 * no service at all. The two that watch a failing service the slow way -- a 500
 * on the health path, and a URL nothing is listening on -- wait out health.sh's
 * retry loop and live in the integration tier
 * (tests/integration/smoke-target.test.ts); the stand-in they all run against
 * is src/lib/__tests__/smokeHarness.ts.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  CHECKED,
  HEALTH,
  PAGE,
  closeStandIns,
  reasonFor,
  smoke,
  standIn,
} from "../lib/__tests__/smokeHarness";

afterEach(closeStandIns);

describe("make smoke", () => {
  it("exits 0 and says what it asked, when every path answers", async () => {
    const app = await standIn();

    const result = await smoke(app.url);

    expect(`${result.stdout}${result.stderr}`).toContain(app.url);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("smoke=ok");
    // A run that asked nothing would also exit 0, so each path's answer is
    // named here: the note the script prints per path, and health.sh's own
    // line for the one it asked.
    for (const path of CHECKED) {
      expect(result.stdout, path).toContain(`  ${path} -> 200`);
    }
    expect(result.stdout).toContain(`health=ok url=${app.url}${HEALTH}`);
  });

  it("fails with the reason when a page answers 500", async () => {
    const app = await standIn({ [PAGE]: 500 });

    const result = await smoke(app.url);

    expect(result.status).not.toBe(0);
    expect(reasonFor(result.stdout, PAGE)).toContain("500");
    expect(result.stdout).toContain("smoke=failed");
  });

  it("refuses to run with no PROD_URL, rather than passing by checking nothing", async () => {
    const result = await smoke(null);

    expect(result.status).not.toBe(0);
    // The name the caller was handed, and the one the hourly prod check passes:
    // the target's refusal has to name the variable a run of `make smoke` is
    // given, not the script's own flag behind it.
    expect(`${result.stdout}${result.stderr}`).toContain("PROD_URL");
  });
});
