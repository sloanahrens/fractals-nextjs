import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [".next/**", "out/**", "build/**", "node_modules/**"],
  },
  {
    name: "next-fractals/base",
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooksPlugin.configs.recommended.rules,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  ...tseslint.configs.recommended,
  {
    name: "next-fractals/commonjs",
    // These two run before the build, as CommonJS: `next.config.js` is loaded
    // by Node itself, and `deploymentParamsFile.js` is what it requires, so
    // `require()` is the only import form either can have.
    files: ["next.config.js", "src/lib/deploymentParamsFile.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
