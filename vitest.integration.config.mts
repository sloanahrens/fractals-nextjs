import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The integration tier: the checks that call a deployed app, and the only suite
 * here that needs the network.
 *
 * It is a config of its own rather than a directory inside `vitest.config.mts`,
 * because `make gate` runs that one and the gate has no network and no
 * deployment to call. `include` names `tests/integration/**` and nothing else,
 * so `npm test` cannot pick these checks up and this config cannot pick up a
 * unit test. `make integration` and `npm run test:integration` run it, and both
 * need INTEGRATION_URL (or its alias STAGING_URL) in the environment (src/lib/integrationTarget.ts).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // A check is allowed 15 s for a request (REQUEST_TIMEOUT_MS) and one retry,
    // so vitest's 5 s default would report a slow deployment as a hung test.
    testTimeout: 45_000,
    hookTimeout: 45_000,
  },
});
