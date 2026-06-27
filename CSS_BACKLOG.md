# CSS / UI Backlog

A running list of small visual/CSS fixes for the dashboard. Not urgent — batch these.

| # | Issue | Where | Suggested fix | Status |
|---|-------|-------|---------------|--------|
| 1 | Admin side nav is not sticky — on long pages the nav items scroll away with the content. | `src/components/fyxx/admin-sidebar.tsx` (the `<aside>`) and `AdminShell` | Make the sidebar stay put while only the main panel scrolls. In `AdminShell`, set the outer wrapper to `h-screen overflow-hidden`; on the `<aside>` add `sticky top-0 h-screen` (or `h-screen` since `main` already has `overflow-auto`). That pins the nav and lets the page scroll inside `<main>` only. | Open |
| 2 | Careem filter button (active state) had near-black text on its dark-green background — barely readable. | `src/routes/dashboard.tsx` — `Segmented` component (used on every page) | Active Careem text was hardcoded `#06251a`. Switched to the existing `var(--careem-foreground)` (white); Talabat likewise uses `var(--talabat-foreground)`. Fixes it everywhere the filter appears. | Done |
| 3 | Items table header looked messy — long titles + info icons crammed onto one line in a fixed-height cell. | `src/routes/_authenticated/items.tsx` — `TableHeader` | Let headers wrap cleanly: `align-bottom h-auto py-2.5 leading-tight whitespace-normal`, info icon flows inline after the label. | Done |

<!-- Add new rows above. Keep it short: Issue · Where · Fix · Status. -->
