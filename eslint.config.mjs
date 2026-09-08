import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    files: ["src/**/*.cjs"],
    ...js.configs.recommended,
    languageOptions: { sourceType: "commonjs", globals: globals.node },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
  {
    files: ["src/renderer/**/*.{js,jsx}"],
    ...js.configs.recommended,
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    languageOptions: {
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      "no-unused-vars": [
        "error",
        { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" },
      ],
    },
  },
];
