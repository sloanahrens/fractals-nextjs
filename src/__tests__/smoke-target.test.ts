/**
 * `make smoke` fails, and says why, when a deployed app is not answering
 *
 * The smoke target is the one check that runs against a service rather than
 * against this checkout, so the way it fails is the whole of it: a service that
 * answers a 500, and a URL that nothing is listening on, both have to come back
 * as a non-zero exit with the reason printed. The stand-in here is a real
 * server on 127.0.0.1 rather than a fake tool, because what is under test is
 * the target's own pass over HTTP; the gate has no network to a cloud and needs
 * none for this.
 */
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// `import.meta.url` is this file: src/__tests__/, so ".." twice is the root.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The paths the smoke target asks about, and the status the stand-in gives. */
const HEALTH = "/api/health";
const PAGE = "/";
/** The three the script asks itself; the health path is health.sh's to ask. */
const CHECKED = [PAGE, "/api/version", "/og-card-2.png"];

/** The prefix a failing run prints for one path, with the reason after it. */
const failed = (path: string) => `smoke.sh: FAIL ${path}: `;

/**
 * The reason a run printed for one path, or null when it printed none.
 *
 * The reason is what the bead asks for by name -- a non-zero exit with the
 * reason printed -- so it is read back out of stdout rather than inferred from
 * the failure: a run that said "FAIL /" and nothing else has not explained
 * itself.
 */
function reasonFor(stdout: string, path: string): string | null {
  const prefix = failed(path);
  const line = stdout.split("\n").find((each) => each.startsWith(prefix));
  return line?.slice(prefix.length) ?? null;
}

// Every stand-in this file starts, so a test that fails still leaves none
// listening for the next one.
const running: Server[] = [];

/** Close a stand-in, and forget it, whether or not it is still listening. */
async function closeStandIn(server: Server) {
  const at = running.indexOf(server);
  if (at !== -1) running.splice(at, 1);
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

afterEach(async () => {
  while (running.length > 0) await closeStandIn(running[0]);
});

/**
 * A stand-in for the deployed app on an ephemeral port.
 *
 * @param statuses - The status to answer each path with; anything not named
 *   answers 200, so a test only states the path it is about
 * @returns The URL to point `make smoke` at, and the server behind it
 */
async function standIn(statuses: Record<string, number> = {}) {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://stand-in").pathname;
    response.writeHead(statuses[path] ?? 200, { "content-type": "text/plain" });
    response.end("stand-in");
  });
  running.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error(`the stand-in did not bind a port: ${String(address)}`);
  }

  return { url: `http://127.0.0.1:${address.port}`, server };
}

/** What a run of the target left behind: its exit code, and both its streams. */
interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * `make smoke`, as the gate machine would run it.
 *
 * The run is spawned asynchronously, which is not a detail: the stand-in is a
 * server in this very process, and a synchronous spawn would block the event
 * loop that has to answer it, so every check would time out against a server
 * that is in fact listening.
 *
 * The waits are cut to their floor: what is under test is what a non-2xx does,
 * not how long the check is willing to wait for one. GT_SERVICE_URL is cleared
 * so a run without a URL cannot be rescued by the environment of the machine
 * running the suite.
 */
function smoke(url: string | null, env: Record<string, string> = {}) {
  const args = url === null ? ["smoke"] : ["smoke", `URL=${url}`];

  return new Promise<Run>((resolve, reject) => {
    const child = spawn("make", args, {
      cwd: ROOT,
      env: {
        ...process.env,
        GT_SERVICE_URL: "",
        GT_HEALTH_TIMEOUT: "1",
        GT_HEALTH_INTERVAL: "1",
        GT_ATTEMPT_TIMEOUT: "3",
        ...env,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

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

  it("refuses to run with no URL, rather than passing by checking nothing", async () => {
    const result = await smoke(null);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("GT_SERVICE_URL");
  });
});
