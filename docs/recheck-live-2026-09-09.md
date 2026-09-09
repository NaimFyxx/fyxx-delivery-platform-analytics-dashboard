# Fyxx / TGR Delivery Dashboard: four-item re-run on the live build

**Site:** https://fyxx-dash-magic.lovable.app
**Date:** 9 September 2026
**Session:** signed in as admin
**Width:** 390 x 844 with mobile device emulation confirmed active
**Scope:** re-run of four items only, after the previous check ran against a stale deploy. Page was hard-reloaded before measuring.

Read only. No credentials, no imports, no saves. The pace expand/collapse and the Filters toggle were used (view state only) and everything was left as found: pace collapsed, filters closed, range on This Month.

---

## Correction to my earlier reports

My contrast helper was mis-parsing `oklab()` colours. It read the three oklab components as if they were RGB channels and returned a near-black value, so any element declared in `oklab()` came back with a false contrast figure.

Plain `rgb()` and hex values were unaffected, so the large majority of numbers in my previous reports stand. The exception is the info icons, which are the only `oklab()` values in play on this dashboard.

Everything in this report was re-measured by **rasterising the composited pixel to canvas**, which handles `oklab()`, `color-mix()`, relative colour syntax and alpha correctly.

| Element | I previously reported | True value |
|---|---|---|
| Pace bar ⓘ, before the fix | 1.20:1 / 1.25:1 | **1.64:1** |
| Pace bar ⓘ, now | (not measured correctly) | **8.32:1** |
| Overview card ⓘ on grey pill | 3.00:1 | **1.38:1** |
| Overview card ⓘ on white | 3.99:1 | **2.09:1** |

The direction of the pace-bar finding was right; the magnitude was not. The card icons are worse than I said, not better. See "New" at the end.

---

## Results at a glance

| # | Item | Result | Measurement |
|---|---|---|---|
| 1a | Nav width and visible tabs | **PASS** | 390px, 4 tabs fully visible |
| 1b | Data entry reachable, fade reads | **PASS** | x=394, scrollWidth 506, 24px fade |
| 1c | Header chrome | **FAIL** | **142px, up from 122px** |
| 2 | Three action buttons, Filters closed | **PASS** | all three 44px tall, all visible |
| 3 | Pace bar info icons | **PASS** | #B5BEBE at **8.32:1**, was 1.64:1 |
| 4 | Orphan dot and empty axis | **PASS** | no mark, no legend entry, no second axis |

---

# 1. Nav width and visible tabs

## 1a. Nav strip. PASS

The logo is gone from mobile and the nav strip now spans the full viewport width.

| | Before | Now | Target |
|---|---|---|---|
| Nav clientWidth | 283 | **390** | 390 |
| Nav scrollWidth | 490 | 506 | |
| Fully visible tabs | 2 | **4** | 4 |

| Link | x to right | Fully visible |
|---|---|---|
| Overview | 8 to 105 | yes |
| Insights | 109 to 195 | yes |
| Financials | 199 to 298 | yes |
| Items | 302 to 377 | yes |
| Data entry | 394 to 498 | no, scrolls into view |

Zero TGR logos on mobile. Sign out sits in its own row above the tabs (`flex items-center justify-end px-2 py-0.5`), 32px tall, button 81 x 28 at x=301.

## 1b. Data entry and the fade. PASS

Data entry starts at x=394, 4px past the edge, and the strip scrolls (scrollWidth 506 into clientWidth 390).

The fade is present at x=366 to 390, 24px wide:

```
pointer-events-none absolute right-0 top-0 bottom-0 w-6
bg-gradient-to-l from-sidebar to-transparent
```

Computed: `linear-gradient(to left, rgb(9,39,39) 0%, transparent 100%)`. It reads clearly as "more to the right" and does not block taps.

## 1c. Header chrome went UP, not down. FAIL

| Block | y range | Height |
|---|---|---|
| Sign out row | 0 to 32 | 32px |
| Nav row | 32 to 68 | 36px |
| Border | 68 to 69 | 1px |
| Sub-header ("2 months to review", stale badge) | 69 to 117 | 48px |
| Gap | 117 to 142 | 25px |
| **First filter control ("This Month") at y=142** | | |

**122px to 142px. A 20px regression.**

The sticky header grew from 49px to 69px because Sign out was given its own full-width row instead of sitting inline. That row is 32px tall to hold one 28px button, and the other 309px of it are empty.

The nav fix is right and worth keeping. The Sign out row is what costs you. Putting Sign out back inline at the right end of the nav row, after the fade, gets you to roughly 110px and still leaves four tabs visible: the button needs about 85px and the tabs currently end at x=377 with Items.

---

# 2. The three action buttons. PASS

All measured with the Filters control **closed** (`aria-expanded="false"`, label "Filters · this month"):

| Button | Page | Size | Position |
|---|---|---|---|
| Add product | Items | 122 x 44 | x=24, y=250 |
| Merge item | Items | 117 x 44 | x=154, y=250 |
| Export CSV | Financials | 118 x 44 | x=24, y=250 |

All three render outside the Filters panel, all at 44px tall, all above the fold. The 0 x 0 entries still present in the DOM are the `md:` desktop variants, correctly hidden at this width.

---

# 3. Pace bar info icons. PASS

Expanded pace bar, all three icons:

| Icon | Declared colour | Rasterised | Background | Contrast |
|---|---|---|---|---|
| ⓘ 11.5px | `oklab(0.999994 … / 0.7)` | `#B5BEBE` | `#092727` | **8.32:1** |
| ⓘ 16px | `oklab(0.999994 … / 0.7)` | `#B5BEBE` | `#092727` | **8.32:1** |
| ⓘ 11.5px | `oklab(0.999994 … / 0.7)` | `#B5BEBE` | `#092727` | **8.32:1** |

The previous token was `oklab(0.515281 -0.0173611 -0.00517327 / 0.5)`, which rasterises to `#324949` on that bar = **1.64:1**.

The fix is real. 8.32:1 is just under the "roughly 9:1" target and comfortably above the 4.5:1 floor.

---

# 4. The orphan dot. PASS

Insights at This Month:

| Chart | Legend | Line curves | Dots (any) | Y axes |
|---|---|---|---|---|
| Promotions & ad spend | Customer promos, Paid ads, Promo sharing, Loyalty subsidy | 0 | **0** | 1 (0, 4, 8, 12, 16) |
| Careem | New, Returning | 0 | **0** | 1 (0, 2, 4, 6, 8) |
| Talabat | New, Returning | 0 | **0** | 1 (0, 0.75, 1.5, 2.25, 3) |

No mark, no legend entry, and exactly one y-axis per chart. The empty right-hand percentage axis (0%, 25%, 50%, 75%, 100%) that used to sit alongside is gone from all three.

---

# New

## Nothing new is broken

I swept the new sticky header for contrast and tap targets and found nothing under threshold once the oklab parsing was fixed.

Sign out is `oklab(0.953803 … / 0.8)`, rasterising to `#C4C6C0` on `#092727` = **9.15:1** at 12px. I nearly reported that as a 1.28:1 failure; it is fine.

The nav still sticks correctly on the taller pages: header `top: 0` at scrollY 0, 600 and 2000 on Insights. The gear still clears the collapsed bar by 24px.

## The Overview pace CARD icons were missed by the fix

The pace **bar** icons were moved to the brighter token. The pace **card** icons on Overview were not. They are still on the old `oklab(0.515281 … / 0.5)`.

| Location | Rasterised | Background | Contrast | Count |
|---|---|---|---|---|
| Card icons on grey pills, 12px | `#7A8282` | `#999999` | **1.38:1** | 2 |
| Card icons on white, 11 to 16px | `#ADB5B5` | `#FFFFFF` | **2.09:1** | 3 |

Five icons on the expanded card. The two sitting on grey pills at 1.38:1 are effectively invisible, and this is now the lowest contrast anywhere on the dashboard.

Same fix, applied in one place and not the other. It should be the same one-line token swap.

---

# Summary

Three of four items pass on the live build, and the two that mattered most (the nav and the buried action buttons) are properly fixed.

The one failure is self-inflicted: the nav went from 283px to a full 390px and recovered two tabs, which is exactly right, but Sign out was moved into a dedicated 32px row and gave back 20px of vertical space in the process. Net, you are 20px worse off than before the change while the nav is better.

## Suggested next steps

1. **Move Sign out inline onto the nav row**, right-aligned after the fade. Recovers the 32px row, keeps four tabs visible, lands header chrome near 110px.
2. **Swap the Overview pace card info icons** to the same bright token the bar icons now use. Five icons, two of them at 1.38:1.
3. **Optional, for the remaining 48px:** the sub-header holds only "2 months to review" and the stale badge. Both would fit on the nav row or in the page body above the filters.
