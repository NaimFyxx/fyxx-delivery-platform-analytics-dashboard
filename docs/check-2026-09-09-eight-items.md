# Fyxx / TGR Delivery Dashboard: eight-item check

**Site:** https://fyxx-dash-magic.lovable.app
**Date:** 9 September 2026
**Session:** signed in as admin
**Widths:** 390 x 844 with mobile device emulation, and 1440 x 900 where noted

Read only. No credentials entered, no imports run, no saves, no deletes. The pace expand/collapse, the Filters toggle and the range chips were used (view state only). State left as found: This Month, pace collapsed.

---

## Results at a glance

| # | Item | Result | Measurement |
|---|---|---|---|
| 1 | Pace card structure | **PASS** with 3 notes | 101px / 360px |
| 2 | Header chrome, Sign out in nav | **PASS** | 114px, 4 tabs visible |
| 3 | Info icons Overview + Items | **PASS** | #5C6B6B on white, **5.57:1** |
| 4 | Six previously-failing text items | **PASS** (5 of 6), 1 adjacent partial | 4.87 to 5.57:1 |
| 5 | Commission Drag centred | **PASS** both widths | gaps 22/18 and 113/108 |
| 6 | Both progress labels white | **FAIL** | labels no longer exist |
| 7 | Talabat text #993d00, fill #FF5A00 | **PASS** (3 of 4 places) | 6.07 to 6.95:1 |
| 8 | Insights panel accents | **PASS** | 8.76 to 6.34, and 6.33 to 4.65 |

---

# 1. Pace card. PASS on structure and both heights

| State | Height | Expected |
|---|---|---|
| Collapsed | **101px** | ~101 |
| Expanded | **360px** | ~361 |

Collapsed reads "September 2026 / 36% / 120% of pace" with a full-width "Show details" button (324 x 33 at x=33).

Expanded gives exactly the specified structure:

```
September 2026  ⓘ
Day 9 of 30 · 8 working days · data through 6 Sept
Sold so far     361 JOD
Base target     1,000 JOD
Stretch         1,150 JOD
Against pace    120%
------- divider -------
Careem   178 / 410   43%
Talabat  183 / 590   31%
Show August
Hide details
```

The button label flips to "Hide details", `aria-expanded` goes true, and the aria-label becomes "Hide pace details". Same x, same width, same height in both states.

**No chips on the card: PASS.** Zero elements with a rounded background or border, verified by scanning for border-radius ≥ 8px combined with a visible background or border. The old "120% of pace" pill is now plain text.

**One grey meta line: PASS.** Day count, working days and data-through are on a single line.

**Exactly one info icon: PASS** when expanded. It is zero when collapsed, which I assume is intended.

**"Show August" still reachable: PASS.** 69 x 18 at y=524 inside the expanded card.

### Three notes

- The button "sits in exactly the same position" only relative to the card. Its absolute y moves from **296 to 555**, a 259px drop, because the table grows above it. Unavoidable given it is the last element, but worth saying since the wording was "exactly".
- The button is **33px tall**, not 44.
- "Show August" is only **18px tall**.
- "data through 6 Sept" inside the grey meta line is `#B8862A` on white = **3.24:1** at 11px. The rest of the line is `#5C6B6B` at 5.57:1. The gold half fails.

---

# 2. Header chrome. PASS

**114px**, target ~112.

| Block | y range | Height |
|---|---|---|
| Nav strip (single row, `sticky top-0`) | 0 to 41 | 41px |
| Sub-header ("2 months to review", stale badge) | 41 to 89 | 48px |
| Gap | 89 to 114 | 25px |
| **First filter control at y=114** | | |

Sign out is now the last item on the nav scroll track at x=515 to 596 (scrollWidth 604, clientWidth 390). Its own row is gone.

| Link | x to right | Fully visible |
|---|---|---|
| Overview | 8 to 105 | yes |
| Insights | 109 to 195 | yes |
| Financials | 199 to 298 | yes |
| Items | 302 to 377 | yes |
| Data entry | 394 to 498 | scrolls into view |
| Sign out | 515 to 596 | scrolls into view |

Four tabs fully visible, as specified.

---

# 3. Info icons. PASS

| Page | Count | Colour | Background | Contrast |
|---|---|---|---|---|
| Overview | 13 | `#5C6B6B` | `#FFFFFF` | **5.57:1** |
| Items | 7 | `#5C6B6B` | `#FFFFFF` | **5.57:1** |

Every icon on both pages is the same value, up from 2.09:1. Target was ~5.6. Exact.

---

# 4. The six text items. Five clean, one adjacent partial

| Item | Where | Colour | Background | Contrast | Result |
|---|---|---|---|---|---|
| CSV import hints | /import data-health lines | `#5C6B6B` | `#F4EFE7` | **4.87:1** | PASS |
| Items row action hints | "avg JOD 4.50" | `#5C6B6B` | `#FFFFFF` | **5.57:1** | PASS |
| Data entry auto-fill labels | "auto · 0" | `#5C6B6B` | `#FFFFFF` | **5.57:1** | PASS |
| Data entry auto-fill labels | "Fill 0s to today" | `#BB4D00` | `#FFFFFF` | **5.03:1** | PASS |
| Sign-in subtitle | /auth "Sign in to your dashboard." | `#5C6B6B` | `#FFFFFF` | **5.57:1** | PASS |
| Chart card footnote | "Careem shown on food-basket basis…" | `#5C6B6B` | `#FFFFFF` | **5.57:1** | PASS |
| Popover example line | "Gross 305, exVAT 263, COGS 95 → …" | `#5C6B6B` | `#FFFFFF` | **5.57:1** | PASS |

**Adjacent partial:** on /auth the inactive tab "Create account" is `#5C6B6B` on `#ECE5D8` = **4.45:1**. Five hundredths under, and not one of your six.

---

# 5. Commission Drag centred. PASS at both widths

| Width | Card | Content span | Top gap | Bottom gap |
|---|---|---|---|---|
| 390 | 358 x 153 | 2894 to 3007 | 22px | 18px |
| 1440 | 555 x 316 | 2126 to 2221 | 113px | 108px |

`display: flex; justify-content: center` in both. At desktop the card is exactly the same 555 x 316 as the chart card beside it, and the content sits centred within 5px. No empty box below.

---

# 6. Progress segment labels. FAIL, but not the way you think

Neither label is white, because **neither label exists any more.** The progress track is now:

```html
<div class="relative h-2.5 rounded-md mt-3 bg-muted">
  <div class="absolute inset-y-0 left-0 flex overflow-hidden rounded-md" style="width: 31.3696%">
    <div class="h-full" style="width: 49.2169%; background: var(--careem)"></div>
    <div class="h-full flex-1" style="background: var(--talabat)"></div>
  </div>
  <div class="absolute -top-1 -bottom-1 w-0.5 rounded-sm"
       style="left: 86.9565%; background: var(--muted-foreground)"></div>
</div>
```

Two bare divs, `#00493E` (50px) and `#FF5A00` (52px), plus a pace marker at 87%. **Zero text nodes anywhere in the track.**

Honestly this is the better outcome. Printing 9px text inside a 10px-tall bar was never going to work, and the per-platform percentages now live in the table rows below at readable size. But it does not match "both labels should be white", so it is marked FAIL against the stated expectation rather than quietly passed. If removing them was the actual decision, say so and this stops being tested.

---

# 7. Talabat as text versus fill. PASS in three of four places

## As text, on light backgrounds

| Location | Colour | Background | Contrast |
|---|---|---|---|
| Items platform badges | `#993D00` | `#FFFFFF` | **6.95:1** |
| Import coverage group header | `#993D00` | `#FFFFFF` | **6.95:1** |
| Dashboard all-time line | `#993D00` | `#F4EFE7` | **6.07:1** |

All three use the new token. The all-time line reads 6.07 rather than ~7 only because it sits on cream rather than white.

## The fourth is not orange at all

The Items **column header** "Talabat sell price" is `#5C6B6B` grey at 5.57:1, the same as every other column header. Defensible as a neutral table header, but it is not `#993d00`, so if you expected it recoloured, it was not.

## As fill: PASS

`#FF5A00` intact on the pace card progress segment, the platform dots, and the Items badge backing. Careem's fill is `#00493E`.

---

# 8. Insights panels. PASS

Both panels are now a coloured gradient with `bg-black/20 border border-white/10` insets. The cream veil is gone.

## Careem+ vs Regular

Panel: `linear-gradient(135deg, #0A3D2B, #0F5C3E)`. Accent: `#00E784`.

| Sample point | Inset base | Contrast |
|---|---|---|
| Dark end of gradient | `#083022` | **8.76:1** |
| Light end of gradient | `#0C4931` | **6.34:1** |

Expected ~8.3. The accent appears both as the 391 x 8 progress fill and as the "6 75.0%" figure at 18px.

## Talabat Pro

Panel: `linear-gradient(135deg, #5C1F00, #8A2F00)`. Accent: `#FF8A3D`.

| Sample point | Inset base | Contrast |
|---|---|---|
| Dark end of gradient | `#491800` | **6.33:1** |
| Light end of gradient | `#6E2500` | **4.65:1** |

Expected ~6.1. The range had to be switched to All-Time to make this panel render data, since at This Month there are no Pro orders. Range was set back afterwards.

Both are in band. Worth knowing that the figure moves by 2.4 and 1.7 points across the gradient, so a single quoted number understates the worst case.

---

# New and broken

## 1. The Talabat Pro empty state is unreadable

At This Month the panel shows "No Pro orders in this range. This panel is built from the Talabat Order Report…" in `#5C6B6B` **on the dark orange gradient**:

| Sample point | Contrast |
|---|---|
| Dark stop `#5C1F00` | **2.28:1** |
| Light stop `#8A2F00` | **1.52:1** |

Dark grey body text on a dark orange panel. It is a five-line paragraph and it is the only content in the panel at that range, so on the default view the whole panel reads as a blank orange box.

This is the worst thing on the dashboard right now, and it is new: the panel used to be cream, where that grey was fine. The gradient change did not carry the body text with it.

## 2. The import page status pills fail

On /import at desktop, all at 10px:

| Text | Colour | Background | Contrast |
|---|---|---|---|
| "In progress" | `#E17100` | `#FEF4E5` | **2.94:1** |
| "In progress" (on cream rows) | `#E17100` | `#F2EADB` | **2.68:1** |
| "Complete" | `#1F8A4C` | `#DEEEE4` | **3.64:1** |
| "-" (n/a cells) | `#5C6B6B` | `#DCDAD3` | **3.98:1** |
| Step badge "4" (inactive) | `#5C6B6B` | `#ECE5D8` | 4.45:1 |

These are the status column of a twelve-row table, so they are the main thing you read on that page.

## 3. The same amber fails on Data entry, and uses the wrong platform colour

"Careem · 3 days behind ⚠" is `#E17100` on white = **3.20:1** at 12px.

Two problems in one: it fails contrast, and it paints **"Careem" in orange**, which is Talabat's colour everywhere else in the app. You just spent a release making Talabat orange and Careem green. This line undoes it.

## 4. The stale banner sits one hundredth under

`#C43D3D` on `#F4EFE7` = **4.49:1** at 11px, on every page. A hair darker and it clears.

## 5. The banner close button

"×" is `#677773` on `#092727` = **3.35:1**.

## 6. CSV import is now desktop-only

At 390 the page renders only: "CSV import — This page is available on desktop. Open the dashboard on a larger screen to use it."

The import hints could not be tested at phone width because of it. If the gate is deliberate, fine, but it is new since the last check and it means an admin cannot import from a phone at all.

---

# Two corrections to my own method

Two false failures were caught before reporting this run.

**First: the background walker started at `parentElement`,** so any element carrying its own background was measured against the wrong colour. That produced a false 1.22:1 on the import step badge, which actually has `background: rgb(9,39,39)` under cream text and reads at 13.78:1.

**Second: it ignored `background-image`.** That produced a false 1.14:1 on the /auth Sign in button, which actually has `linear-gradient(135deg, #092727, #143838)` under cream text and reads around 12.4:1.

Both are fixed. Every number in this report is from the corrected version: rasterised from composited pixels, including each element's own background and gradient stops.

Combined with the `oklab()` parsing bug found in the previous session, the contrast helper has now been wrong in three distinct ways across this project. The current method is the one that should have been used from the first audit.

---

# Summary

Seven of eight items pass. The pace card rebuild, the header, the info icons, the six text fixes, the Commission Drag centring and both Insights panels all landed on the measurements given.

The one FAIL is item 6, and it is a specification mismatch rather than a defect: the progress labels were deleted instead of recoloured, which is probably the right call but is not what was asked for.

The pattern in what is newly broken is the same one as last time. Three of the six new issues are **a background changed and the text on it did not follow**: the Talabat Pro panel going from cream to dark orange while its body copy stayed grey, the import status pills on tinted backgrounds, and the Data entry amber. Worth a sweep of anything that got a new background colour this release.

## Suggested order

1. **Talabat Pro empty state.** Change the paragraph to the same muted cream the panel's subtitle uses (`#BEA599`, currently 4.04 to 5.47:1). One line, and it fixes the worst-reading thing in the app.
2. **The `#E17100` amber**, everywhere. It fails at 2.68 to 3.20:1 in three places, and on Data entry it is also the wrong platform colour.
3. **Import status pills**, "Complete" and "In progress" and the n/a dashes.
4. **Nudge the stale banner** past 4.5:1.
5. **Decide about the progress labels** so item 6 stops appearing on these lists.
6. **Optional:** grow the "Show details" button from 33px and "Show August" from 18px toward 44px.
