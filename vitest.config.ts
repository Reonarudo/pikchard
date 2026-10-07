import { defineConfig } from "vitest/config";

// One Vitest run for the whole monorepo; each workspace owns its own config.
export default defineConfig({
  test: {
    projects: [
      "packages/pikchr-corpus/vitest.config.ts",
      "packages/pikchr-wasm/vitest.config.ts",
      "packages/lang-pikchr/vitest.config.ts",
      "app/vitest.config.ts",
    ],
  },
});
