import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Required because test files reach shared packages through their barrels,
  // which export .tsx components alongside schemas.
  plugins: [react()],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: {
    // Array form, not an object: aliases are matched in order, and the
    // subpath entries must come before their package prefix or "@moa/ui"
    // swallows "@moa/ui/motion" and resolves it to <index.ts>/motion.
    alias: [
      { find: "@moa/ui/motion", replacement: at("../../packages/ui/src/lib/motion.ts") },
      { find: "@moa/ui", replacement: at("../../packages/ui/src/ui/index.ts") },
      { find: "@moa/app-kit", replacement: at("../../packages/app-kit/src/index.ts") },
      { find: "@moa/api", replacement: at("../../packages/api/src/index.ts") },
      { find: "@", replacement: at("./src") },
    ],
  },
});
