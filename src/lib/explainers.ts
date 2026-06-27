export interface Explainer {
  label: string;
  meaning: string;
  formula?: string;
  example?: string;
}

export const EXPLAINERS: Record<string, Explainer> = {
  // Sales & basket
  sales_incl_vat: {
    label: "Sales (incl VAT)",
    meaning: "Total gross sales customers paid, VAT included, across Talabat + Careem for the period.",
    formula: "Σ gross sales (incl VAT)",
    example: "e.g. Jun = 737 JOD.",
  },
  aov: {
    label: "Avg Basket (AOV)",
    meaning: "Average order value — how much an average order is worth.",
    formula: "gross sales ÷ orders",
    example: "737 ÷ 24 ≈ 30.7 JOD.",
  },
  avg_per_day_jod: {
    label: "Avg Sales / Day",
    meaning: "Average sales per active day (days with at least one order).",
    formula: "gross sales ÷ active days",
    example: "e.g. 737 ÷ 26 ≈ 28 JOD/day.",
  },
  avg_orders_day: {
    label: "Avg Orders / Day",
    meaning: "Average orders per active day.",
    formula: "orders ÷ active days",
    example: "30 ÷ 26 ≈ 1.2/day.",
  },

  // Margins
  product_margin: {
    label: "Product Margin",
    meaning: "Margin on the menu price, before the platform takes its cut. Best-case kitchen margin.",
    formula: "(exVat(gross) − COGS) ÷ exVat(gross)",
    example: "Gross 305, exVAT 263, COGS 95 → (263−95)/263 ≈ 64%.",
  },
  margin_after_commission: {
    label: "Margin after commission %",
    meaning:
      "Margin after only the platform's fixed cut (commission + fees), with promos/discounts added back so it's not distorted by inconsistent promo spend.",
    formula: "(exVat(payout + discount) − COGS) ÷ exVat(payout + discount)",
    example: "Smash Burger ≈ 49%.",
  },
  net_margin: {
    label: "Net Margin",
    meaning:
      "Zeid's net margin — what you actually keep after the platform's commission AND your promo/discount spend.",
    formula: "(exVat(actual payout) − COGS) ÷ exVat(actual payout)",
    example: "Smash Burger ≈ 27%.",
  },
  net_profit_kept: {
    label: "Net Profit Kept",
    meaning: "Actual cash kept after VAT, the platform's cut, and cost of goods.",
    formula: "exVat(actual payout) − COGS",
    example: "e.g. 189 JOD this month.",
  },

  // Items / pricing
  units: {
    label: "Units",
    meaning: "Units sold in the period (merged across both platforms for the same dish).",
    formula: "Σ units",
  },
  sell_price: {
    label: "Sell price",
    meaning:
      "Your set menu list price (bold) with the realized average underneath (what customers actually paid after discounts).",
    formula: "list price · avg = revenue ÷ units",
    example: "List 10.00 · avg 10.16.",
  },
  unit_cost: {
    label: "Unit cost (ex-VAT)",
    meaning: "Cost to make one unit, ex-VAT, from the recipe cost sheet (latest version effective that month).",
    formula: "from item_costs",
    example: "Smash Burger = 3.18 JOD.",
  },
  total_cogs: {
    label: "Total COGS",
    meaning: "Total cost of goods for the units sold.",
    formula: "Σ units × unit cost",
    example: "30 × 3.18 = 95.40.",
  },
  revenue: {
    label: "Revenue (JOD)",
    meaning: "Item revenue, incl VAT, for the period.",
    formula: "Σ item gross sales",
    example: "Smash Burger Jun = 305.",
  },
  avg_price_unit: {
    label: "Avg price / unit",
    meaning: "Average realized selling price per unit — what customers actually paid after discounts and combos.",
    formula: "revenue ÷ units",
    example: "305 ÷ 30 ≈ 10.17 JOD.",
  },

  // Pace tracker
  pace_pct: {
    label: "Pace %",
    meaning: "How far you are toward the monthly target so far.",
    formula: "sales ÷ target × 100",
    example: "698 ÷ 1,650 ≈ 42%.",
  },
  pace_prorated: {
    label: "Pro-rated pace %",
    meaning: "Pace vs where you should be this far into the month, given how many days have passed.",
    formula: "sales ÷ (target × dayOfMonth ÷ daysInMonth) × 100",
    example: "Day 26/30 → expected 1,430; 698 / 1,430 ≈ 49%.",
  },
  working_days: {
    label: "Working days (WD)",
    meaning: "Distinct days this month where at least one order came in.",
    formula: "count(distinct order dates)",
    example: "WD 26.",
  },
  data_through: {
    label: "Data through",
    meaning:
      "The latest date both platforms have data for (limited by the slower platform). Amber means a recent day may still be missing.",
    formula: "min(latest daily-sales date per platform)",
    example: "data through 25 Jun.",
  },
  target_pct: {
    label: "Target achievement %",
    meaning: "How far actual sales are vs this platform's monthly target.",
    formula: "actual ÷ target × 100",
    example: "680 ÷ 1,000 = 68%.",
  },

  // Financials
  discount: {
    label: "Discount",
    meaning: "Partner-funded promos and vouchers you absorbed — the inconsistent spend across months.",
    formula: "Σ |partner-funded discounts + vouchers|",
    example: "Jun Talabat = 86.73 JOD.",
  },
  net_sales: {
    label: "Net sales",
    meaning: "Sales after subtracting the promos you funded.",
    formula: "gross − discount",
  },
  actual_payout: {
    label: "Actual payout",
    meaning: "Money the platform actually paid you, after commission, fees, and any promos you absorbed.",
    formula: "Σ payout (+ signed adjustments)",
  },
  platform_fee_pct: {
    label: "Platform fee %",
    meaning: "Share of your ex-VAT sales the platform kept (commission + fees + promos).",
    formula: "(exVat(gross) − exVat(payout)) ÷ exVat(gross)",
  },

  // Customers
  new_customers: {
    label: "New customers",
    meaning: "First-ever orders in the period — customers placing their debut order. Careem counts unique customers; Talabat reports order counts (not unique customers), so 'All platforms' blends the two bases.",
    formula: "count(new)",
  },
  returning_customers: {
    label: "Returning customers",
    meaning: "Customers who had ordered from you before this period. Careem counts unique customers; Talabat reports order counts, so 'All platforms' blends the two bases.",
    formula: "count(returning)",
  },
  reactivated: {
    label: "Reactivated",
    meaning: "Returning customers who had lapsed (not ordered for a while) and came back.",
    formula: "count(reactivated)",
  },
  retained: {
    label: "Retained",
    meaning: "Returning customers who kept ordering without lapsing — loyal regulars.",
    formula: "returning − reactivated",
  },
  repeat_rate: {
    label: "Repeat rate",
    meaning: "Share of returning (non-first-time) customers. Careem measures this by unique customers; Talabat by orders, since Talabat only reports order-level data — so 'All platforms' blends the two bases.",
    formula: "returning ÷ total × 100",
    example: "14 returning / 20 total = 70%.",
  },

  // Charts
  chart_sales_by_platform: {
    label: "Sales by Platform",
    meaning:
      "Gross sales (incl VAT) per platform — monthly bars over the selected range, daily view when a single month is chosen.",
  },
  chart_margin_trend: {
    label: "Margin over Time",
    meaning:
      "Three margins plotted monthly: Product (on menu price) → After commission (platform's fixed cut) → Net (after cut + promos). Always shows full history regardless of the date filter.",
  },
  chart_order_volume: {
    label: "Order Volume Trend",
    meaning:
      "Average orders per active day (left axis) vs average sales in JOD per active day (right axis). Always shows full history regardless of the date filter.",
  },
  chart_commission_drag: {
    label: "Commission Drag",
    meaning:
      "Margin percentage points lost to the platform's fees — the gap between Product margin and Net margin.",
  },
  target_line: {
    label: "Target line",
    meaning: "The monthly sales-target reference line — where you need to be by end of month.",
  },
};
