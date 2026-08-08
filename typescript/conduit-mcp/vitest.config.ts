import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/schema-test-setup.ts"],
    testTimeout: 30000,
    // Never pick up stale compiled artifacts from dist/ — only source tests.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-*/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
});
