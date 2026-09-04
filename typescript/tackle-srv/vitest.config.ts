import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Source tests only — the compiled dist/ tree must never be collected
    // (its CJS output crashes vitest's ESM import; found by CI).
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
  },
});
