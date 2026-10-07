import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "pikchr-wasm",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
