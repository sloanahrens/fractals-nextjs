/**
 * The stand-in `make smoke` is pointed at, and the run itself
 *
 * The smoke target is the one check that runs against a service rather than
 * against this checkout, so the way it fails is the whole of it: a service that
 * answers a 500, and a URL that nothing is listening on, both have to come back
 * as a non-zero exit with the reason printed. The stand-in here is a real
 * server on 127.0.0.1 rather than a fake tool, because what is under test is
 * the target's own pass over HTTP; the gate has no network to a cloud and needs
 * none for this.
 *
 * The checks are split by what they wait for. The three that answer at once are
 * a unit test's (src/__tests__/smoke-target.test.ts); the two that watch a
 * failing service are the integration tier's
 * (tests/integration/smoke-target.test.ts), because health.sh polls until its
 * timeout has elapsed -- a real second it refuses to cut short -- and the unit
 * run is held to less.
 */
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";

// `import.meta.url` is this file: src/lib/__tests__/, so ".." thrice is the root.
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The paths the smoke target asks about, and the status the stand-in gives. */
export const HEALTH = "/api/health";
export const PAGE = "/";
/** The three the script asks itself; the health path is health.sh's to ask. */
export const CHECKED = [PAGE, "/api/version", "/og-card-2.png"];

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
export function reasonFor(stdout: string, path: string): string | null {
  const prefix = failed(path);
  const line = stdout.split("\n").find((each) => each.startsWith(prefix));
  return line?.slice(prefix.length) ?? null;
}

// Every stand-in this file starts, so a test that fails still leaves none
// listening for the next one.
const running: Server[] = [];

/** Close a stand-in, and forget it, whether or not it is still listening. */
export async function closeStandIn(server: Server) {
  const at = running.indexOf(server);
  if (at !== -1) running.splice(at, 1);
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

/** Close every stand-in a test left listening. For a file's `afterEach`. */
export async function closeStandIns() {
  while (running.length > 0) await closeStandIn(running[0]);
}

/**
 * A stand-in for the deployed app on an ephemeral port.
 *
 * @param statuses - The status to answer each path with; anything not named
 *   answers 200, so a test only states the path it is about
 * @returns The URL to point `make smoke` at, and the server behind it
 */
export async function standIn(statuses: Record<string, number> = {}) {
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
export interface Run {
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
 * as well: this suite hands its URL to the target as PROD_URL, and a machine
 * with the script's own variable exported should not be able to stand in for
 * it. PROD_URL is cleared for the same reason in the other direction, so the
 * test that refuses a run with none cannot be handed one by the host.
 */
export function smoke(url: string | null, env: Record<string, string> = {}) {
  const args = url === null ? ["smoke"] : ["smoke", `PROD_URL=${url}`];

  return new Promise<Run>((resolve, reject) => {
    const child = spawn("make", args, {
      cwd: ROOT,
      env: {
        ...process.env,
        GT_SERVICE_URL: "",
        PROD_URL: "",
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
