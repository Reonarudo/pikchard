import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "pikchr-corpus",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
