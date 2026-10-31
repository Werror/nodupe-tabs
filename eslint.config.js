import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "dist/"] },
  js.configs.recommended,
  {
    files: ["extension/**/*.js"],
    languageOptions: { globals: { ...globals.browser, chrome: "readonly" } },
  },
  {
    files: ["test/**/*.mjs", "scripts/**/*.mjs", "*.js"],
    languageOptions: { globals: { ...globals.node, chrome: "readonly" } },
  },
];
