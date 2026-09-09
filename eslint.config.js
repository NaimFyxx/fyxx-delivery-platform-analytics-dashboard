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
  // The chart-colour wall: series colours must be a --series-* (or platform / status / accent) token,
  // never a raw hex and never --primary / --foreground. This is the class of bug the 2026-09-09 audit
  // found twice: --series-1 shares the brand ink value with --primary and --foreground, so using any of
  // those aliases as a chart colour draws two "different" series identically. --series-1 is the one
  // legitimate name for that ink in a chart; forbidding --primary/--foreground here makes the alias
  // impossible to use as a second series by construction. Recharts marks use `fill`/`stroke`, as JSX
  // attributes or inside dot={{...}} objects. barColor/gradient string props are not caught (the
  // Careem+/Talabat Pro panels paint light tints on dark cards on purpose). See docs/chart-colour-audit.
  {
    files: ["src/routes/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name=/^(fill|stroke)$/] > Literal[value=/^#/]",
          message: "Chart series colour must be a design token, e.g. stroke=\"var(--series-1)\", not a raw hex. See --series-* in styles.css.",
        },
        {
          selector: "Property[key.name=/^(fill|stroke)$/] > Literal[value=/^#/]",
          message: "Chart series colour must be a design token, e.g. fill: \"var(--series-1)\", not a raw hex. See --series-* in styles.css.",
        },
        {
          selector: "JSXAttribute[name.name=/^(fill|stroke)$/] > Literal[value=/var\\(\\s*--(primary|foreground)\\b/]",
          message: "Do not use var(--primary)/var(--foreground) as a chart colour: they alias --series-1 (same ink), so two series render identically. Use var(--series-1). See docs/chart-colour-audit.",
        },
        {
          selector: "Property[key.name=/^(fill|stroke)$/] > Literal[value=/var\\(\\s*--(primary|foreground)\\b/]",
          message: "Do not use var(--primary)/var(--foreground) as a chart colour: they alias --series-1 (same ink), so two series render identically. Use var(--series-1). See docs/chart-colour-audit.",
        },
      ],
    },
  },
  eslintPluginPrettier,
);
