import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Test-only config (separate from the Lovable build preset in vite.config.ts). jsdom so route
// components mount; asset imports (svg, css?url) are stubbed so a page under test does not drag in
// the whole Vite asset pipeline.
export default defineConfig({
  resolve: {
    alias: [
      // Whole-path match so the import resolves entirely to the stub (a regex that matched only the
      // extension would replace just ".svg"). png.asset.json is a real JSON import and is left alone.
      { find: /^.+\.(svg|css)(\?url)?$/, replacement: resolve(__dirname, "src/test/asset-stub.ts") },
      { find: "@", replacement: resolve(__dirname, "src") },
    ],
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
