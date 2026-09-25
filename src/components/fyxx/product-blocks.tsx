/**
 * Product performance blocks for Insights: the top items as photo tiles ("grid") or ranked
 * "rows". Photos are Shopify catalogue shots (atmospheric, not cutouts), so they are centre-cropped
 * via the Shopify CDN rather than squashed. Items with no photo (every delivery-only combo) fall
 * back to a category icon on a cream square, and a broken photo URL swaps to the same icon on error,
 * so a tile is never an empty box.
 *
 * Pure display. All figures come from the caller (the existing aggregateItems path); this file does
 * no calculation.
 */
import { useState } from "react";

export interface BlockItem {
  name: string;
  revenue: number;
  units: number;
  category: string;
  /** Shopify photo URL (already carries a ?v=... query string), or null to use the category icon. */
  photoUrl: string | null;
}

/**
 * Append Shopify CDN sizing to a photo URL. The stored URL already has a ?v=... query string, so we
 * append with & (not ?) and centre-crop to a square. Request roughly twice the rendered size for
 * retina; never the full image scaled in CSS.
 */
export function sizedPhotoUrl(url: string, px: number): string {
  return `${url}&width=${px}&height=${px}&crop=center`;
}

/** Series-token tint per category (icon uses currentColor). Falls back to muted for anything else. */
const CATEGORY_COLOR: Record<string, string> = {
  Combos: "var(--series-6)",
  Sandos: "var(--series-3)",
  Mazmez: "var(--series-2)",
  Salads: "var(--series-4)",
  "Charcoal Grills": "var(--series-3)",
  Deli: "var(--series-5)",
  Desserts: "var(--series-6)",
  Beverages: "var(--series-5)",
};
const categoryColor = (category: string): string => CATEGORY_COLOR[category] ?? "var(--muted-foreground)";

/** One simple inline icon per category (no icon library), drawn with currentColor. */
function CategoryIcon({ category }: { category: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { width: "45%", height: "45%" },
    "aria-hidden": true,
  };
  switch (category) {
    case "Combos": // takeaway box
      return (
        <svg {...common}>
          <path d="M4 8h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
          <path d="M4 8l2-4h12l2 4" />
          <path d="M12 4v4" />
        </svg>
      );
    case "Sandos": // burger
      return (
        <svg {...common}>
          <path d="M4 9c0-3 3.6-4.5 8-4.5S20 6 20 9" />
          <path d="M4 13h16" />
          <rect x="4" y="15.5" width="16" height="3.5" rx="1.75" />
        </svg>
      );
    case "Mazmez": // mezze bowl
      return (
        <svg {...common}>
          <path d="M3 11h18" />
          <path d="M4.5 11a7.5 7.5 0 0 0 15 0" />
          <path d="M12 4.5v3" />
        </svg>
      );
    case "Salads": // leaf
      return (
        <svg {...common}>
          <path d="M11 20A7 7 0 0 1 4 13c0-4.5 3.5-8.5 9.5-9 1 5.5-1 13-2.5 16z" />
          <path d="M8.5 15.5c1.2-2 3.2-4 5.5-5.2" />
        </svg>
      );
    case "Charcoal Grills": // flame
      return (
        <svg {...common}>
          <path d="M12 3c1.2 3.2 4 4.2 4 8a4 4 0 0 1-8 0c0-2 .8-3.2 2-4.2.5 1.2 1 1.8 2 2.2.6-2-.6-4 0-6z" />
        </svg>
      );
    case "Deli": // cheese wedge
      return (
        <svg {...common}>
          <path d="M4 16.5l14-7 3 5-14 7z" />
          <circle cx="9" cy="14.5" r="0.6" />
          <circle cx="13" cy="13" r="0.6" />
        </svg>
      );
    case "Desserts": // cupcake
      return (
        <svg {...common}>
          <path d="M6.5 11h11l-1.5 8h-8z" />
          <path d="M6.5 11a5.5 5.5 0 0 1 11 0" />
          <path d="M12 3.5v2.5" />
        </svg>
      );
    case "Beverages": // cup with straw
      return (
        <svg {...common}>
          <path d="M7 8h10l-1 11H8z" />
          <path d="M9.5 4l1.5 4M14.5 4l-1.5 4" />
        </svg>
      );
    default: // plate (uncategorised)
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
      );
  }
}

/**
 * The square image (or icon fallback). `cdn` is the pixel size requested from the CDN (roughly 2x the
 * rendered box). `boxClass` sizes the box in the layout. onError swaps to the icon.
 */
function ProductPhoto({
  item,
  cdn,
  boxClass,
}: {
  item: BlockItem;
  cdn: number;
  boxClass: string;
}) {
  const [failed, setFailed] = useState(false);
  if (item.photoUrl && !failed) {
    return (
      <img
        src={sizedPhotoUrl(item.photoUrl, cdn)}
        alt={item.name}
        width={cdn}
        height={cdn}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${boxClass} object-cover`}
        style={{ backgroundColor: "var(--muted)" }}
      />
    );
  }
  return (
    <div
      className={`${boxClass} grid place-items-center`}
      style={{ backgroundColor: "var(--muted)", color: categoryColor(item.category) }}
    >
      <CategoryIcon category={item.category} />
    </div>
  );
}

const jod0 = (n: number) => Math.round(n).toLocaleString();

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--muted)" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--series-1)" }} />
    </div>
  );
}

/**
 * Ten items, one shape. `metric` decides the headline: revenue (JOD) when any revenue is imported,
 * otherwise units, matching the ranking. The bar is scaled against the top item's same metric.
 */
export function ProductBlocks({
  items,
  mode,
  metric,
}: {
  items: BlockItem[];
  mode: "grid" | "rows";
  metric: "revenue" | "units";
}) {
  const valOf = (it: BlockItem) => (metric === "revenue" ? it.revenue : it.units);
  const max = items.length ? Math.max(valOf(items[0]), 1) : 1;
  const headline = (it: BlockItem) => (metric === "revenue" ? jod0(it.revenue) : it.units.toLocaleString());
  const secondary = (it: BlockItem) => (metric === "revenue" ? `${it.units.toLocaleString()} sold` : "units sold");

  if (mode === "rows") {
    return (
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <div key={it.name} className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-background border border-border">
            <div className="font-display text-[15px] text-muted-foreground w-5 text-right shrink-0">{i + 1}</div>
            <ProductPhoto item={it} cdn={120} boxClass="w-[46px] h-[46px] rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13px] mb-1.5 truncate">{it.name}</div>
              <Bar pct={(valOf(it) / max) * 100} />
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-[19px] leading-none">
                {headline(it)}
                {metric === "revenue" && <span className="text-[11px] text-muted-foreground"> JOD</span>}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">{secondary(it)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // grid: responsive tiles ~180px min; the top item takes a double-width tile.
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
      {items.map((it, i) => (
        <div
          key={it.name}
          className="rounded-2xl p-3 flex flex-col gap-2 bg-background border border-border"
          style={i === 0 ? { gridColumn: "span 2" } : undefined}
        >
          <ProductPhoto item={it} cdn={400} boxClass="w-full aspect-square rounded-xl" />
          <div className="font-semibold text-[13px] leading-tight min-h-[32px]">{it.name}</div>
          <div>
            <div className="font-display text-[23px] leading-none">
              {headline(it)}
              {metric === "revenue" && <span className="text-[12px] text-muted-foreground"> JOD</span>}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">{secondary(it)}</div>
          </div>
          <div className="mt-auto">
            <Bar pct={(valOf(it) / max) * 100} />
          </div>
        </div>
      ))}
    </div>
  );
}
