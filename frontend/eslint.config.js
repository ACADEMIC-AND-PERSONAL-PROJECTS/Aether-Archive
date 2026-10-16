import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { createNodeResolver, flatConfigs as importXFlatConfigs } from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Flat ESLint config (ESLint 10) for the Aether Archive frontend.
 *
 * Linting is deliberately *not* type-aware: `npm run build` runs `tsc -b` on the
 * same files, so the type checker owns type errors and ESLint stays fast.
 * `eslint-config-prettier` is last so no formatting rule fights Prettier.
 */
export default tseslint.config(
  { ignores: ["dist/", "coverage/"] },

  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.node,
    },
  },

  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strict,
      importXFlatConfigs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.browser,
    },
    settings: {
      "import-x/extensions": [".ts", ".tsx", ".js", ".jsx", ".json", ".css"],
      "import-x/external-module-folders": ["node_modules", "node_modules/@types"],
      // `import-x` ships no TypeScript resolver of its own: extensionless `.ts`/`.tsx`
      // specifiers and package `exports` maps need the TypeScript-aware one.
      "import-x/resolver-next": [createTypeScriptImportResolver(), createNodeResolver()],
    },
    rules: {
      // The bundle is served as ES modules; Vite handles asset and CSS imports.
      "import-x/no-unresolved": ["error", { ignore: ["\\.css$"] }],
      // TypeScript already proves named exports exist; this check cannot see types.
      "import-x/named": "off",
      "import-x/order": [
        "error",
        {
          groups: [
            ["builtin", "external"],
            "internal",
            ["parent", "sibling", "index"],
            "object",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": ["error", { "prefer-inline": true }],

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
    },
  },

  prettier,
);
