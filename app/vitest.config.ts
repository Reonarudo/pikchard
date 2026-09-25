import { defineConfig, mergeConfig } from "vitest/config";
// Explicit extension: Vite 8's native config loader cannot resolve it otherwise.
import { config as viteConfig } from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: "app",
      environment: "jsdom",
      // jsdom has `<dialog>` but not its modality; the shim is the environment's,
      // not the app's (see the file).
      setupFiles: ["./src/test-setup.ts"],
      include: ["src/**/*.test.ts", "src/**/*.test.tsx", "vite/**/*.test.ts"],
    },
  }),
);
