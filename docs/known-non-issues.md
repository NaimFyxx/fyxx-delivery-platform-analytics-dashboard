# Known non-issues

Findings that looked like bugs in one or more reviews but are confirmed not to be. Recorded here so
they are not chased again. Add to this list whenever a flagged item turns out to be a measurement or
tooling artefact rather than a real defect.

## "Salt & Pepper ChickenWings" missing space in the Top 10 axis label

**Status: not a bug. Do not chase.** Flagged in three consecutive reviews (chart colour audit, mobile
review, and the 2026-09-09 verification).

The item name is correct in the data and on screen. It is stored with the space and renders with the
space. What looked like a missing space is an artefact of reading the Recharts SVG axis label out of
the DOM: a long tick label is wrapped across two `<tspan>` elements, and concatenating their text
content drops the space at the wrap point. So a DOM scrape reads "ChickenWings" while the chart shows
"Chicken Wings".

Evidence: the Top 10 chart axis and the table below it both render the same `r.item` string (no
display transform), and this read-only query returned zero rows, confirming no stored name has a
missing space:

```sql
select 'monthly_item_sales' as source, item_name as name, count(*) as rows
from monthly_item_sales
where item_name ~ '[a-z][A-Z]' or item_name ilike '%chickenwings%'
group by item_name
union all
select 'item_aliases.raw_name', raw_name, count(*)
from item_aliases
where raw_name ~ '[a-z][A-Z]' or raw_name ilike '%chickenwings%'
group by raw_name
union all
select 'item_aliases.canonical_name', canonical_name, count(*)
from item_aliases
where canonical_name ~ '[a-z][A-Z]' or canonical_name ilike '%chickenwings%'
order by 1, 2;
```

If a future audit reads run-together words out of any Recharts tick label, suspect the `<tspan>` wrap
first and check the rendered chart and the data before treating it as a defect.

## Pace card progress bar has no per-segment "%" labels

**Status: not a bug. Intended. Do not chase.** Flagged as a FAIL in the 2026-09-09 eight-item check
("both progress labels should be white") because an earlier instruction asked for the two in-bar
percentage labels (Careem %, Talabat %) to be recoloured white to match.

They were **deliberately removed, not recoloured.** The progress track is 10px tall (`h-2.5`); the
labels were 9px text inside it, which never read acceptably at any colour. The per-platform
percentages now live in the table rows directly below the bar (`Careem 178 / 410 43%`,
`Talabat 183 / 590 31%`) at a readable size, so no information is lost. The bar is now two bare
coloured segments (`--careem` / `--talabat` fills) plus a pace marker, with zero text nodes.

Confirmed the right call by the reporter. If a future check looks for coloured "%" text inside the
pace progress bar, there is intentionally none: read the table rows beneath it instead.

## The desktop sidebar footer "×" is a credit lockup, not a banner close button

**Status: not a bug of the kind reported. Do not chase as a "close button".** The 2026-09-09 eight-item
check flagged "the banner close button" as `#677773` on `#092727` at 3.35:1. There is no banner and no
close button. The measured `×` is the multiplication sign in the **"TGR × Fyxx" brand credit lockup**
at the foot of the desktop admin sidebar (`admin-sidebar.tsx`), which renders `TGR`, `×` and the Fyxx
logo. `#677773` is `text-sidebar-foreground/40` composited on the dark green sidebar.

The contrast was nonetheless low, so the lockup was lifted from `/40` to `/60` (~5.8:1). But it is a
static credit line, not an interactive control, so do not look for (or add) close-button behaviour.

## The import n/a-dash "3.98:1 on #DCDAD3" reading could not be reproduced

**Status: unconfirmed measurement; likely a background-walker artefact. Do not chase without the exact
cell.** The 2026-09-09 check reported the coverage-table n/a dashes (`CoverageCell`'s "-") as
`#5C6B6B` on `#DCDAD3` = 3.98:1. The dash is `text-muted-foreground`, and no row or cell class produces
`#DCDAD3`: the coverage rows composite to near-white (normal = card white; `hover:bg-muted/40`,
selected `bg-primary/5`, current `bg-amber-500/[0.04]` all land within a few points of white), where
muted-foreground measures 5.57:1 and passes. The same report documents two background-walker bugs it
fixed mid-run (wrong ancestor, ignored `background-image`); `#DCDAD3` appears to be a residual of that
class. If a future check re-reports it, capture the exact row/state first: on the real cells the dash
passes.
