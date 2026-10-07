import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // The suite covers pure math and the health route, so Node is enough:
    // no browser, no canvas package, no network.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
