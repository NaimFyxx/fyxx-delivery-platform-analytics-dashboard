# Fyxx / TGR Delivery Dashboard: change verification

**Site:** https://fyxx-dash-magic.lovable.app
**Date:** 9 September 2026
**Session:** signed in as admin
**Widths tested:** 1440 x 900 (desktop) and 390 x 844 (iPhone, with mobile device emulation confirmed active: Android UA, 5 touch points)

## Method and scope

All measurements were read from the DOM: `getBoundingClientRect`, computed styles, and WCAG 2.1 relative-luminance contrast calculated against the effective composited background. Tap-target hit areas were measured by scanning `elementFromPoint` on a grid, not by reading the glyph box.

Nothing was changed. No credentials entered, no imports run, no saves, no deletes, no publishes. Range filters and the pace expand/collapse were toggled (view state only) and everything was returned to This Month with the pace tracker collapsed.

**Summary: 19 clean passes, 6 partial, 3 fails, plus 6 other findings.**

---

# FAILs

## D1. Header chrome is 175px, not ~75px. FAIL

Measured at 390, top of page to the top of the first filter control:

| Block | y range | Height |
|---|---|---|
| Dark bar (TGR logo 39x28 + logout icon) | 0 to 57 | 57px |
| Nav strip (`overflow-x-auto`) | 57 to 102 | 45px |
| Sub-header ("2 months to review", stale badge) | 102 to 150 | 48px |
| Gap | 150 to 175 | 25px |
| **First filter control ("This Month") at y=175** | | |

The sub-header did shrink from 87px to 48px and the second logo is gone. But the 57px dark bar and the 45px nav strip are untouched, so the total went from 189px to 175px. That is 14px saved against a target of 114px.

## D10. "Data entry" is still off the right edge. FAIL, unchanged

Nav `clientWidth` 390, `scrollWidth` 506.

| Link | x |
|---|---|
| Overview | 8 |
| Insights | 109 |
| Financials | 199 |
| Items | 302 |
| **Data entry** | **394** |

Identical to the previous audit. Still no fade, arrow or partial-item peek to signal the strip scrolls.

## D9. The gear still overlaps the bar. FAIL on overlap, PASS on jump

Gear at x=331, y=778 to 822. Collapsed bar top at y=803. **19px overlap.**

The jump is fixed: the gear sits at y=778 on both Overview and Insights, a **0px jump**, down from 106px. When the bar is expanded to 139px the gear sits entirely inside it.

## New regression: "18%" on the Careem progress segment. FAIL

Foreground `rgb(0,22,19)` on `rgb(0,73,62)`, **1.80:1**, at 11px bold.

Before the palette change the green segment was `#1BD15D` and this label measured 5.94:1. Darkening Careem's green to the `--careem` token without changing the label colour broke it. The Talabat half is fine: `rgb(52,18,0)` on `rgb(255,90,0)` = 5.45:1.

## New: the info icon inside the expanded pace bar. FAIL

`rgb(5,19,19)` on `rgb(9,39,39)` = **1.20:1**.

Same class of bug as the old invisible Talabat/Careem text, relocated to the ⓘ.

---

# PARTIALs

## A2. Pace percentage: passes at the headline, fails at 11px

All instances are now `rgb(184,134,42)` (`--warning` `#B8862A`) on white = **3.24:1**, up from 1.84:1.

| Element | Size | Weight | Requirement | Result |
|---|---|---|---|---|
| "36%" | 26px | 700 | 3:1 (large text) | **PASS** at 3.24 |
| "43%" | 11px | 600 | 4.5:1 | **FAIL** at 3.24 |
| "31%" | 11px | 600 | 4.5:1 | **FAIL** at 3.24 |

## D4. The pace card collapses, but expanding duplicates it

Collapsed it is **41px**, reading "September 2026 / 36% / 120% of pace", with an "Expand pace details" button (`aria-expanded="false"`). Correct, and it matches the collapsed bar exactly.

But expanding does not grow that strip. It renders a **second, separate card underneath it**:

- 41px collapsed strip stays at y=305
- full 220px card appears at y=362, beginning "September 2026 · Combined ... 36% ... 120% of pace"

The month, the percentage and the pace figure are on screen twice, stacked. Collapsing removes the second card cleanly.

## B3. The fourth line is legended, but still the same colour as the first

The legend now reads "Monthly total | In progress (current month) | 3-month average | 3-month floor". Four entries, requirement met. But:

| Series | Token | Colour | Width | Dash |
|---|---|---|---|---|
| Monthly total | `var(--series-1)` | `#092727` | 2.5px | none |
| **In progress (current month)** | **`var(--series-1)`** | **`#092727`** | 2px | 4 3 |
| 3-month average | `var(--series-4)` | `#17826D` | 2px | 5 3 |
| 3-month floor | `var(--muted-foreground)` | `#5C6B6B` | 1.5px | none |

The first two are **1.00:1** against each other. The legend prints two swatches of the same colour, which is the exact problem just fixed on Margin over Time. Only the dash and half a pixel of width separate them.

## E3. Two of the four controls are not rendered at 390 at all

| Control | Result |
|---|---|
| Items category dropdown | **44px. PASS** |
| Add product | `getBoundingClientRect` returns **0 x 0** |
| Merge item | `getBoundingClientRect` returns **0 x 0** |
| Export CSV (Financials) | not present at 390 |

They are not under 44px, they are absent. If deliberate, fine, but an admin cannot add or merge a product from a phone.

## E1. Mostly fixed, two sizes left behind

Sampled on Overview at 390:

| Size | Weight | Count | Examples |
|---|---|---|---|
| 10px | 400 | 11 | chart axis ticks: "Target 45%", "0.0", "0.6", "1.2" |
| 10px | 600 | 1 | "120% of pace" |
| 11px | 400 | 66 | "avg 55 JOD/day", "Jun to Aug", "5,934 JOD" |
| 11px | 500 | 3 | the "all time" chips |
| 11px | 600 | 3 | "Talabat", "Careem", "760 JOD" |
| 11.5px | 600 | 8 | filter chips |
| 12px | 400 | 16 | stale badge, "Prior: 1,011 JOD" |
| 12px | 700 | 5 | chart eyebrows: "Total Sales · Monthly" |

Supporting text is 12px and the smallest general labels are 11px, both as specified. The 9px and 9.5px tiers are gone. What remains at 10px is the chart axis ticks and "120% of pace".

## C4. Down from three to two, but they disagree

On Overview at 390 with the pace collapsed there is exactly **one** freshness statement. Expand the pace card, or view any page with the bar expanded, and there are **two**:

- header: "⚠ Stale, last update 5 days ago (4 Sept)"
- pace card or bar: "data through 6 Sept"

Two different dates for the same idea, about 600px apart.

---

# PASSes

## A1. Pace bar platform text. PASS, both widths

Expanded bar, measured by walking the text nodes:

| Text | Colour | Contrast |
|---|---|---|
| Talabat | `rgb(244,239,231)` | 13.78:1 |
| 183 | `rgb(244,239,231)` | 13.78:1 |
| Careem | `rgb(244,239,231)` | 13.78:1 |
| 178 | `rgb(244,239,231)` | 13.78:1 |
| Combined | `rgb(155,163,158)` | 6.10:1 |

From 1.00:1 to 13.78:1. Note that collapsed, the bar shows only month, percentage and pace, so the platform row is not on screen in that state.

## A3. Six series tokens in use, no raw hex. PASS

All six are defined and resolve exactly as specified:

```
--series-1  #092727     --series-4  #17826d
--series-2  #1c3f8f     --series-5  #3990d0
--series-3  #993d00     --series-6  #ad911f
```

Every chart series sampled on Overview and Insights carries a `var()` reference in its `fill` or `stroke` attribute (`var(--series-N)`, `var(--talabat)`, `var(--careem)`, `var(--muted-foreground)`). **Zero raw hex literals** found in any chart fill or stroke, at either width.

Three housekeeping notes:

- `--series-5 #3990d0` is defined but was not seen in use on either page.
- The old `--chart-1` through `--chart-5` palette (`#092727, #00493e, #ff5a00, #eec36a, #5c6b6b`) is still defined alongside the new one.
- `--series-1` still aliases `--primary` and `--foreground`, which is the root cause of the original Margin over Time collision and of the B3 issue above.

## A4. Margin over Time draws three distinguishable lines. PASS

| Series | Colour | Width | Dash | Marker |
|---|---|---|---|---|
| Product margin | `var(--series-1)` `#092727` | 2.5px | none | circle r=4 |
| After commission | `var(--series-6)` `#AD911F` | 2px | 7 4 | circle r=4 |
| Net (after commission + promos) | `var(--series-2)` `#1C3F8F` | 2px | 2 3 | circle r=4 |
| Target 45% reference | `var(--muted-foreground)` | 1px | 6 4 | none |

Three different colours and three different dash patterns. The cleanest fix in the batch.

## A5. One orange, one green. PASS

Talabat is `#ff5a00` (`--talabat`) everywhere it appears as a platform. Careem is `#00493e` (`--careem`) everywhere.

The four-greens problem is gone:

- pace card progress segments and dots: now `rgb(0,73,62)` and `rgb(255,90,0)`
- `#1BD15D` appears nowhere
- Net Profit Kept moved from `rgba(63,209,122,0.8)` to `var(--series-4) #17826D`, a series colour rather than a fake Careem green

The Insights panels titled "Careem" and "Talabat" still use series colours for New/Returning rather than platform colours, which is correct since those series are not platform identity.

## B1. Sales by Platform draws at This Month. PASS, both widths

At 390: 6 bar shapes and 1 line curve. At 1440: bars for both platforms plus the 7-day average line as `var(--series-2)` `#1C3F8F` dashed 4 2.

Previously zero shapes, and a line with `stroke-dasharray: 0px, 861.65px` that drew nothing.

## B2 and F5. Commission Drag. PASS

No longer a chart at either width. It is a 153px stat card with no `recharts` container: title, info icon, "11.8pts", and one caption line "Margin points lost to platform fees and discounts in September 2026". Identical at 390 and 1440.

## C1. Header freshness. PASS

"⚠ Stale, last update 5 days ago (4 Sept)". Today is 9 September, so 4 September is genuinely five days ago. Past date, arithmetic correct.

## C2. Same statement on every page. PASS

Byte-identical wording verified on Overview, Insights, Financials, Items, Data entry, Executive report, Targets and CSV import.

## C3. Insights cards no longer repeat a date. PASS

Zero instances of "Data as of" on Insights. All seven are gone.

## D2. One TGR logo at 390. PASS

A single `tgr-logo-light.svg` at x=16, y=14, 39x28, in the dark bar. The second one is gone.

## D3. Bar collapsed to a single line, expands, re-collapses. PASS

**41px** collapsed, showing "September 2026 / 36% / 120% of pace". Contrast inside it is good: month 13.78:1 at 14px, "36%" 9.5:1 at 18px. Tapping the chevron expands it to 139px with the full detail. Navigating from Insights to Financials returns it to 41px.

## D5. Items rows visible without scrolling. PASS

Table top at y=336, first row at y=409 to 486, bar top at y=803. Roughly five rows visible on load. Previously the first row started at y=682.

## D6. "How to read this" is gone. PASS

Zero matches on Items.

## D7. Single Filters toggle. PASS

Insights, Financials and Items each show one button reading "Filters · this month", `aria-expanded="false"`, no chips visible.

- Opening reveals five range chips (51px tall) and three platform chips (33px tall)
- Closing collapses them to zero size
- The label shows the active range but **not** the active platform

## D8. Bottom gap. PASS

| Page | Last visible content bottom | Bar top | Clear gap |
|---|---|---|---|
| Overview | 764 | 844 (no bar) | 80px |
| Insights | 713 | 803 | 90px |
| Items | 768 | 803 | 35px |

No overlaps at maximum scroll on any page. The 170px of dead scroll is gone.

## E2. Info icon hit area. PASS

Measured by scanning `elementFromPoint` on an 80x80 grid around a visible icon: the button responds across **46 x 44 px** while the glyph stays 13 x 12. The mechanism is a `::before` with inset `6px -37.6px -38px 6.4px`. Verified with 506 hit samples.

## F2. Floor paragraph moved behind the info icon. PASS

The visible subtitle is now just "Combined monthly gross incl VAT (Talabat + Careem)".

The floor rule text is inside the tooltip: "The 3-month floor is the lowest monthly total across each month and the two before it; a yellow point marks where that floor steps up", along with the Careem GMV explanation.

## F3. Category chart subtitles. PASS

Revenue by category and Units by category now have **no subtitle at all**. Header zone dropped from 101px to 52px on each. "Unassigned items roll up under Uncategorised" appears nowhere.

## F4. "all time" chips. PASS

Small 11px chips sit beside the titles on Total sales over time, Margin over Time and Order Volume Trend. The sentences saying "not affected by the date filter above" are gone.

## G1. Pinned first column. PASS, both tables

**Financials:** first-column cells are `position: sticky; left: 0; z-index: 10`. Scrolling the container to `scrollLeft: 400` leaves the first cell at x=25 while the second column moves to x=-318.

**Items:** same, `position: sticky` confirmed.

## G2. Sidebar full height on Data entry at 1440. PASS

`sticky top-0 h-screen`, 256px wide, y=0 to 900, background `rgb(9,39,39)`. Probing at x=60, y=892 returns a sidebar element with that same background. No cream gap.

## G3. One TGR logo at desktop. PASS

A single `tgr-logo-light.svg` at x=52, y=20, 45x32, in the sidebar rail. The header logo is gone. The Talabat and Careem marks in the header are partner logos, not duplicates, and there is a small Fyxx mark at the sidebar foot.

## G4. CSV import drop zone. PASS

Reached step 3 by selecting Talabat then Order Report. **No file was chosen and nothing was imported.**

The zone is a `hidden md:flex` container, 1062 x 138px, `2px dashed rgb(221,212,194)`, with centred content reading "Drag a CSV here, or" above a "Choose CSV" button. Desktop only, which matches the requirement.

## F1. Chart text against plot area at 390. Measured, roughly unchanged

| Chart | Card | Header | Plot | Legend | Axis | Words |
|---|---|---|---|---|---|---|
| Promotions & ad spend | 463 | 186 | 180 | 34 | 46 | **61%** |
| Total sales over time | 339 | 92 | 151 | 33 | 46 | 55% |
| Sales by Platform | 360 | 72 | 167 | 17 | 46 | 54% |
| Margin over Time | 319 | 72 | 151 | 33 | 46 | 53% |
| Order Volume Trend | 319 | 72 | 167 | 17 | 46 | 48% |
| Careem new vs returning | 309 | 72 | 163 | 19 | 38 | 47% |
| Talabat new vs returning | 309 | 72 | 163 | 19 | 38 | 47% |
| Net Profit Kept | 319 | 72 | 184 | 0 | 46 | 42% |
| Top 10 items | 427 | 90 | 282 | 0 | 38 | 34% |
| Revenue by category | 369 | 52 | 262 | 0 | 38 | **29%** |
| Units by category | 369 | 52 | 262 | 0 | 38 | **29%** |

The two category charts improved a lot: 29% words with the header down from 101px to 52px. Everything else is within a couple of points of where it was.

Total sales over time actually got slightly worse: the header dropped from 120px to 92px, but adding "In progress (current month)" pushed the legend from one line to two, 17px to 33px, so the net was a wash. Margin over Time has the same two-line legend problem.

Promotions & ad spend is still the worst at 61%. The subtitle shrank to "Spend by type vs net margin", but the 186px header is mostly the three KPI tiles above the chart, which were not touched.

---

# H. Other findings

## The sticky header still does not stick

Carried over from the last audit and not on the list, but it is the single most annoying thing left on a phone.

`<main>` still has `overflow: auto` while never actually scrolling (`scrollHeight` equals `clientHeight`), so it becomes the containing block for the sub-header's `sticky top-0` and the rule never fires. At `scrollY` 600 the sub-header measures `top: -498`.

On Insights, which is 4,462px tall, the nav is gone the moment you start scrolling and you must return to the very top to change section. **Fixing D1 by shrinking the header is worth much less than making the nav sticky.**

## The "% rate" line series render nothing at a single-month range

On Insights at This Month, all six charts draw their bars but `recharts-line-curve` count is 0 across the board. "Net margin %" and "Repeat rate %" appear in the legends with a colour swatch and draw no mark, because one data point makes no line.

Either drop those legend entries at single-month ranges, or render a dot.

## Charts take several seconds to paint after client-side navigation

On first landing on Insights, every bar group was empty and stayed empty through a full scroll pass and a four-second wait. Re-navigating with a longer settle rendered everything correctly, so the data and the code are fine.

But there is a window where the page shows axes, legends and correct axis labels with no marks at all. That is indistinguishable from the bug just fixed, and a user on a slow connection will read it as broken. A skeleton or a spinner would help.

## "Salt & Pepper ChickenWings (12pcs)"

Still has the missing space in the Top 10 items axis label. Correct as "Salt & Pepper Chicken Wings (12pcs)" in the table below it. Third audit in a row.

## The dark bar at the top of mobile earns nothing

57px, roughly a third of the header stack, holding a 39x28 logo and a logout icon. Merging the logo into the nav strip is the 57px missing from D1, and it costs nothing.

## Platform is missing from the Filters label

It reads "Filters · this month". If someone leaves it on Talabat and scrolls away, the collapsed toggle gives no hint that the numbers below are filtered.

---

# Overall

Nineteen of the twenty-eight items are clean passes, and the hard ones (A1, A3, A4, A5, G1, G2, G4) are properly done rather than papered over.

The pattern in what failed is consistent:

1. **The colour and token work was thorough. The mobile layout work was not finished.** D1, D9 and D10 are all the same unfinished job at the top and bottom edges of the phone screen.
2. **Two of the three new contrast failures are the old bug reappearing in a new place**, because the palette changed and a hardcoded foreground colour did not follow it. The "18%" on the Careem segment went from 5.94:1 to 1.80:1 purely as a side effect of adopting the correct green.
3. **`--series-1` aliasing `--primary` and `--foreground` is still live**, and it has already produced a second identical-colour pair in "Monthly total" versus "In progress (current month)". That alias should be broken before it causes a third.

## Suggested order

1. Break the `--series-1` / `--primary` / `--foreground` alias and give "In progress (current month)" its own colour.
2. Fix the two new contrast failures: the "18%" label on the Careem segment, and the ⓘ inside the pace bar.
3. Make the nav sticky (remove `overflow: auto` from `<main>`, or make the real scroller the sticky context).
4. Delete the 57px dark bar and move the logo into the nav strip. That closes most of the D1 gap.
5. Move the gear up so it clears the 41px bar, and make "Data entry" reachable in the nav.
6. Decide whether Add product, Merge item and Export CSV should exist on a phone. Right now they silently do not.
