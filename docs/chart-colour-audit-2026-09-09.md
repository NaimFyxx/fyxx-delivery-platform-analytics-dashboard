# Fyxx / TGR Delivery Dashboard: chart colour audit

**Site:** https://fyxx-dash-magic.lovable.app
**Date:** 9 September 2026
**Widths tested:** 1440 x 900 (desktop) and 390 x 844 (iPhone, with mobile device emulation)
**Scope:** read-only. Nothing was changed.

## Method

Colours were read from the rendered DOM: computed `stroke` and `fill` on the Recharts SVG nodes, plus the legend swatch elements. No pixel sampling and no guessing.

Contrast ratios are WCAG 2.1 relative luminance. Because WCAG contrast is a luminance measure and a poor proxy for "can I tell these two apart", CIEDE2000 perceptual distance (ΔE) is given alongside it. Rough reading of ΔE: under 2 is invisible, under 10 reads as the same colour in different light, over 30 is comfortably distinct.

Colour blindness is simulated with the Viénot LMS method for deuteranopia and protanopia.

**One caveat.** At the default "This Month" range the bar charts render empty: every `recharts-bar-rectangle` group has no shape child, and the 7-day average line carries `stroke-dasharray: 0px, 861.65px` so it draws nothing either. The chart shows axes and a legend and no data. To read the real bar fills the range filter was switched to All-Time and then set back to This Month. That is a view filter, not a saved setting.

---

## Design tokens

```
--primary          #092727      --talabat          #ff5a00
--foreground       #092727      --careem           #00493e
--accent           #eec36a      --muted-foreground #5c6b6b
--warning          #b8862a      --success          #1f8a4c
--card             #ffffff      --destructive      #c43d3d
--background       #f4efe7
```

Every chart card sits on `--card` = pure white `rgb(255,255,255)`, so all alpha colours below are composited over white.

Note that `--primary` and `--foreground` hold the same value. That matters, see problem 1.

---

## Worst offenders

### 1. Margin over Time: two of the three lines are the same colour. Not similar. Identical.

| Series | Colour | Width | Dash | Marker |
|---|---|---|---|---|
| Product margin | `#092727` | 2px | none | circle r=4, fill `#092727` |
| After commission | `#C8B89B` | 2px | none | circle r=4, fill `#C8B89B` |
| **Net (after commission + promos)** | **`#092727`** | **2px** | **none** | **circle r=4, fill `#092727`** |
| Target 45% (reference) | `#5C6B6B` | 1px | 6 3 | none |

Product margin against Net margin: contrast **1.00:1**, **ΔE 0.0**. Same stroke width, same dash, same dot radius, same dot fill. The legend prints two swatches that are the same colour.

The cause is visible in the DOM: one dot uses `fill="var(--foreground)"`, the other `fill="var(--primary)"`, and both tokens resolve to `#092727`. Someone picked two token names believing they were two colours.

This is the worst problem on the dashboard and it is not a palette problem. The chart that explains where your margin goes, from product margin down to net after commission and promos, draws the start and the end of that story as one line.

### 2. Total sales over time draws four lines and legends three

| Drawn line | Colour | Width | Dash | In legend? |
|---|---|---|---|---|
| Monthly total | `#092727` | 2.5px | none | yes |
| **(unlabelled)** | **`#092727`** | **2px** | **4 3** | **no** |
| 3-month average | `#C8B89B` | 2px | 5 3 | yes |
| 3-month floor | `#5C6B6B` | 1.5px | none | yes |
| floor-step marker | `#EEC36A` dot r=4.5, white 1.5px ring | | | no |

The fourth line is the same `#092727` as "Monthly total" (contrast 1.00:1, ΔE 0.0), separated only by a 4-3 dash and half a pixel of width. Nothing in the legend says what it is.

Also in this chart: `#C8B89B` against the `#EEC36A` marker dot is contrast **1.17:1**, **ΔE 13.9**. The "the floor stepped up here" marker barely separates from the sand-coloured average line it sits near.

### 3. Units by category: the two bar tones are effectively one colour

`#EEC36A` and `rgba(238,195,106,0.7)` which composites to `#F3D597`. Contrast **1.17:1**, **ΔE 6.7**, and ΔE 6.4 under deuteranopia. The highlight tone does not read as a highlight.

Compare the two sibling charts, Top 10 items and Revenue by category, which do the same thing correctly: `#00493E` against `rgba(63,209,122,0.7)` = `#79DFA2`, contrast 6.37:1, ΔE 53.7. Same pattern, one chart got a working pair and one did not.

### 4. Promotions & ad spend collapses under red-green colour blindness

| Series | Colour | Deuteranopia | Protanopia |
|---|---|---|---|
| Customer promos | `#C8B89B` | `#BDBD9B` | `#BABA9B` |
| Paid ads | `#FF8C42` | `#B8B837` | `#9F9F44` |
| Promo sharing | `#5FD0A3` | `#B8B8A5` | `#C7C7A3` |
| Loyalty subsidy | `#2E6E66` | `#616167` | `#696966` |
| Net margin % (line, 2px) | `#F5B400` | `#CACA00` | `#BDBD06` |

**Customer promos against Promo sharing** is the collision: ΔE 25.7 in normal vision, but **ΔE 5.3 deuteranopia and 3.8 protanopia**. `#BDBD9B` next to `#B8B8A5` is the same colour. These are two stacked segments in the same bar, touching each other.

**Paid ads against Net margin %** is the second: ΔE 20.7 normal, **6.1 deuteranopia**. The orange bar and the gold trend line merge.

---

## Full inventory

### Overview

#### 1. Sales by Platform — 2 series at All-Time, 3 at This Month

| Series | Colour | Form |
|---|---|---|
| Talabat | `#FF5A00` rgb(255,90,0) | bar |
| Careem | `#00493E` rgb(0,73,62) | bar |
| 7-day avg (This Month only) | `#F5B400` rgb(245,180,0) | line, 2px |

| Pair | Contrast | ΔE | Deut | Prot |
|---|---|---|---|---|
| Talabat / Careem | 3.32:1 | 58.4 | 46.9 | 28.7 |
| Talabat / 7-day avg | 1.70:1 | 30.1 | **11.0** | 20.9 |
| Careem / 7-day avg | 5.64:1 | 61.7 | 60.3 | 51.7 |

Non-colour encoding: bars against a line separates the average out. Talabat against Careem is **colour only**.

#### 2. Total sales over time — 4 lines + 1 marker

| Pair | Contrast | ΔE |
|---|---|---|
| Monthly total / unlabelled line | **1.00:1** | **0.0** |
| Monthly total / 3-month average | 8.10:1 | 61.4 |
| Monthly total / 3-month floor | 2.83:1 | 23.8 |
| 3-month average / 3-month floor | 2.86:1 | 32.1 |
| 3-month average / floor marker | **1.17:1** | **13.9** |
| 3-month floor / floor marker | 3.35:1 | 41.4 |

Non-colour encoding: **the best on the dashboard.** Four distinct dash patterns, four distinct widths (2.5 / 2 / 2 / 1.5), dots only on Monthly total.

#### 3. Margin over Time — 3 lines + 1 reference

| Pair | Contrast | ΔE |
|---|---|---|
| Product margin / Net margin | **1.00:1** | **0.0** |
| Product margin / After commission | 8.10:1 | 61.4 |
| After commission / Net margin | 8.10:1 | 61.4 |
| Product margin / 45% reference | 2.83:1 | 23.8 |
| After commission / 45% reference | 2.86:1 | 32.1 |
| Net margin / 45% reference | 2.83:1 | 23.8 |

Non-colour encoding: **none.** All three lines are 2px, solid, with r=4 circle dots.

#### 4. Order Volume Trend — 2 series

| Series | Colour | Width |
|---|---|---|
| Avg orders/day | `#092727` | 2px, solid, r=4 dots |
| Avg JOD/day | `#C8B89B` | 2px, solid, r=4 dots |

Contrast **8.10:1**, ΔE 61.4, deuteranopia 62.0. This pair is fine.
Non-colour encoding: **none**, but with two well-separated series on separate left and right axes it does not need any.

#### 5. Net Profit Kept — 1 series

Bars `rgba(63,209,122,0.8)` = `#65DA95`. No pairs. Contrast against its white card **1.75:1**.

#### 6. The Commission Drag — 1 series

Bars `rgba(255,90,0,0.75)` = `#FF8340`. It drew at 390px and drew nothing at 1440px in this pass, which is worth a look independently of colour.

### Insights

#### 7. Promotions & ad spend — 5 series

All ten pairs:

| Pair | Contrast | ΔE | Deut | Prot |
|---|---|---|---|---|
| Customer promos / Paid ads | 1.19:1 | 22.4 | 16.2 | 15.5 |
| Customer promos / Promo sharing | 1.02:1 | 25.7 | **5.3** | **3.8** |
| Customer promos / Loyalty subsidy | 3.05:1 | 38.0 | 36.3 | 29.0 |
| Customer promos / Net margin % | 1.06:1 | 20.2 | 19.7 | 19.6 |
| Paid ads / Promo sharing | 1.22:1 | 51.6 | 20.3 | 16.6 |
| Paid ads / Loyalty subsidy | 2.57:1 | 50.3 | 43.0 | 28.7 |
| Paid ads / Net margin % | 1.26:1 | 20.7 | **6.1** | 11.2 |
| Promo sharing / Loyalty subsidy | 3.12:1 | 32.3 | 33.0 | 32.5 |
| Promo sharing / Net margin % | 1.03:1 | 39.2 | 23.6 | 18.6 |
| Loyalty subsidy / Net margin % | 3.22:1 | 48.5 | 47.7 | 37.9 |

Non-colour encoding: the net margin line is a line, the rest are stacked segments. Among the four segments, **colour only**.

#### 8. Careem new vs returning — 4 series at All-Time, 3 at This Month

| Series | Colour |
|---|---|
| New | `#C8B89B` |
| Reactivated | `rgba(46,110,102,0.45)` = `#A1BEBA` |
| Retained | `#2E6E66` |
| Repeat rate % | line `#F5B400`, 2px |

| Pair | Contrast | ΔE | Deut | Prot |
|---|---|---|---|---|
| New / Reactivated | 1.02:1 | 18.6 | 16.8 | **12.0** |
| New / Retained | 3.05:1 | 38.0 | 36.3 | 29.0 |
| New / Repeat rate % | 1.06:1 | 20.2 | 19.7 | 19.6 |
| Reactivated / Retained | 2.99:1 | 30.3 | 30.1 | 27.7 |
| Reactivated / Repeat rate % | 1.08:1 | 33.6 | 32.5 | 27.8 |
| Retained / Repeat rate % | 3.22:1 | 48.5 | 47.7 | 37.9 |

Non-colour encoding: **colour only** among the three segments.

#### 9. Talabat new vs returning — 3 series

New `#C8B89B`, Returning `#2E6E66`, Repeat rate % line `#F5B400`.

| Pair | Contrast | ΔE | Deut | Prot |
|---|---|---|---|---|
| New / Returning | 3.05:1 | 38.0 | 36.3 | 29.0 |
| New / Repeat rate % | 1.06:1 | 20.2 | 19.7 | 19.6 |
| Returning / Repeat rate % | 3.22:1 | 48.5 | 47.7 | 37.9 |

The healthiest multi-series chart on the page.

#### 10. Top 10 items and 11. Revenue by category — 1 series, two conditional tones

`#00493E` and `rgba(63,209,122,0.7)` = `#79DFA2`. Contrast 6.37:1, ΔE 53.7, deuteranopia 54.8. Good.

#### 12. Units by category — 1 series, two conditional tones

`#EEC36A` and `rgba(238,195,106,0.7)` = `#F3D597`. Contrast 1.17:1, ΔE 6.7. See problem 3.

### Line thickness, all charts

| Width | Used by |
|---|---|
| 2.5px | Monthly total |
| 2px | 7-day avg, the unlabelled 4th line, 3-month average, all three margin lines, both order-volume lines, all three "% rate" lines |
| 1.5px | 3-month floor |
| 1px | Target 45% reference line (dashed 6 3) |

### Direct labelling

There is none, anywhere. Every `recharts-label-list` is empty on all twelve charts. No value labels, no end-of-line labels. Every series depends entirely on the legend, and the legend depends entirely on colour.

---

## Colour blindness summary

Collisions, worst first:

| Chart | Pair | Normal ΔE | Deutan | Protan |
|---|---|---|---|---|
| Margin over Time | Product margin / Net margin | 0.0 | **0.0** | **0.0** |
| Total sales over time | Monthly total / unlabelled line | 0.0 | **0.0** | **0.0** |
| Promotions & ad spend | Customer promos / Promo sharing | 25.7 | **5.3** | **3.8** |
| Promotions & ad spend | Paid ads / Net margin % | 20.7 | **6.1** | 11.2 |
| Units by category | tone A / tone B | 6.7 | **6.4** | **6.7** |
| Sales by Platform | Talabat / 7-day avg | 30.1 | **11.0** | 20.9 |
| Careem panel | New / Reactivated | 18.6 | 16.8 | **12.0** |
| Total sales over time | 3-month average / floor marker | 13.9 | 14.2 | 13.4 |

### Simulated values for the whole palette

| Colour | Normal | Deuteranopia | Protanopia |
|---|---|---|---|
| Talabat | `#FF5A00` | `#A3A300` | `#7C7C0C` |
| Careem | `#00493E` | `#3D3D3F` | `#45453E` |
| gold | `#F5B400` | `#CACA00` | `#BDBD06` |
| accent | `#EEC36A` | `#D1D168` | `#C8C86A` |
| sand | `#C8B89B` | `#BDBD9B` | `#BABA9B` |
| teal | `#2E6E66` | `#616167` | `#696966` |
| mint | `#5FD0A3` | `#B8B8A5` | `#C7C7A3` |
| orange | `#FF8C42` | `#B8B837` | `#9F9F44` |
| ink | `#092727` | `#212127` | `#252527` |
| slate | `#5C6B6B` | `#67676B` | `#69696B` |

**The green-and-orange worry is misplaced.** Talabat `#FF5A00` against Careem `#00493E` survives red-green blindness fine (deutan ΔE 46.9, protan 28.7), because Careem's green is dark enough that lightness carries the difference when hue does not: `#A3A300` against `#3D3D3F`. That pairing was chosen well.

The pairs that actually break are the ones with similar lightness. `#C8B89B` sand and `#5FD0A3` mint are both mid-light, so once hue is removed they become `#BDBD9B` and `#B8B8A5`. Same for orange `#FF8C42` and gold `#F5B400`, which both land on olive.

---

## Does the same concept keep the same colour?

No. This is the second-biggest problem after the identical lines.

### Careem is drawn in four different greens

| Where | Colour |
|---|---|
| `--careem` token, Sales by Platform bars, Top 10 / Revenue bar tone A | `#00493E` |
| Pace card progress segment and bottom-bar dot | `#1BD15D` |
| Net Profit Kept bars | `rgba(63,209,122,0.8)` = `#65DA95` |
| Top 10 / Revenue highlight tone | `rgba(63,209,122,0.7)` = `#79DFA2` |

The Insights panel actually titled **"Careem"** uses none of them. Its series are `#C8B89B`, `#A1BEBA` and `#2E6E66`. There are six greens in the app in total, counting `#2E6E66` and `#5FD0A3`.

### Talabat is better but not clean

`#FF5A00` is used consistently where Talabat is a series. But three near-identical oranges carry three different meanings:

| Colour | Meaning |
|---|---|
| `#FF5A00` | Talabat |
| `rgba(255,90,0,0.75)` = `#FF8340` | The Commission Drag |
| `#FF8C42` | Paid ads (Insights) |

`#FF8340` and `#FF8C42` are **ΔE 2.9** apart, below the threshold most people notice at all. And the Insights panel titled "Talabat" uses no orange.

### Two colours carry five meanings each

- `#C8B89B`: 3-month average, After commission, Avg JOD/day, Customer promos, New customers.
- `#092727`: Monthly total, the unlabelled 4th line, Product margin, Net margin, Avg orders/day.

---

## Does any series colour mean something else in the app?

Yes.

**`#F5B400` is both the status gold and an ordinary series colour, on the same screen.** On the Overview card it renders the pace figure "36%", the platform percentages "43%" and "31%", and the "data through 6 Sept" staleness note. In the charts it is the stroke for "7-day avg", "Net margin %" and "Repeat rate %".

It is also **hardcoded, not a token**. The app has a `--warning` token, `#B8862A`, which no chart and no status text uses at all.

**`--accent` `#EEC36A` has the same split personality.** On Total sales over time it is a semantic event marker, the dot showing where the 3-month floor stepped up. On Units by category it is the ordinary bar fill for every category. And `#F5B400` against `#EEC36A` is **ΔE 8.4**, so the distinction between "status gold" and "accent gold" is invisible anyway.

### Contrast against the white card

WCAG 1.4.11 wants 3:1 for meaningful non-text graphics.

| Passing | Ratio | | Failing | Ratio |
|---|---|---|---|---|
| `#092727` | 15.78:1 | | `#FF8C42` | 2.31:1 |
| `#00493E` | 10.38:1 | | `#C8B89B` | 1.95:1 |
| `#2E6E66` | 5.93:1 | | `#5FD0A3` | 1.90:1 |
| `#5C6B6B` | 5.57:1 | | `#F5B400` | 1.84:1 |
| `#FF5A00` | 3.13:1 | | `#65DA95` | 1.75:1 |
| | | | `#EEC36A` | 1.66:1 |
| | | | `#79DFA2` | 1.63:1 |
| | | | `#F3D597` | 1.42:1 |

Eight of thirteen fail.

---

## At 390px

**Every colour, stroke width and dash pattern is byte-identical to desktop.** No palette change, no simplification. Every problem above is exactly as bad on a phone, and three get worse:

1. **Stacked bars get thin.** Promotions & ad spend segments go from **65px wide to 14px**. Careem 29 to 15. Talabat 27 to 13. Judging `#C8B89B` against `#5FD0A3` in a 14px sliver is harder than in a 65px block, and those two are already the colour-blindness collision.
2. **Minimum stacked segment height is 1px**, at both widths. A one-pixel band of colour carries no colour information at all.
3. **Legends wrap.** Margin over Time goes from 17px to 33px, Promotions from 19px to 34px. So on a phone the chart with two identical lines spends two lines of legend describing three series that render as two.

The one thing that improves: Sales by Platform drops to 2 series at All-Time on both widths, losing the gold average line and with it the Talabat/gold deuteranopia collision.

---

## Verdict: palette, or too many series?

Bluntly, neither. The charts are not wired to the design system.

**The palette is not the problem.** `#00493E`, `#2E6E66`, `#FF5A00`, `#092727`, `#5C6B6B` is a well-separated set, and the Talabat/Careem pairing in particular is a genuinely good choice that survives red-green blindness. There are enough colours.

**The series counts are not the problem either.** Ten of the twelve charts draw between one and four series, which any competent categorical palette handles. Only Promotions & ad spend, with five, is pushing it, and even there the failure is that two specific colours were placed adjacent, not that five is too many.

**The actual problem is that half the chart colours are raw hex literals sitting next to token references, and nothing enforces one meaning per colour.** The evidence:

- `var(--foreground)` and `var(--primary)` both resolve to `#092727`, and a chart uses both as if they were two series. Nothing caught it, because nothing knows those are supposed to differ.
- `#C8B89B`, `#F5B400`, `#ff8c42`, `#5fd0a3`, `#2E6E66` are hardcoded in chart props and are not in the token list at all. Sand means five things because nobody ever declared what sand means.
- Opacity is being used as a differentiator: `0.45`, `0.7`, `0.75`, `0.8`. That is what produces `#F3D597` next to `#EEC36A` and `#A1BEBA` next to `#C8B89B`. Alpha over white always lands in the pale zone that fails contrast and collapses under colour blindness, so it is the one technique guaranteed to produce this class of bug.

A wiring problem, fixable in an afternoon, not a redesign.

## What to change, in order

1. **Give "Net (after commission + promos)" its own colour.** It is the number that tells you what you actually keep, and it is currently drawn underneath "Product margin".
2. **Legend the fourth line on Total sales over time, or delete it.** An unexplained line in the same colour as a labelled one is worse than no line.
3. **Define `--series-1` through `--series-6` and ban raw hex in chart props.** Six declared, tested, colour-blind-safe values. That single change fixes the aliasing bug, the five-meanings-of-sand problem, and prevents the next one.
4. **Stop using alpha to make a second colour.** Pick a real second value. Units by category is the proof: 0.7 opacity gave ΔE 6.7 where the sibling chart's real second colour gave 53.7.
5. **Reserve `#F5B400` for status only.** Move the three "% rate" lines onto a series token. Either that, or accept gold as a series colour and stop using it for the pace figure, but not both.
6. **Pick one Careem green and one Talabat orange.** Use them for those platforms and nothing else. Right now the panel titled "Careem" contains no Careem green.
7. **Swap `#5FD0A3` for something clearly darker or lighter than `#C8B89B`.** They only need to differ in lightness, not hue, to survive deuteranopia.
8. **Add one non-colour signal to the multi-line charts.** Total sales over time already does this well with four dash patterns and four widths. Margin over Time and Order Volume Trend have none. Copying that pattern across costs nothing.

---

## Loose ends worth a separate look

- At "This Month", Sales by Platform renders no bars and an invisible average line. Empty axes and a legend.
- The Commission Drag renders a bar at 390px and nothing at 1440px.
- No chart anywhere uses data labels, so the legend is the only key.
