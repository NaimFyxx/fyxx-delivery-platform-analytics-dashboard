# Supabase remix migration plan

Here is the plan. Read-only, nothing changed. First, the facts I confirmed from the repo, since they drive everything:

- **14 tables**, all in `supabase/migrations/` (35 files): `daily_sales`, `monthly_financials`, `monthly_item_sales`, `item_costs`, `item_prices`, `targets`, `monthly_customers`, `monthly_adjustments`, `item_categories`, `item_aliases`, `platform_orders`, `import_log`, `pace_daily`, `profiles`.
- **RLS is in the migrations** ("auth all <table>" policies on every table, plus profiles policies).
- **No edge functions** (no `supabase/functions/`), **no storage buckets** used.
- **All PKs are UUID `gen_random_uuid()`** so there are no sequences to reset.
- **`item_costs.effective_from` is a `DATE`** (seeds use `DATE '2025-01-01'`), not a timestamp, so there is no timezone-shift risk. That is good news for your COGS concern, with one caveat below.
- **Auth linkage:** `profiles.id` references `auth.users(id)`, and `import_log.imported_by` references `auth.users(id)`. Those are the only FKs to auth.
- **Env vars actually used:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`, and `SUPABASE_SERVICE_ROLE_KEY` (server secret, critical). The `STRIPE_SECRET_KEY` / `DATABASE_URL` you may see are only commented examples in `config.server.ts`, not used.
- Old Supabase project id: `ejdewtykmczeuujiuzts`.

## 1. GitHub, the thing you actually care about

Your history does not live in Lovable. It lives in the GitHub repo `NaimFyxx/fyxx-delivery-platform-analytics-dashboard` and in your local clone. **A Lovable remix cannot delete or alter that repo.** So today's work (money-trail refactor, 53 tests, health panel, alias fix, docs) is safe as long as that repo exists and has your latest commit.

- **Do this first, it is the single most important step:** confirm on github.com that the latest commit on `main` is `0ae23e9`. Your local `git status` shows `main` even with `origin/main` at `0ae23e9`, which suggests everything is pushed, but the local remote-tracking pointer can be stale, so verify it in the browser. If `0ae23e9` is on GitHub, your history is durable regardless of what the remix does.
- **What a remix does to GitHub:** it creates a separate new Lovable project. Lovable syncs one project to one repo, and a remixed project does not inherit the original repo connection. When you connect the new project to GitHub it will make a **new** repo, and it generally pushes its current state as a fresh history rather than replaying all of today's commits. So do not rely on the remix itself to carry your history.
- **How to carry the history into the new project's repo:** after the remix creates its new repo, push your existing local history into it. Roughly: `git remote add newrepo <new-repo-url>` then `git push newrepo main`. That puts every commit from today into the new repo. Keep the old repo too.
- **Do not delete the old repo.** It is your rollback for the code.

Net: the code history is the low-risk part. Push, verify on GitHub, keep the old repo, and after remix push your full history into whatever repo the new project uses.

## 2. What moves and what does not (assume the remix gives a fresh, empty database)

Comes across with the code (in git): the app, the `supabase/migrations/` (schema, RLS, DB functions and triggers), the tests, the docs.

Does **not** come automatically and must be recreated on the new Supabase:

- **Schema, RLS, DB functions/triggers.** You have them in the 35 migrations. Running the migrations rebuilds tables, constraints, indexes, the RLS policies, and the derivation/auto-fill logic (for example `monthly_financials` discount columns, `pace_daily` auto-fill).
- **All data, Oct 2025 through Aug 2026.** Not in migrations (except seeds). This is the manual export/import in section 3. Tables with data: all 14.
- **Auth users** (the admin login for Naím and Lori). Not in migrations, not in a public-schema dump. Recreate them on the new project.
- **`profiles` rows and `import_log.imported_by`**, which reference `auth.users`. When you recreate the admin users their UUIDs change, so these must be re-linked or recreated against the new UUIDs.
- **Environment variables / secrets (names only, never values):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`, and the critical server secret `SUPABASE_SERVICE_ROLE_KEY`. Every one must point at the new project. If `SUPABASE_SERVICE_ROLE_KEY` is missing or wrong, `getDashboardData` returns nothing and the whole dashboard is blank with no error.
- **Nothing else:** no edge functions, no storage buckets, no cron. Confirmed absent.

## 3. The data move

Prerequisites: database access to both projects (open the old project `ejdewtykmczeuujiuzts` in the Supabase dashboard for a connection string or the SQL/Table editor, and your new project the same way).

Procedure:

1. **Build the schema on the new project** by applying the migrations in order (`supabase db push` after `supabase link`, or paste the migration SQL into the new project's SQL editor). This creates tables, RLS, functions.
2. **Truncate the seeded tables before loading live data.** The seed migrations insert into `item_costs`, `item_categories`, `item_prices`, and `profiles`. If you then import the live dumps on top, you double those rows. So after migrating, `TRUNCATE` those four tables (or apply schema without the seed-only migrations), so the live data is the single source. This is the most common way this kind of move goes wrong silently.
3. **Recreate the admin user(s)** on the new project (Auth, add user, or sign up through the app). Record their new UUIDs.
4. **Export the data from the old project**, per table, preserving exact values. Prefer `pg_dump --data-only --schema=public` (a single file, exact fidelity) over CSV. If you use CSV, make sure the importer does not reinterpret dates or truncate numeric precision.
5. **Import into the new project in FK-safe order:** auth users first (step 3), then `profiles` re-linked to the new UUIDs, then all the analytics tables (order among them does not matter, they have no cross-table FKs), then `import_log` (set `imported_by` to null or map it, since its old UUIDs will not exist).
6. No sequence resets needed (UUID PKs).
7. Run the acceptance test in section 4.

Fragile and order-dependent, flagged:

- **The seed-versus-live duplication** on `item_costs`, `item_categories`, `item_prices`, `profiles` (step 2). This is the biggest trap.
- **`item_costs.effective_from` versioning, your specific worry.** Because it is a `DATE`, there is no timezone shift, which removes the scariest failure mode. What remains:
  - Every row must move, with its exact date. The seeds all use `2025-01-01`; any cost changes you made in the app added rows with later `effective_from`. If a live row is dropped or a date is reinterpreted, historical COGS shifts with no error.
  - **Deterministic check:** run `SELECT item_name, effective_from, cost_exvat FROM item_costs ORDER BY item_name, effective_from;` on both databases and diff. Row count and the ordered list must be identical.
  - Then the COGS numbers in section 4 confirm it end to end. If `item_costs` moved wrong, August COGS will not be 279.40 and health check 2 (COGS band) will warn.
- **Numeric precision** on `cost_exvat`, `gross_sales`, `actual_payout`. `pg_dump` preserves it; verify a CSV path does not round.

I cannot pre-verify your live figures from here (no database access in this environment), so the numbers below are your known-good targets from the current project, used as the gate.

## 4. Acceptance test (go / no-go before you switch anything over)

1. `bun run test` gives **53 passes**. Note: the tests use a fixture, not the live database, so this only proves the remixed code built correctly. It is not a data-move check. Run it, but do not read a green suite as a successful migration.
2. **Health panel green for every month, Oct 2025 through Aug 2026.** This is the live-data integrity gate: revenue reconcile, COGS band, gross-source agreement (check 8), COGS reconciliation (check 9), items costed, and category coverage all pass. Any data-move error shows up here.
3. **Overview, custom range Jan to Aug, All platforms:** net profit 1,674, net margin 45.2%.
4. **Financials, All-Time:** Talabat 5,836.20, Careem 4,339.61.
5. **August report:** gross 1,011.28, COGS 279.40, net profit 317.51, net margin 53.2%.

Items 3, 4 and 5 all depend on COGS, so they are the direct proof that `item_costs` and its `effective_from` moved correctly. Do not point a domain at the new project, share its URL, or decommission the old one until all five pass.

## 5. Rollback

Keep everything on the old side untouched until the new project passes acceptance:

- **The old Lovable project and its Supabase (`ejdewtykmczeuujiuzts`) stay running and unchanged.** The remix creates a separate project, so the old one keeps working on its own. Do not change its connection (Lovable will not let you anyway), do not delete it, do not touch its data.
- **Keep the old deployed URL live** and unshared, exactly as now.
- **Keep the old GitHub repo untouched.** If you push history into a new repo, do not force-push over the old.
- **Save your data export files.** They are both your import source and your ability to re-diff if a number looks off.
- **Do not repoint any custom domain** to the new project until acceptance passes.

Because nothing on the old side is modified, rollback is simply "keep using the old project and URL." You only switch over after the new one is green on all five checks.

Two honest limits: the exact Lovable remix-to-GitHub and remix-to-database behavior is Lovable product behavior I would confirm in their UI or docs before you rely on it, and I could not validate your live figures from here. Everything about the schema, migrations, RLS, functions, storage, env vars, and the COGS-versioning risk above is read straight from this repo.
