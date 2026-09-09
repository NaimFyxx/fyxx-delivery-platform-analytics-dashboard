# Platform colours: Talabat and Careem

Both platform brand colours split into a **fill** value and one or more **foreground** (text/accent)
values, because a single brand colour cannot be both the fill and readable text on every background.
The rule is simple:

> **Fills are the brand; text is a label.** Use the brand fill everywhere something is filled (bars,
> dots, segments, chips, the logo). For text and accents, pick the variant that clears contrast on the
> background the text actually sits on.

## The tokens

| Token | Value | Use |
|---|---|---|
| `--talabat` | `#FF5A00` | fills, any background |
| `--talabat-text` | `#993d00` | text on light backgrounds (white / cream cards) |
| `--talabat-dark-bg` | `#FF8A3D` | text and accents on dark surfaces (the dark insight panels) |
| `--careem` | `#00493E` | fills, and text on light backgrounds |
| `--careem-dark-bg` | `#00E784` | text and accents on dark surfaces |

Each is registered in `@theme inline` (so a `text-*` / `bg-*` utility exists) and defined in `:root` in
`src/styles.css`.

## Why each variant exists (measured)

- **`--talabat` `#FF5A00` as text on white is ~2.6:1**, unreadable. `--talabat-text` `#993d00` (the same
  value as `--series-3`) is ~6-7:1 on white/cream. Careem needs no light-text variant: `#00493E` on
  white is ~9:1, so `--careem` doubles as its own light-text colour.
- **On the dark insight panels**, the accent sits in a stat inset. `--careem` `#00493E` there is ~2.6:1
  (dark on dark) and `--talabat` `#FF5A00` is ~2.8-4.6:1. The dark-surface variants fix this:
  `--careem-dark-bg` `#00E784` reads ~8:1 and `--talabat-dark-bg` `#FF8A3D` reads ~6:1 on a dark inset.
- `--careem-dark-bg` `#00E784` is an official Careem colour (Pantone 7479C). `--talabat-dark-bg`
  `#FF8A3D` is a lifted amber-orange with no official equivalent, but it stays in the Talabat orange
  family and is used only where the brand `#FF5A00` would be unreadable.

Note the dark-panel stat inset must itself be **dark** (`bg-black/20`, not a cream `bg-background/40`
veil) for the dark-surface variants to land on a dark background. A light veil over a dark panel
composites to a sage/tan mid-tone where no brand colour clears the floor.

## Why this file exists

Three consecutive audits each found the **same class of bug in a new place**: a light-background colour
used where the background was actually dark (or a dark-background colour used on light). The Careem+
panel in particular survived every audit because those panels are usually empty, so the low-contrast
text was never on screen during a visual check. When adding a platform-coloured element, decide fill vs
text first, then pick the token for the real background. Do not reach for the bare `--talabat` /
`--careem` fill token as text without checking the surface.
