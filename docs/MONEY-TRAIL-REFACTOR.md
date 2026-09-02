# Money-trail refactor: handoff summary

Committed to `main` as `eb3c498` (not pushed).

## What shipped

**One function, every surface renders it.** `src/lib/money-trail.ts` computes the full trail for a month or a range (same call): gross, discounts, net sales (+ ex-VAT), commissions and fees, payout, VAT, payout ex-VAT, gross ex-VAT, COGS, net profit, net/product/commission margin, orders, AOV. The report's `periodTotals` is now a thin wrapper over it; Dashboard dropped `monthAggs`/`sum`/`computeKpis` and all its `exVat` math; Insights' `buildPromoSpend` reads the trail and keeps only marketing-spend categories; the sales-trend chart reuses the trail too.

**The lint wall.** Routes and components no longer import `cogsFor`/`costAsOf`/`exVat`/`vatOf` (the dashboard re-exports are gone), and an ESLint `no-restricted-imports` rule forbids them across `src/routes/**` **and** `src/components/**`, with a narrow `costAsOf` exception for `items.tsx`'s per-item detail. `dbAliases` stays required. A new surface that tries to recompute now fails `bun run lint`.

## The three additions

1. **Financials migrated** to the shared `["dashboard"]` query. Its separate `["financials_page"]` query is gone, so it now shares one source *and* one computation. No reason it couldn't be done.

2. **Reconciliation shipped as check 9**, not later: per month, the sum of the per-item COGS `aggregateItems` produces must equal `trail.cogs`. It's in `data-health.ts` and guarded by a unit test.

3. **Lint wall extended to components.** Done as above.

## The daily-fallback proof (addition 2)

I cannot run the Oct-2025-to-Aug-2026 comparison from the build environment, because it has no live DB. Instead there is a structural proof plus a live check:

- **Structural:** `moneyTrail` uses `monthly_financials` gross whenever `finGross > 0`, and only falls back to summed daily otherwise. Every completed month has financials rows (that is *why* the figures are what they are), so for every complete month the trail uses the financials figure and **never consults daily**. The fallback therefore cannot change a completed-month number, whatever the data says. Both the Overview and the report already used exactly this precedence, so they never disagreed on gross either.
- **Live:** added **check 8, "gross source agreement"**: for each complete platform-month it compares financials gross against summed daily gross and warns (naming both figures) if they differ by more than 1%. That is the Oct-to-Aug comparison, produced continuously on the deployed panel. Any month where they diverge will show amber with both numbers.

## Verification and the test command

This is a Bun project. Install and run with Bun, not npm.

```bash
bun install
bun run test
```

`bun run test` runs `vitest run` (the `test` script). Do not use `bun test`: that is
Bun's own built-in runner, which would ignore the Vitest config and not produce this
result. All pass (53 tests):

- **Golden-dataset tests** asserting every figure in the spec: the Jan-Aug range (gross 7,415.86, discounts 1,436.33, NSV 5,979.53, commissions 1,681.33, payout 4,298.20, COGS 2,030.95, net profit 1,674.39, 45.2%, 68.2%, 277 orders), each month's COGS (Jan 330.67 … Aug 279.40), August (1,011.28 / 279.40 / 317.51 / 53.2% / 68.0%), and platform YTD (Talabat 4,243.45 / net profit / 43.6%, Careem 3,172.41 / net profit / 47.1%).
- **Route-mount tests** that render Dashboard, Insights and Financials with the fixture and assert the rendered DOM (e.g. Financials shows "JOD 1,011.28" and "JOD 317.51"; Dashboard shows 53.2 / 318 / 68.0). This is the direct answer to a route throwing at runtime while tsc/build passed.
- **Cross-surface equality** against the report model, and the **COGS reconciliation** and **checks 8/9** guards.

`tsc`, the lint wall, and the production build are all clean.

**One honest caveat on the platform figures.** Talabat net profit 893.34 and Careem 781.06 sum to 1,674.40, but the range net profit is 1,674.39. The two cannot both be exact to the cent at once (a rounding artefact in the source figures, not the refactor). The tests assert the range, per-month and August figures exact to 0.01, and the platform net profits to the whole JOD (893 / 781) plus the 0.1% margins. Everything else is exact.

Then the deployed smoke pass is yours to run.

## Notes for whoever manages deps

`vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/dom` + `jsdom` were added as dev dependencies in `package.json`, plus `test` / `test:watch` scripts. `bun install` was run so `bun.lock` (the project's one authoritative lockfile) pins them. Install with `bun install`, not `npm install`.

## Files

- New: `src/lib/money-trail.ts`, `src/lib/money-trail.test.ts`, `src/lib/reconciliation.test.ts`, `src/routes/__tests__/pages.test.tsx`, `src/test/{fixture,setup,asset-stub}.ts`, `vitest.config.ts`
- Changed: `src/lib/report.ts`, `src/lib/data-health.ts`, `src/routes/dashboard.tsx`, `src/routes/insights.tsx`, `src/routes/_authenticated/financials.tsx`, `eslint.config.js`, `package.json`

Unchanged by design: the importer, targets, Lori's upload flow, the versioned cost system, and every VAT / margin / COGS formula.

## Known conditions (do not rediscover these as mysteries)

- **This is a Bun project; `bun.lock` is the lockfile.** Lovable builds with Bun. `bun.lock` has been tracked since the first commit. Install and run with Bun (`bun install`, `bun run test`, `bun run build`), never npm. An earlier commit (`21961fb`) mistakenly committed an npm `package-lock.json`; `npm install` does not update `bun.lock`, so it pinned nothing for the actual pipeline and left `bun.lock` stale (missing the test dev-deps). That was corrected: `bun install` updated `bun.lock` with vitest and testing-library, `package-lock.json` was removed from tracking and added to `.gitignore`, and the change was verified with `bun run test` (53 passing) and `bun run build` (clean).
- **Node engine warnings on install are expected.** TanStack Start packages (via `@lovable.dev/vite-tanstack-config` to `@tanstack/react-start`) declare Node 22.12 or higher; the working machine runs Node 20.20.2. Install prints engine warnings and everything works today (build, tests, dev). There is no `engines` field, so these are advisory only and do not fail the install. Do not upgrade Node to chase them.
- **Supply-chain guard.** `bunfig.toml` sets `minimumReleaseAge = 86400`, so `bun install` skips package versions published in the last 24 hours. Do not run `npm audit fix` (npm should not be used here anyway); the reported advisories are mostly dev-dependency and a forced fix is breaking.
- **Observed behaviour worth watching: a tool silently edited `.gitignore`.** During the lockfile work, a line ignoring the handoff doc's basename appeared in `.gitignore` that no human wrote. There is no Claude Code hook configured (no `.claude/settings.json`, no `hooks` key, no non-sample git hooks) and nothing in `.claude`/`.lovable`/`bunfig.toml` references `.gitignore`, so it was not a Claude hook. The strong circumstantial pointer is Lovable's own working-tree sync (this is a Lovable-managed project). It could not be proven read-only. The line was never committed and was removed; `.gitignore` matches its committed state. Worth watching in case the same mechanism ignores something that matters later.
