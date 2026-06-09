## TGR Rebrand Plan

Awaiting the zip of TGR logo variations before implementing. Once uploaded I'll extract it and pick the right variant for each surface (dark logo on cream backgrounds, light logo if any dark surfaces remain).

### 1. Brand colors (light theme flip)
Rewrite the palette in `src/styles.css`:
- `--background: #f4efe7` (cream)
- `--foreground: #092727` (deep teal)
- `--card`, `--popover`: pure white or a slightly warmer cream tint of #f4efe7
- `--sidebar`: #092727 with cream foreground (keeps sidebar as a brand anchor)
- `--border`, `--input`, `--muted`: soft warm grays derived from cream
- Keep gold `#EEC36A` as the accent/primary (still works on both cream and teal)
- Keep Talabat orange and Careem green as platform brand colors
- Add `color-scheme: light` on `:root`, remove `.dark` reliance
- Update gradient/shadow tokens for the lighter surface

Save the brand colors as a project memory at `mem://design/brand-colors`.

### 2. Replace Fyxx logos with TGR
- **Sidebar** (`src/routes/_authenticated/route.tsx`): replace the "Fyxx." wordmark in both desktop and mobile headers with the TGR logo image (`h-8 w-auto`).
- **Auth page** (`src/routes/auth.tsx`): replace the two "Fyxx." wordmarks with the TGR logo.
- **Dashboard hero** (`src/routes/dashboard.tsx` line 447): swap `fyxx-logo-white.svg` for the TGR logo variant that suits the new background.
- **Meta titles** in route `head()` blocks and `__root.tsx`: change "Fyxx Delivery Tracker" → "TGR Delivery Tracker", and `· Fyxx` suffixes → `· TGR`.

### 3. Subtle "TGR × Fyxx" credit
- **Sidebar footer** (`route.tsx`): small muted line above the sign-out button reading `TGR × Fyxx` with the Fyxx wordmark inline.
- **Auth page footer** (`auth.tsx`): replace `© Fyxx Delivery Tracker` with `TGR × Fyxx` line in muted text.

### 4. Cleanup
- Keep `src/assets/fyxx-logo-white.svg` (still referenced in the credit line); delete `fyxx-logo-black.svg` only if unused after edits.
- Internal module names (`@/lib/fyxx`, `@/components/fyxx/...`) stay as-is — they're internal paths the user never sees, and renaming them is high-churn for no UX gain.

### What I need from you
Upload the zip of TGR logo variations (drag-and-drop or use + → Attach in chat). Once received I'll extract, pick the right variants, and apply everything above in one pass.