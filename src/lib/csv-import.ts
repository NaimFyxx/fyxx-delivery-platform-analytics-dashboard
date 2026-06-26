import Papa from "papaparse";
import type { Platform } from "@/lib/fyxx";

/** Stable id for each import slot, namespaced by platform.
 *  These map 1:1 to the confirmed partner-portal exports. */
export type ReportId =
  | "talabat:order_report" // T1 — one row per order (money + items + Pro flag)
  | "talabat:performance" // T2 — one row per store per day (daily totals + Pro)
  | "talabat:menu_item"   // T3 — one row per item (Dish / Total / Sales)
  | "careem:order_level" // C1 — one row per order (money + payout)
  | "careem:menu_item" // C2 — one row per item per period
  | "careem:adjustments" // C4 — monthly deductions (bank fee, Plus contribution)
  | "careem:plus_orders" // Careem Plus skinny file — orders per day
  | "careem:plus_sales"; // Careem Plus skinny file — sales per day

export type MonthSource = "none" | "from-rows" | "from-columns";

export interface FieldDef {
  key: string;
  label: string;
  defaults: string[];
  required: boolean;
}

export interface ReportDef {
  id: ReportId;
  platform: Platform;
  label: string;
  /** Where the user goes to export this report (stable report page). */
  portalUrl: string;
  portalLabel: string;
  /** Human click-path inside the portal (shown as a hover tooltip on the link). */
  portalSteps: string;
  /** Primary table the parsed rows are previewed against. */
  table: "platform_orders" | "daily_sales" | "monthly_item_sales" | "monthly_adjustments";
  fields: FieldDef[];
  optionalFields?: FieldDef[];
  /** Distinctive headers that must be present — used to reject mismatched files. */
  signature: string[];
  /** Skinny 2-column files (date + value); value is read positionally (2nd column). */
  positional?: boolean;
  monthSource: MonthSource;
  monthColumns?: { from: string; to: string };
  hint?: string;
}

// Stable report pages (generated-file links expire, especially on Careem).
const T_ORDERS = "https://partner-app.talabat.com/report-builder/create/ORDERS";
const T_REPORTS = "https://partner-app.talabat.com/report-builder/create/REPORTS";
const C_FINANCE = "https://app.careemnow.com/merchant/finances";
const C_PERF = "https://app.careemnow.com/merchant/dashboard-analytics/business-performance";

export const REPORTS: Record<ReportId, ReportDef> = {
  // ---------------- Talabat ----------------
  "talabat:order_report": {
    id: "talabat:order_report",
    platform: "Talabat",
    label: "Order Report",
    portalUrl: T_ORDERS,
    portalLabel: "Open Order Report builder",
    portalSteps:
      "Reports → Create a new report → Orders → set date range → Create → download CSV from History",
    table: "platform_orders",
    monthSource: "from-rows",
    signature: ["Order ID", "Payout Amount", "Order Items"],
    hint: "One row per order — money, items and Pro flag. Lands per-order money; item sales and monthly financials are derived from it.",
    fields: [
      { key: "order_id", label: "Order ID", defaults: ["Order ID"], required: true },
      {
        key: "order_dt",
        label: "Order received at",
        defaults: ["Order received at", "Order Received At"],
        required: true,
      },
      {
        key: "status",
        label: "Order status",
        defaults: ["Order status", "Order Status"],
        required: true,
      },
      { key: "gross", label: "Subtotal (gross, incl VAT)", defaults: ["Subtotal"], required: true },
      {
        key: "net_payout",
        label: "Payout Amount (net)",
        defaults: ["Payout Amount"],
        required: true,
      },
      { key: "items_text", label: "Order Items", defaults: ["Order Items"], required: true },
    ],
    optionalFields: [
      { key: "commission", label: "Commission", defaults: ["Commission"], required: false },
      {
        key: "payment_fee",
        label: "Online Payment Fee",
        defaults: ["Online Payment Fee"],
        required: false,
      },
      {
        key: "is_pro",
        label: "Is Pro Order (loyalty)",
        defaults: ["Is Pro Order"],
        required: false,
      },
      { key: "discount", label: "Total Discount", defaults: ["Total Discount"], required: false },
      { key: "voucher", label: "Total Voucher", defaults: ["Total Voucher"], required: false },
    ],
  },
  "talabat:performance": {
    id: "talabat:performance",
    platform: "Talabat",
    label: "Performance Report",
    portalUrl: T_REPORTS,
    portalLabel: "Open Performance Report builder",
    portalSteps:
      "Reports → Create a new report → Performance → set date range → Create → download CSV from History",
    table: "daily_sales",
    monthSource: "from-rows",
    signature: ["Date", "Gross Sales", "Successful Orders"],
    hint: "One row per store per day — clean daily totals for the pace tracker. Also carries Talabat Pro orders / revenue.",
    fields: [
      { key: "date", label: "Date", defaults: ["Date"], required: true },
      { key: "sales_jod", label: "Gross Sales", defaults: ["Gross Sales"], required: true },
      {
        // Delivered-orders count = the AOV denominator. "Successful Orders" excludes
        // cancellations; "Orders count" can include them — so prefer Successful Orders.
        key: "orders",
        label: "Successful (delivered) orders",
        defaults: ["Successful Orders", "Orders count", "Orders Count"],
        required: true,
      },
    ],
    optionalFields: [
      {
        key: "pro_orders",
        label: "Pro Orders (loyalty)",
        defaults: ["Pro Orders"],
        required: false,
      },
      {
        key: "pro_sales",
        label: "Pro Revenue (loyalty)",
        defaults: ["Pro Revenue"],
        required: false,
      },
    ],
  },

  "talabat:menu_item": {
    id: "talabat:menu_item",
    platform: "Talabat",
    label: "Sales by Menu Item",
    portalUrl: T_REPORTS,
    portalLabel: "Open Report Builder",
    portalSteps:
      "Reports → Create a new report → Sales by Menu Item → set date range (full calendar month, 1st–last day) → Create → download CSV from History",
    table: "monthly_item_sales",
    monthSource: "from-rows",
    signature: ["Dish", "Total", "Sales"],
    hint: "Per-item revenue and unit counts for the month. Replaces the whole month's Talabat item rows on import — always export a full calendar month.",
    fields: [
      { key: "item_name", label: "Dish (item name)", defaults: ["Dish"], required: true },
      { key: "units", label: "Total (units sold)", defaults: ["Total"], required: true },
      { key: "revenue_jod", label: "Sales (JOD revenue)", defaults: ["Sales"], required: true },
    ],
    optionalFields: [],
  },

  // ---------------- Careem ----------------
  "careem:order_level": {
    id: "careem:order_level",
    platform: "Careem",
    label: "Order Level",
    portalUrl: C_FINANCE,
    portalLabel: "Open Finances → Order Level",
    portalSteps:
      "Finances → Order Level tab → set date range → Export → New Export → download from Export History",
    table: "platform_orders",
    monthSource: "from-rows",
    signature: ["REFERENCE_ID", "TRANSACTION_DATE", "TOTAL_PAYOUT_AMOUNT"],
    hint: "One row per order — money + payout. Daily totals and monthly financials are derived from it. Only FOOD_ORDER rows are kept.",
    fields: [
      { key: "entry_type", label: "ENTRY_TYPE (filter)", defaults: ["ENTRY_TYPE"], required: true },
      {
        key: "order_id",
        label: "REFERENCE_ID (order id)",
        defaults: ["REFERENCE_ID"],
        required: true,
      },
      {
        key: "order_dt",
        label: "TRANSACTION_DATE",
        defaults: ["TRANSACTION_DATE"],
        required: true,
      },
      { key: "status", label: "STATUS", defaults: ["STATUS"], required: true },
      {
        key: "gross",
        label: "Gross basket (incl VAT)",
        defaults: ["FOOD_GROSS_BASKET_AMOUNT"],
        required: true,
      },
      {
        key: "net_payout",
        label: "Total payout (net)",
        defaults: ["TOTAL_PAYOUT_AMOUNT"],
        required: true,
      },
    ],
    optionalFields: [
      {
        key: "platform_fee",
        label: "Platform fee",
        defaults: ["BILLING_PLATFORM_FEE"],
        required: false,
      },
      {
        key: "platform_fee_tax",
        label: "Platform fee tax",
        defaults: ["BILLING_PLATFORM_FEE_TAX"],
        required: false,
      },
      {
        key: "gateway_fee",
        label: "Gateway fee",
        defaults: ["BILLING_PAYMENT_GATEWAY_FEE"],
        required: false,
      },
      {
        key: "gateway_fee_tax",
        label: "Gateway fee tax",
        defaults: ["BILLING_PAYMENT_GATEWAY_FEE_TAX"],
        required: false,
      },
      {
        key: "discount_catalog",
        label: "Catalog discount",
        defaults: ["PARTNER_FUNDED_CATALOG_DISCOUNT"],
        required: false,
      },
      {
        key: "discount_promo",
        label: "Promo discount",
        defaults: ["PARTNER_FUNDED_PROMO_DISCOUNT"],
        required: false,
      },
      { key: "payment_mode", label: "Payment mode", defaults: ["PAYMENT_MODE"], required: false },
    ],
  },
  "careem:menu_item": {
    id: "careem:menu_item",
    platform: "Careem",
    label: "By Menu Item",
    portalUrl: C_PERF,
    portalLabel: "Open Business Performance",
    portalSteps:
      "Analytics & reports → Sales Performance → Download Report (Daily, 'By menu item' metric)",
    table: "monthly_item_sales",
    monthSource: "from-columns",
    monthColumns: { from: "FromDate", to: "ToDate" },
    signature: ["Name", "Orders", "FromDate"],
    hint: "Careem item-level sales. The period is read from the FromDate / ToDate columns.",
    fields: [
      { key: "item_name", label: "Item name", defaults: ["Name"], required: true },
      { key: "units", label: "Orders (units)", defaults: ["Orders"], required: true },
    ],
    optionalFields: [
      {
        key: "revenue_jod",
        label: "Revenue (Amount)",
        defaults: ["Amount", "Gross Sales", "Sales", "Revenue", "Total"],
        required: false,
      },
    ],
  },
  "careem:adjustments": {
    id: "careem:adjustments",
    platform: "Careem",
    label: "Adjustments",
    portalUrl: C_FINANCE,
    portalLabel: "Open Finances → Adjustments",
    portalSteps:
      "Finances → Adjustments tab → set date range → Export → download from Export History",
    table: "monthly_adjustments",
    monthSource: "from-rows",
    // Native Careem export uses the same column convention as Order Level
    // (CATEGORY / TRANSACTION_DATE / TOTAL_AMOUNT / REFERENCE_ID). The friendly
    // on-screen labels are accepted too as a fallback. "A|B" = either header satisfies it.
    signature: ["CATEGORY|Type of deduction", "TOTAL_AMOUNT|Amount"],
    hint: "Native finance export — fee deductions (Careem Plus contribution + tax, bank transfer fee + tax, customer-complaint clawbacks). Carry-over / cashout (positive) lines are excluded. Subtracted from the order-derived payout.",
    fields: [
      {
        key: "deduction_type",
        label: "Deduction category",
        defaults: ["CATEGORY", "Type of deduction"],
        required: true,
      },
      {
        key: "date",
        label: "Transaction date",
        defaults: ["TRANSACTION_DATE", "Date"],
        required: true,
      },
      { key: "amount", label: "Amount", defaults: ["TOTAL_AMOUNT", "Amount"], required: true },
    ],
    optionalFields: [
      {
        key: "order_id",
        label: "Order id",
        defaults: ["REFERENCE_ID", "Order ID"],
        required: false,
      },
      {
        key: "comments",
        label: "Comments",
        defaults: ["DESCRIPTION", "Description", "Comments", "Comment"],
        required: false,
      },
    ],
  },
  "careem:plus_orders": {
    id: "careem:plus_orders",
    platform: "Careem",
    label: "Careem Plus — Orders",
    portalUrl: C_PERF,
    portalLabel: "Open Sales Performance (Plus)",
    portalSteps:
      "Analytics & reports → Sales Performance → 'Careem Plus / non-Careem Plus' segment → set the chart to ORDERS → Export.",
    table: "daily_sales",
    monthSource: "from-rows",
    positional: true,
    signature: [],
    hint: "Daily Careem Plus order counts. Same screen as Plus — Sales — just the other toggle.",
    fields: [],
  },
  "careem:plus_sales": {
    id: "careem:plus_sales",
    platform: "Careem",
    label: "Careem Plus — Sales",
    portalUrl: C_PERF,
    portalLabel: "Open Sales Performance (Plus)",
    portalSteps:
      "Analytics & reports → Sales Performance → 'Careem Plus / non-Careem Plus' segment → set the chart to SALES → Export.",
    table: "daily_sales",
    monthSource: "from-rows",
    positional: true,
    signature: [],
    hint: "Daily Careem Plus sales (JOD). Same screen as Plus — Orders — just the other toggle.",
    fields: [],
  },
};

export function reportsForPlatform(p: Platform): ReportDef[] {
  return Object.values(REPORTS).filter((r) => r.platform === p);
}

export type Mapping = Record<string, string>; // targetKey -> source header

const mappingKey = (id: ReportId) => `csv_map:${id}`;
export function loadMapping(id: ReportId): Mapping | null {
  try {
    const raw = localStorage.getItem(mappingKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveMapping(id: ReportId, m: Mapping) {
  localStorage.setItem(mappingKey(id), JSON.stringify(m));
}

/** Parse CSV text. Strips BOM, trims headers. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, "");
  const res = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  const headers = (res.meta.fields ?? []).filter(Boolean);
  const rows = (res.data ?? []).filter((r) => r && typeof r === "object");
  return { headers, rows };
}

/**
 * Validate that an uploaded file looks like the expected report.
 * Returns an error message naming the report, or null if it matches.
 */
export function validateSignature(headers: string[], report: ReportDef): string | null {
  if (report.positional) {
    return headers.length >= 2
      ? null
      : `That doesn't look like the ${report.label} export — expected a 2-column file (date + value).`;
  }
  const lower = headers.map((h) => h.toLowerCase().trim());
  // A signature entry may list alternatives as "A|B" — satisfied if ANY alternative is present.
  const missing = report.signature.filter(
    (s) => !s.split("|").some((alt) => lower.includes(alt.toLowerCase().trim())),
  );
  if (missing.length) {
    const names = missing.map((s) => s.split("|").join(" / ")).join(", ");
    return `That doesn't look like the ${report.label} export. Missing expected column(s): ${names}. Double-check you exported the right report.`;
  }
  return null;
}

/** Auto-match required + optional fields to headers using defaults (case-insensitive). */
export function autoMap(headers: string[], id: ReportId): Mapping {
  const m: Mapping = {};
  const lower = headers.map((h) => h.toLowerCase());
  const r = REPORTS[id];
  const all = [...r.fields, ...(r.optionalFields ?? [])];
  for (const f of all) {
    for (const candidate of f.defaults) {
      const idx = lower.indexOf(candidate.toLowerCase());
      if (idx >= 0) {
        m[f.key] = headers[idx];
        break;
      }
    }
  }
  return m;
}

/** Parse a number that may contain commas, currency, whitespace. Blank -> 0. */
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Round to JOD's 3 decimal places (fils). */
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/**
 * Parse a date string into YYYY-MM-DD. Handles the four confirmed formats:
 *   YYYY-MM-DD, YYYY-MM-DD HH:MM, YYYY-MM-DD HH:MM:SS.0, and DD Mon YYYY.
 * Returns null if unparseable. Parsing is explicit (no Date()) to avoid TZ shifts.
 */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  // YYYY-MM-DD (optionally followed by a time)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD Mon YYYY  (e.g. 14 Jun 2026)
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const mm = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${String(Number(m[1])).padStart(2, "0")}`;
  }
  // D/M/Y or D-M-Y
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }
  return null;
}

/** Parse a datetime into an ISO (UTC) string for storage, or null. Informational only. */
export function parseDateTime(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}Z`;
  const d = parseDate(s);
  return d ? `${d}T00:00:00Z` : null;
}

export function dateToMonth(yyyymmdd: string): string {
  return yyyymmdd.slice(0, 7);
}

/** Read FromDate / ToDate columns from the first row that has them; return YYYY-MM. */
export function monthFromColumns(
  rows: Record<string, string>[],
  cols: { from: string; to: string },
): string | null {
  for (const r of rows) {
    const d = parseDate(r[cols.from]) ?? parseDate(r[cols.to]);
    if (d) return dateToMonth(d);
  }
  return null;
}

/**
 * Parse a Talabat "Order Items" text field, e.g.
 *   "1 MB7 Wagyu , 1 TGR Smash , 2 Fries"
 * Each item is "<qty> <name>", comma-separated. Two real-world wrinkles are handled:
 *   1. Some item names contain commas ("Nuts, Olives & Pickles") or parenthetical
 *      extras with commas ("(Extra cheese, Extra walnuts)"). A comma only starts a new
 *      item when the next fragment begins with a "<qty> " token; otherwise it's a
 *      continuation of the current name, so we merge it back.
 *   2. Modifier decorations ("[1 With cheese]", "(Extra Kaak)") are stripped so order
 *      variants collapse to the base dish name (matches the cost table cleanly).
 */
export function parseOrderItems(text: unknown): { name: string; qty: number }[] {
  if (text === null || text === undefined) return [];
  // Split on TOP-LEVEL commas only — ignore commas inside "[...]" / "(...)" modifier groups
  // (e.g. "[1 With cheese, 1 Extra cheese]"), which carry their own qty prefixes.
  const frags: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of String(text)) {
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      frags.push(cur);
      cur = "";
    } else cur += ch;
  }
  frags.push(cur);
  // Re-join name-internal commas: a fragment that doesn't start with "<digits> " is a
  // continuation of the previous item, not a new item (e.g. "Nuts, Olives & Pickles").
  const pieces: string[] = [];
  for (const frag of frags.map((s) => s.trim()).filter(Boolean)) {
    if (pieces.length === 0 || /^\d+\s/.test(frag)) pieces.push(frag);
    else pieces[pieces.length - 1] += ", " + frag;
  }
  return pieces
    .map((piece) => {
      const m = piece.match(/^(\d+)\s+(.*)$/);
      const qty = m ? Number(m[1]) : 1;
      const name = (m ? m[2] : piece)
        .replace(/\s*\[[^\]]*\]/g, "") // [1 With cheese]
        .replace(/\s*\([^)]*\)/g, "") // (Extra cheese, Extra walnuts)
        .replace(/\s+/g, " ")
        .trim();
      return { name, qty };
    })
    .filter((it) => it.name.length > 0);
}

/** Is this order a successful (Delivered) order? */
export const isDelivered = (status: unknown) =>
  String(status ?? "")
    .trim()
    .toLowerCase() === "delivered";

/** Talabat "Charged Cancelled" — carries commission with no revenue (negative payout).
 *  Loose match so "Charged-Cancelled" / "CHARGED_CANCELLED" etc. are recognised. Used only to
 *  decide whether an unexpected status should be warned about — not to gate payout. */
export const isChargedCancelled = (status: unknown) =>
  String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .includes("charged cancel");
