import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["**/*.tsx"], plugins: { "react-hooks": reactHooks }, rules: reactHooks.configs.recommended.rules },
  globalIgnores([".next/**", ".open-next/**", "**/.wrangler/**", "cloudflare-env.d.ts", "next-env.d.ts", "coverage/**"]),
]);
