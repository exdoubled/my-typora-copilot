import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@modules": path.resolve(import.meta.dirname, "src/modules"),
      "@": path.resolve(import.meta.dirname, "src"),
      "@test": path.resolve(import.meta.dirname, "test"),
    },
  },
  test: {
    setupFiles: ["./test/setup.ts"],
    environment: "jsdom",
  },
});
