import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // The money-trail wall: pages and components render moneyTrail's output. They must not reach for
  // the low-level primitives and recompute a money figure themselves (the class of bug 9e01335 was).
  // Allowed only inside src/lib (money-trail.ts, items.ts, data-health.ts).
  {
    files: ["src/routes/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "server-only", message: "Use `*.server.ts` or `@tanstack/react-start/server-only`." },
            {
              name: "@/lib/costs",
              importNames: ["cogsFor", "costAsOf"],
              message: "Render moneyTrail's output; do not recompute money figures. See @/lib/money-trail.",
            },
            {
              name: "@/lib/fyxx",
              importNames: ["exVat", "vatOf"],
              message: "Ex-VAT figures come from the money trail (grossExVat, payoutExVat, vat). See @/lib/money-trail.",
            },
          ],
        },
      ],
    },
  },
  // Items is the one page that legitimately needs costAsOf for its per-item detail panel (per-item,
  // not the aggregate trail). cogsFor / exVat / vatOf stay forbidden there too.
  {
    files: ["src/routes/_authenticated/items.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "server-only", message: "Use `*.server.ts` or `@tanstack/react-start/server-only`." },
            { name: "@/lib/costs", importNames: ["cogsFor"], message: "Render moneyTrail's output; do not recompute the aggregate money trail." },
            { name: "@/lib/fyxx", importNames: ["exVat", "vatOf"], message: "Ex-VAT figures come from the money trail. See @/lib/money-trail." },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
