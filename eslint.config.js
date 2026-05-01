// @ts-check
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import prettierConfig from "eslint-config-prettier";

/**
 * ESLint flat config for @cosyte/dicom.
 *
 * Sibling-divergence callouts (vs `@cosyte/hl7`):
 *  - ESLint 9 flat-config (sibling uses ESLint 8). Justified by Node 18 floor + D-04.
 *  - `typescript-eslint` unified package (sibling uses split parser+plugin).
 *    Justified by ESLint 9 flat-config ergonomics.
 *  - `eslint-plugin-jsdoc@^50` (sibling pins `^48`). ESLint 9 requires jsdoc >= 50.
 *  - Two extra `files` overrides for `scripts/**/*.ts` and tests (sibling has only
 *    one). Justification: this repo has hand-written generators + smoke + phi-scan
 *    that legitimately use `console.log` to report progress to stdout. Scripts are
 *    build-time tools, not library code; CLAUDE.md "no console.*" applies to `src/`.
 */

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "vendor/**",
      "src/dictionary/generated/**",
      "*.config.js",
    ],
  },

  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ["src/**/*.ts", "scripts/**/*.ts", "test/**/*.ts", "*.config.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: { jsdoc: jsdoc },
    rules: {
      // CLAUDE.md guardrails: no any, no unjustified as
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",

      // Strictness
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",

      // CLAUDE.md: no console.* in library code
      "no-console": "error",

      // CLAUDE.md: JSDoc + @example on public exports
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
          },
          contexts: [
            "ExportNamedDeclaration > VariableDeclaration",
            "ExportNamedDeclaration > TSTypeAliasDeclaration",
            "ExportNamedDeclaration > TSInterfaceDeclaration",
            "ExportNamedDeclaration > TSEnumDeclaration",
          ],
        },
      ],
      "jsdoc/require-example": [
        "error",
        {
          contexts: [
            "ExportNamedDeclaration > VariableDeclaration",
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > ClassDeclaration",
          ],
          exemptedBy: ["internal", "private"],
        },
      ],
      "jsdoc/check-tag-names": ["error", { definedTags: ["internal", "remarks"] }],

      // General
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
    settings: { jsdoc: { mode: "typescript" } },
  },

  // Relax JSDoc + console + unsafe rules in tests (vitest tests + helpers don't
  // need @example, may use console.log in fixtures).
  {
    files: ["test/**/*.ts", "src/**/*.test.ts"],
    rules: {
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-example": "off",
      "no-console": "off",
    },
  },

  // Relax JSDoc + console requirements in scripts (build-time tools, not library
  // exports). Per CLAUDE.md "no console.* in library code" — scripts are not
  // library code.
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-example": "off",
      "no-console": "off",
    },
  },

  // eslint-config-prettier MUST be last
  prettierConfig,
];
