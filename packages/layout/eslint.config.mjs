import js from "@eslint/js";
import tseslint from "typescript-eslint";

// The library equivalent of the apps' config, as in packages/ui: no Next
// rules and no hooks plugin, since nothing here renders -- it is the
// layout contract shared by the editor and the renderer.
export default tseslint.config(
  { ignores: ["dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
