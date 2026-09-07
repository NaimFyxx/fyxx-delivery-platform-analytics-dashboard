# Pace tracker + range targets feature: handoff summary

Committed to `main` as `e09f940` (not pushed). All five changes are built, tested, and verified: 62 tests pass, tsc and the money-trail lint wall are clean, the build succeeds, and I confirmed at runtime that the floating gear mounts and its panel works even while data loads.

## What I built (against the mockup and spec)

1. **Base and stretch targets.** Per-platform targets are the base; a new optional **combined stretch** per month lives in `monthly_stretch_targets`. The badge reads Base reached, then Stretch reached (permanent once crossed), Target missed on a completed month under base, else in-progress pace. Percentage and pace are always **percent of base**. The badge logic is a pure `paceBadgeState` with unit tests for all five states.

2. **Three view modes + floating gear.** A slim bottom bar joins the card; the gear (bottom-right, every page) switches Card only / Both (default) / Bar only. Both live in `__root` as an additive `PaceDock`. Persistence is on `profiles.pace_view_mode` for signed-in users; guests get `both`, session-only.

3. **Monthly Average KPI card**, second in the Overview row, from the money trail (verified against your Jun/Jul/Aug vs Mar/Apr/May figures: 869 JOD, down 5.4%).

4. **URL filters**, long readable keys as you asked: `?range=this|last|ytd|all|custom&from=YYYY-MM&to=YYYY-MM&platform=All|Talabat|Careem`, persisted via `retainSearchParams`, back/forward and shareable.

5. **Explainers** shipped for every new control, and the pace/target explainers reworded where "target" now means "base."

## The `__root` resilience conditions (verified at runtime)

Loading: dock renders the gear only, no bar, page content unaffected. Error: `if (!data)` guard, no `computePace`, no root error boundary, invisible. Gear without data: mode lives in the context, so it opens and changes independent of the query. I confirmed this on the running dev server: the gear appeared and its panel opened and switched modes while the page still showed "Loading...", with no console errors.

## One thing I left off, and told you rather than reworking the card

The **stretch tick on the card's own split bar**: that bar is scaled to base and capped at 100%, so a stretch marker (beyond base) has nowhere to sit. I did the Combined base/stretch line on the card as specced and left the tick off; the **slim bar** carries the base (yellow) and stretch (muted) ticks properly. If you want it on the card, it needs rescaling that bar to 0-to-stretch, which is the redesign you said to avoid.

## Migrations, run order (you run these in Lovable)

Run **both before relying on the feature**, in either order relative to each other:

1. `supabase/migrations/20260907000000_monthly_stretch_targets.sql`
2. `supabase/migrations/20260907000100_profiles_pace_view_mode.sql`

**Does the app break if code ships before migrations?** No. Reads are defensive (supabase-js returns error tuples, not throws, and everything maps `data ?? []`), so a code-first deploy degrades gracefully: stretch shows as absent (base-only), and the view preference stays session-local. It will not crash. But the clean path is migrations first, and note that until migration 1 runs, Lori's stretch save will error, so enter the September stretch only after it is applied.

## For Lori's Asana task: what changed on the Targets screen

The Data entry, Targets tab now has **three inputs instead of two**: **Talabat base (JOD)**, **Careem base (JOD)** (both unchanged in behaviour, just relabelled from "target" to "base"), and a new **Combined stretch (optional)** field. A month with a base but no stretch behaves exactly as before. Values to enter once the migration is in: **Talabat base 590, Careem base 410, combined stretch 1,150** for September 2026.

Note: `docs/SUPABASE-REMIX-MIGRATION.md` from the earlier task is still untracked; I kept it out of this commit to stay focused. Say the word if you want it committed.

---

## Reference: files in commit e09f940

New:
- `supabase/migrations/20260907000000_monthly_stretch_targets.sql`
- `supabase/migrations/20260907000100_profiles_pace_view_mode.sql`
- `src/lib/pace.ts` (computePace + currentPaceMonth, moved here from dashboard so __root stays light)
- `src/lib/pace-badge.ts` + `src/lib/pace-badge.test.ts` (pure badge logic + tests)
- `src/lib/pace-view.tsx` (PaceViewProvider + usePaceView; profiles-backed, guest session default)
- `src/lib/filter-search.ts` (URL search schema + validator + retain middleware)
- `src/components/fyxx/pace-dock.tsx` (PaceBar + PaceGear + PaceDock)

Changed:
- `src/routes/__root.tsx` (mounts PaceViewProvider + PaceDock)
- `src/routes/dashboard.tsx` (base/stretch card badge + combined line, Monthly Average card, card gated by view mode, URL platform)
- `src/routes/insights.tsx`, `src/routes/_authenticated/financials.tsx`, `src/routes/_authenticated/items.tsx` (URL range + platform)
- `src/routes/_authenticated/entry.tsx` (stretch field on Targets form)
- `src/hooks/use-range-filter.ts` (URL-backed range + platform)
- `src/router.tsx` (unchanged final state; middleware applied per-route instead)
- `src/lib/dashboard.functions.ts` (stretchTargets read, defensive)
- `src/components/fyxx/admin-sidebar.tsx` (publishes --pace-bar-left so the bar clears the sidebar)
- `src/styles.css` (--pace-bar-left, --pace-bar-pad, body bottom padding)
- `src/lib/explainers.ts` (new explainers + target->base rewording)
- `src/test/fixture.ts` (stretchTargets: [])
- `src/routes/__tests__/pages.test.tsx` (Monthly Average assertion, PaceBar test, router mocks)

Verification run: `bun run test` -> 62 passing across 5 files; `bun run build` clean; tsc clean; lint wall 0 violations.
