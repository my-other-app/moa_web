import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Required because test files reach shared packages through their barrels,
  // which export .tsx components alongside schemas.
  plugins: [react()],
  test: {
    // jsdom so components can actually be rendered: the crashes these guard
    // against (field-bound Form primitives used outside a FormField) are
    // invisible to tsc and only appear at render time.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Generous for the same reason as asyncUtilTimeout in setup.ts.
    testTimeout: 15_000,
    /*
     * Test files run one at a time. Turbo already runs lint, typecheck, test
     * and build for four packages concurrently, and stacking a worker per
     * test file on top of that starved them: under a full-gate run a random
     * handful timed out and, once, a whole file failed to collect. There are
     * fewer than a dozen files here, so the wall-clock cost is small and the
     * suite becomes trustworthy, which is the point of having it.
     */
    fileParallelism: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    // Array form, not an object: aliases are matched in order, and the
    // subpath entries must come before their package prefix or "@moa/ui"
    // swallows "@moa/ui/motion" and resolves it to <index.ts>/motion.
    alias: [
      { find: "@moa/ui/motion", replacement: at("../../packages/ui/src/lib/motion.ts") },
      { find: "@moa/ui/hooks", replacement: at("../../packages/ui/src/hooks/index.ts") },
      { find: "@moa/ui/images", replacement: at("../../packages/ui/src/lib/images.ts") },
      { find: "@moa/ui", replacement: at("../../packages/ui/src/ui/index.ts") },
      { find: "@moa/app-kit", replacement: at("../../packages/app-kit/src/index.ts") },
      { find: "@moa/api", replacement: at("../../packages/api/src/index.ts") },
      { find: "@", replacement: at("./src") },
    ],
  },
});
