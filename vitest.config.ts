import path from "node:path"

import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // Server modules guard themselves with `import "server-only"`, which
      // throws outside a React Server Components bundle. Tests run in plain
      // node, so alias it to an empty stub — the guard still protects the
      // real app builds.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // The template-rendering sample script (scripts/render-sample-templates.test.ts)
    // loads Satori/resvg/sharp + vendored TTFs and rasterizes real PNGs —
    // slower than the rest of the (pure-function) suite, so it gets a longer
    // per-test timeout rather than inflating the global default.
    testTimeout: 20_000,
  },
})
