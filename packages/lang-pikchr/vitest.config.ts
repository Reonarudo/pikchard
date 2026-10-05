import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "lang-pikchr",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
