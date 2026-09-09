# Platform colours: Talabat and Careem

Both platform brand colours split into a **fill** value and one or more **foreground** (text/accent)
values, because a single brand colour cannot be both the fill and readable text on every background.
The rule is simple:

> **Fills are the brand; text is a label.** Use the brand fill everywhere something is filled (bars,
> dots, segments, chips, the logo). For text and accents, pick the variant that clears contrast on the
> background the text actually sits on.

## The tokens

| Token | Value | Use | Provenance |
|---|---|---|---|
| `--talabat` | `#FF5A00` | fills, any background | Talabat brand orange (official) |
| `--talabat-text` | `#993d00` | text on light backgrounds (white / cream cards) | **INVENTED** (darkened `#FF5A00`) |
| `--talabat-dark-bg` | `#FF8A3D` | text and accents on dark surfaces (the dark insight panels) | **INVENTED** (lifted `#FF5A00`) |
| `--careem` | `#00493E` | fills, and text on light backgrounds | Careem Forest Green, Pantone 560C (official) |
| `--careem-dark-bg` | `#00E784` | text and accents on dark surfaces | Careem Green, Pantone 7479C (official, partner guidelines) |

Each is registered in `@theme inline` (so a `text-*` / `bg-*` utility exists) and defined in `:root` in
`src/styles.css`.

**On provenance.** The two Careem values are both official Careem colours from Careem's partner
guidelines (Pantone 560C and 7479C), so on a dark surface Careem is still rendered in a real Careem
colour. The two Talabat variants are **invented**: Talabat publishes only the one orange (`#FF5A00`),
so `--talabat-text` and `--talabat-dark-bg` are derived by darkening / lifting it for legibility, not
sanctioned brand values. **If Talabat ever publishes an official secondary orange, replace
`--talabat-dark-bg` (and reconsider `--talabat-text`) with it.** Both are used only where the brand
`#FF5A00` would be unreadable, so the official orange still appears everywhere it can.

## Reserved: off-limits for chart series colours

A chart series colour must not be, or read as, a brand or status token, or a "different" series ends up
meaning the same thing as a platform. These six values are reserved:

| Reserved token | Value |
|---|---|
| `--careem` | `#00493E` |
| `--talabat` | `#FF5A00` |
| `--talabat-text` | `#993D00` |
| `--careem-dark-bg` | `#00E784` |
| `--talabat-dark-bg` | `#FF8A3D` |
| `--warning-text` | `#8A5900` |

**Any new or changed `--series-*` token must be checked against this list:** at least ΔE2000 20 from
every one of them in normal vision, at least 3:1 on white, and it must keep the palette worst-pair at or
above normal 26.4 / deuteranopia 23.8. Use the colour math in `scratchpad/color.mjs` (CIEDE2000 plus a
Viénot deuteranopia simulation) before adding a series token.

This list is exactly why `--series-3` moved from `#993d00` (identical to `--talabat-text`, ΔE 0) to
`#7c0020`, and `--series-4` from `#17826d` (ΔE 19 from `--careem`, so it read as Careem on a chart) to
`#008770` (ΔE 20.8 from Careem). Both moves also lifted the palette's deuteranopia worst-pair from 21.0
to 23.8.

## Why each variant exists (measured)

- **`--talabat` `#FF5A00` as text on white is ~2.6:1**, unreadable. `--talabat-text` `#993d00` is
  ~6-7:1 on white/cream. Careem needs no light-text variant: `#00493E` on white is ~9:1, so `--careem`
  doubles as its own light-text colour.
- **On the dark insight panels**, the accent sits in a stat inset. `--careem` `#00493E` there is ~2.6:1
  (dark on dark) and `--talabat` `#FF5A00` is ~2.8-4.6:1. The dark-surface variants fix this:
  `--careem-dark-bg` `#00E784` reads ~8:1 and `--talabat-dark-bg` `#FF8A3D` reads ~6:1 on a dark inset.

Note the dark-panel stat inset must itself be **dark** (`bg-black/20`, not a cream `bg-background/40`
veil) for the dark-surface variants to land on a dark background. A light veil over a dark panel
composites to a sage/tan mid-tone where no brand colour clears the floor.

**Always measure the composited pixel, not the declared background.** A semi-transparent overlay
(`bg-background/40`, `bg-white/5`, `bg-black/20`, any `/NN`) composites with whatever is behind it, so
the colour a foreground actually sits on is not the value written in the CSS. Here the inset declared a
dark panel but rendered as a sage/tan mid-tone, which inverted the fix: pointing the Careem accent at
`--careem-dark-bg` on the *declared* dark background would have taken it from ~2.6:1 to ~2.4:1 (worse),
not to ~8:1. Rasterise the element and sample the pixel (or composite the layers by hand) before
trusting a contrast number over any translucent surface.

## Why this file exists

Three consecutive audits each found the **same class of bug in a new place**: a light-background colour
used where the background was actually dark (or a dark-background colour used on light). The Careem+
panel in particular survived every audit because those panels are usually empty, so the low-contrast
text was never on screen during a visual check. When adding a platform-coloured element, decide fill vs
text first, then pick the token for the real background. Do not reach for the bare `--talabat` /
`--careem` fill token as text without checking the surface.
