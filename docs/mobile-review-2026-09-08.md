# Fyxx / TGR Delivery Dashboard: mobile review

**Site:** https://fyxx-dash-magic.lovable.app
**Date:** 8 September 2026
**Viewport:** 390 x 844, iPhone-sized, with mobile device emulation (verified `innerWidth` = 390, touch user agent active)
**Scope:** read-only visual review. Nothing was changed, no credentials entered, no save / import / delete controls clicked.

Colour findings were re-verified in a normal Chrome session as well as the preview browser, so none of them are artefacts of the testing environment.

---

## Problems, worst first

### 1. Bottom bar, platform row: the text is invisible
**Pages:** Insights, Financials, Items (anywhere the bar shows)
**Element:** the "Talabat 183 Careem 178" row inside the fixed bottom bar

"Talabat", "183", "Careem" and "178" are all rendered in `rgb(9,39,39)` on a bar background of `rgb(9,39,39)`. Contrast ratio exactly **1.00:1**. All that is visible is an orange dot at x=16 and a green dot at x=108 with blank space after each. "Combined 361 JOD" next to them is cream and reads fine, which is what makes it look like a rendering fault rather than a design choice.

Reproduces in Chrome and in the preview pane, in both light and dark. The sibling elements in that bar use a `--cream` token; this row uses the dark-green foreground token, which is correct on a cream card and wrong inside the dark bar.

### 2. Overview card: the headline number is nearly unreadable
**Page:** Overview
**Element:** the "36%" pace figure and the per-platform percentages

"36%" is `rgb(245,180,0)` on white. Contrast **1.84:1**. WCAG wants 3:1 even for large text, so this is roughly half the floor for the single biggest number on the page. The same gold is used at 11px for "43%" and "31%" on the Careem and Talabat rows, and at 10.5px for "data through 6 Sept", where the requirement is 4.5:1.

### 3. The "slim" bottom bar is 149px tall, 17.7% of the screen
**Pages:** every page except Overview
**Element:** the fixed pace bar

At 390px it stacks into four rows: month plus day pill, then 36% plus pace pill, then the progress bar, then the platform row, then base / stretch. Meanwhile the right third of it, roughly x=275 to 390, is completely empty. At 1470px the same bar is 97px tall.

### 4. Items: you land on the page and see zero data
**Page:** Items
**Element:** everything above the table

The first table row starts at y=682 on an 844px screen, and the bottom bar covers from y=695 down. So on load there is a 13px sliver of table and nothing else.

The 682px above it breaks down as:

| Element | Height |
|---|---|
| Main padding | 24 |
| "Items" H1 (30px type) | 36 |
| Subtitle paragraph | 60 |
| "How to read this" block | 111 |
| Date range chips (wraps to 2 rows) | 61 |
| Platform chips | 43 |
| Category chips | ~100 |
| Zero-sales toggle | 20 |
| "Add product" / "Merge item" | 32 |

The subtitle and the "How to read this" block say the same thing twice, in near-identical words. That is 171px restating set price versus avg price.

### 5. The sticky header does not stick
**Pages:** Overview, Insights
**Element:** `div.border-b.bg-card.sticky.top-0.z-50`

`<main>` has `overflow: auto` but never actually scrolls (its `clientHeight` equals its `scrollHeight`), so it becomes the containing block for the sub-header's `sticky top-0` and the rule never engages. Measured: at `scrollY` 600 the sub-header sits at y = -498.

Consequence: the tab bar scrolls away permanently. On Insights, which is 4,906px tall, you have to scroll the whole page back to the top to change section. The `sticky top-0 z-50` class is dead code.

### 6. Header: 189px of chrome before any content, and yes, two TGR logos
**Pages:** Overview, Insights

Confirmed. Two logos on screen at once:

- **Logo 1:** `tgr-logo-light.svg`, 39 x 28, at x=16 y=14, inside the 57px dark green top bar. That bar contains only this logo and a logout icon on the right.
- **Logo 2:** `tgr-logo-dark.svg`, 45 x 32, at x=16 y=112, inside the 87px cream sub-header, next to the "The Green Room" wordmark. The wordmark wraps onto two lines at this width.

The stack is: logo bar (57) + nav strip (45) + logo and wordmark bar (87) = **189px, 22% of the screen**, before the first filter chip.

The top bar is the redundant one: a logo and a logout button and nothing else. The sub-header logo is the misplaced one, because it duplicates a mark you saw 100px earlier and it pushes the wordmark into a two-line wrap.

### 7. "Data entry" is off the right edge of the nav
**Pages:** all

Nav content is 506px wide inside a 390px box with `overflow-x: auto`. The "Data entry" link starts at x=394, entirely off screen. There is no fade, arrow, or partial-item peek to signal the strip scrolls, so a fifth section is effectively hidden.

### 8. Financials and Items have no sub-header at all
**Pages:** Financials, Items

They render only the dark top bar plus nav. No "Data current as of 30 Sept", no "2 months to review" badge, no wordmark. The two pages people will make money decisions on are the two with no freshness indicator.

### 9. Three different "as of" dates on screen at once
- Header: "Data current as of 30 Sept"
- Pace card: "data through 6 Sept"
- Every Insights card: "Data as of 7 Sept 2026" (repeated on all seven cards)

### 10. The gear straddles the bar's top edge
**Pages:** any page showing the bar

Gear is 44 x 44 at x=331. With no bar it sits at y=778 to 822. With the bar it moves to y=672 to 716, and the bar starts at y=695, so its bottom **21px sit on top of the bar**. It covers no text, because the bar's rightmost content ends at x=273, but it reads as a misalignment. It also jumps 106px vertically when you move between Overview and Insights in "Both" mode.

### 11. Wide tables, and only one of the three pins the first column

| Page | Table width | Container | Scroll factor | First column |
|---|---|---|---|---|
| Insights (per-item) | 1,148px | 324px | 3.5x | sticky, works well |
| Items | 960px | 340px | 2.8x | `static` |
| Financials | 831px | 340px | 2.4x | `static` |

On the two pages where the first column is static, scrolling right loses track of which row you are reading. On Items the item name is the only thing identifying the row.

### 12. Tap targets below the 44px minimum

| Control | Size |
|---|---|
| Info icons | 12 x 12 (30+ on Overview, 9 in the Items table header) |
| Export CSV | 118 x 32 |
| Add product | 122 x 32 |
| Merge item | 117 x 32 |
| Category dropdown (per Items row) | 140 x 27 |
| Gear button | 44 x 44 (the one that gets it right) |

### 13. More contrast failures
- "Day 8/30" pill in the bar: `rgb(9,39,39)` on a 13% cream overlay computing to `rgb(40,65,64)` = **1.44:1**
- "18%" on the orange progress segment in the Overview card: white at 80% on `rgb(255,90,0)` = **2.47:1**, at 9px
- "18%" on the green segment is fine at 5.94:1

### 14. Card and bar encode the same data differently

| | Overview card | Bottom bar |
|---|---|---|
| Progress | split green (Careem, 58px) + orange (Talabat, 59px) on cream track, "18%" printed inside each | one solid cream fill (112px) on a translucent track, no split, no labels |
| Platform order | Careem, then Talabat | Talabat, then Careem |
| Accent gold | `rgb(245,180,0)` | `rgb(238,195,106)` |
| Per-platform detail | "/ 410 JOD", "43%" | dropped, reduced to bare dots |

Two visual languages for one metric.

### 15. Smaller things
- Body text at 10px is everywhere: 21 separate elements on Overview, including "Prior: 1,011 JOD", "Data current as of 30 Sept", and all six chart eyebrow labels
- "avg 9 JOD/day" and "Jun to Aug" are 9.5px; the in-bar "18%" is 9px
- Chart y-axis label reads "Salt & Pepper ChickenWings", missing a space. Correct as "Salt & Pepper Chicken Wings" in the table below
- Items shows "JOD 11.000" and "JOD 13.500" at three decimals next to "JOD 3.18" at two
- In bar mode the page reserves a 318px bottom spacer for a 149px bar, leaving about 170px of dead scroll
- The three pace-mode options are plain buttons with no `aria-pressed` or `aria-checked` and no radio role, so the current selection is communicated by background colour alone

---

## Answers to the six checks, per page

**Horizontal overflow:** none, on any of the four pages. `document.scrollWidth` is exactly 390 everywhere. The body never scrolls sideways. All wide content is correctly contained in its own `overflow-x` box.

**Cut off, overlapping or squeezed text:** no true clipping anywhere except one case. On Insights, the "Customer promos" value in the "Biggest category" tile has `truncate` and needs 157px in an 81px slot, so it is cut with an ellipsis. Everything else that looked truncated turned out to be line-height rounding, not clipping. Squeezed, yes: the Items first column at 84px wide pushes "Salt & Pepper Chicken Wings (12pcs)" to a four-line, 107px-tall row.

**Does the bar cover content:** no. Every page was scrolled to `scrollHeight` and tested for intersection against the fixed bar. Zero collisions on Overview, Insights, Financials and Items. The bottom padding is generous to a fault (see item 15).

**Gear:** bottom right, x=331, 15px from the right edge, 44 x 44, a comfortable tap. Overlaps the bar's top edge by 21px but covers nothing. Its popover is 296 x 314 and fits entirely on screen.

**Legibility:** the layout is fine, the type sizes are not. 10px is the default for supporting text and 9 to 9.5px for the smallest labels. Combined with the contrast problems above, several of the most important numbers are the least readable ones.

**Tables and charts:** charts fit and are never clipped. Tables fit only in the sense that they scroll inside their own container, 2.4x to 3.5x wider than the screen.

---

## The gear, three modes

Behaviour is correct and consistent. No broken state found. The setting was returned to "Both" after testing, which is where it started.

| Mode | Overview | Insights |
|---|---|---|
| Card only | 215px card at top of content, no bar. Page 3,545px | nothing at all, just the floating gear. Page 4,588px |
| Both (default) | card, no bar. Page 3,545px | 149px bar. Page 4,906px |
| Bar only | card gone, 149px bar appears. Page 3,632px | identical 149px bar. Page 4,906px |

Switching is clean: the popover closes on selection, the layout reflows without flicker.

Two confusing bits:

1. In "Card only", the gear still floats on Insights doing nothing visible, so tapping it there feels like a dead end until you go back to Overview.
2. The panel says the choice is "saved to your profile", but the selected option carries no accessible state, only a colour change.

---

## Chart text audit

Measured per card: header zone, plot drawing area, legend, footnote. All values in pixels.

| Chart | Page | Card | Header text | Plot | Legend | Footnote |
|---|---|---|---|---|---|---|
| Promotions & ad spend | Insights | 469 | 192 | 180 | 34, 2 lines | 17 |
| Total sales over time | Overview | 367 | 120 | 167 | 17 | 17 |
| Sales by Platform | Overview | 352 | 69 | 167 | 17 | 53, 2 lines |
| Margin over Time | Overview | 332 | 85 | 151 | 33, 2 lines | 17 |
| Order Volume Trend | Overview | 332 | 85 | 167 | 17 | 17 |
| Net Profit Kept | Overview | 316 | 69 | 184 | none | 17 |
| Top 10 items | Insights | 422 | 85 | 282 | none | 17 |
| Revenue by category | Insights | 418 | 101 | 262 | none | 17 |
| Units by category | Insights | 418 | 101 | 262 | none | 17 |
| Careem new vs returning | Insights | 322 | 85 | 163 | 19 | 17 |
| Talabat new vs returning | Insights | 306 | 69 | 163 | 19 | 17 |

Rough rule from that table: the bar-chart cards on Insights are healthy, at about 65% drawing. The multi-series line and combo charts are the bloated ones, at 40 to 50% drawing.

### Worst offender: "Promotions & ad spend" on Insights

Card 469px tall. Header zone 192px (title, a two-line subtitle, "Data as of 7 Sept 2026", plus a row of three KPI tiles: Total spend, % of gross, Biggest category). Legend 34px, wrapped onto two lines because it carries five series. Footnote zone 17px. Actual plot drawing area: **180px**.

So roughly **61% of the block is words and 39% is chart**, for a chart that at this range plots a single month, "Sept 26". The three KPI tiles above it already state the answer, which makes the chart close to decorative here.

**Runner-up:** "Total sales over time" on Overview. Card 367px, header zone 120px of which 63px is a three-line paragraph explaining the 3-month floor rule, plot 167px. Slightly more than half the block is words.

### What is necessary and what is not

Necessary at a glance: the title, the unit, and the axis. Everything else is padding. Specifically, drop or hide behind the info icon:

- "Data as of 7 Sept 2026", repeated on all seven Insights cards. Say it once in the header, and fix the fact that the header currently says 30 Sept instead.
- "not affected by the date filter above", which appears three times on Overview in near-identical wording. Better as a small "all time" chip next to the title.
- The whole 3-month-floor explanation on "Total sales over time". It is 63px explaining a rule that is already summarised in the "Current floor 760 JOD / since July" stat right beside it.
- "Unassigned items roll up under Uncategorised", identical on both category charts.
- The subtitles on "Revenue by category" and "Units by category" are the same sentence with one word changed. One of the two titles is already doing that work.

### Axis labels

All ticks are 10 to 11px. Nothing is rotated. Nothing overlaps. But the horizontal bar charts allocate the category axis only 70px while labels need up to 172px, so they spill leftwards to x=43 on a card whose content starts at x=33, leaving 10px of breathing room. "Salt & Pepper ChickenWings (12pcs)" wraps to two lines to cope. Legible at 11px, but consuming a third of the card width to do it.

### Legends

Two wrap onto two lines: "Margin over Time" (Product margin / After commission / Net after commission + promos) and "Promotions & ad spend" (five series). Both are needed, because the series are not otherwise named in the chart, and both are needed precisely because the charts carry too many series for a 358px card. The fix is fewer series per chart, not a smaller legend. The five charts with no legend at all are the ones that read best.

### Footnotes

Only one real footnote exists: "Careem shown on food-basket basis (your revenue), ~11% below Careem's GMV headline. See tooltip." on Sales by Platform. It is 10px, two lines, 28px tall, and it is a genuinely load-bearing caveat about what the numbers mean, sitting in the smallest type on the card and ending with "See tooltip", which points at a 12px icon. That is backwards. Everything else that reads like a footnote is actually placed above the chart, which is worse, because it delays the chart instead of annotating it.

### Not a chart at all

"The Commission Drag" on Overview is styled as a chart card and sits in the chart grid, but draws nothing. It is a title, an info icon, a subtitle, "11.8pts", a caption, and a three-line paragraph that ends by telling you to pick a wider range to make it useful. It is a 10px-labelled paragraph pretending to be a visualisation.

---

## Honest impression

The information design is genuinely good and the mobile execution is undermining it. Someone thought hard about product margin versus margin after commission versus net margin, and about food-basket basis versus Careem's GMV headline. That is real domain knowledge and it is rare. But the phone build reads like a desktop dashboard that had `md:` breakpoints bolted on, and it has two bugs that a single pass on an actual phone would have caught.

The thing that makes it feel unusable is not cramping, it is the arithmetic. On Insights you have 844px of screen. 189px goes to header chrome carrying two copies of the same logo. 149px goes to a bar that is supposed to be slim. That leaves 506px, 60% of the phone, for a 4,906px page. And because the sticky header is broken, once you scroll into that page the navigation is gone until you scroll all the way back. So the dashboard costs 40% of the screen to tell you the same six numbers over and over while making the four sections hard to move between.

The bar is the part worth arguing with hardest. It is pinned to every page except the one page where it would be most relevant, it is a fifth of the screen, and a third of it is empty. It shows "36%" and "135% of pace", which do not change while you read a table of item margins. That is a persistent cost for a number you would happily tap once to see.

### What to change, in order

1. **Fix the two contrast bugs.** Swap the platform row in the bar to the cream token, and stop using `rgb(245,180,0)` on white for the pace percentage. Half a day, and it makes the product stop looking broken.
2. **Delete the dark top bar entirely** and move the logo into the nav strip. That is 57px back, and it removes the duplicate logo without touching the sub-header.
3. **Make the header actually stick**, by removing `overflow: auto` from `<main>` or by making the real scroller the sticky context. Pin the nav strip, not the wordmark bar. Getting back to the tabs matters more than seeing the logo again.
4. **Collapse the bar to one line:** month, percentage, pace, and a chevron that expands the rest on tap. Target 44 to 56px instead of 149. Then move the gear so it clears it.
5. **On Items,** delete the "How to read this" block, since the subtitle above already says the same thing, and move the filter chips into a collapsible row. That alone would put real data above the fold.
6. **Make first columns sticky** on Financials and Items, matching what Insights already does correctly.
7. **Raise the base font** from 10px to 12px and the smallest labels from 9px to 11px, and grow the info-icon hit areas to 44px while leaving the glyph at 12px.
8. **On charts,** move every "not affected by the date filter" and "Data as of" string out of the card body. Give the chart the space back.

---

## Method notes

- The gear panel says the mode is "saved to your profile", so cycling the three modes did write that preference. It was set back to "Both", which is where it started.
- "Add product", "Merge item", "Export CSV" and anything under Data entry were not clicked.
- Direct navigation to `/dashboard` by URL bounces back to the landing page; the dashboard is reached by clicking "View Dashboards". Worth checking, since it means a bookmarked or shared deep link does not work.
