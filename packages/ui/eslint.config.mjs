import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/*
 * packages/ui declared a `lint` script but shipped no config, so
 * `turbo run lint` failed here and never reached anything after it -- the
 * repo-wide lint gate has been dead. This is the library equivalent of the
 * apps' config: no Next rules (nothing here imports next/*), but the same
 * TypeScript and hooks checks, which are what actually catch bugs in
 * components.
 */
export default tseslint.config(
  { ignores: ["dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
