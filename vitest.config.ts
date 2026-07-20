import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The `server-only` guard throws unconditionally when resolved via its
      // default export, since Vite doesn't apply Next.js's `react-server`
      // bundler condition. Tests intentionally run "server" code directly in
      // Node, so alias it to the package's own no-op `react-server` build.
      "server-only": path.resolve(
        __dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
