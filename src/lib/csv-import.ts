import Papa from "papaparse";
import type { Platform } from "@/lib/fyxx";

/** Stable id for each import flow, namespaced by platform. */
export type ReportId =
  | "talabat:performance"
  | "talabat:popular_dishes"
  | "talabat:invoice"
  | "careem:daily_sales"
  | "careem:gross_breakdown"
  | "careem:invoice";

export type ReportKind = "csv" | "manual";
export type MonthSource = "none" | "ask" | "from-columns";

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
  kind: ReportKind;
  /** Where the user goes to export this report. */
  portalUrl: string;
  portalLabel: string;
  table: "daily_sales" | "monthly_item_sales" | "monthly_financials";
  fields: FieldDef[];
  /** Auto-mapped but not required (e.g. Careem Plus columns). */
  optionalFields?: FieldDef[];
  monthSource: MonthSource;
  /** When monthSource = "from-columns", which headers to read. */
  monthColumns?: { from: string; to: string };
  /** Hint shown above the upload box / form. */
  hint?: string;
}

const TALABAT_PORTAL = "https://restaurants.talabat.com/";
const CAREEM_PORTAL = "https://partners.careem.com/";

export const REPORTS: Record<ReportId, ReportDef> = {
  // ---------------- Talabat ----------------
  "talabat:performance": {
    id: "talabat:performance",
    platform: "Talabat",
    label: "Performance report (daily sales)",
    kind: "csv",
    portalUrl: TALABAT_PORTAL,
    portalLabel: "Open Talabat portal",
    table: "daily_sales",
    monthSource: "none",
    hint: "Export the Performance report as CSV from the Talabat partner portal, then upload it here.",
    fields: [
      { key: "date", label: "Date", defaults: ["Date"], required: true },
      { key: "sales_jod", label: "Gross sales", defaults: ["Gross Sales", "Sales"], required: true },
      { key: "orders", label: "Orders", defaults: ["Successful Orders", "Orders"], required: true },
    ],
  },
  "talabat:popular_dishes": {
    id: "talabat:popular_dishes",
    platform: "Talabat",
    label: "Popular dishes (monthly items)",
    kind: "csv",
    portalUrl: TALABAT_PORTAL,
    portalLabel: "Open Talabat portal",
    table: "monthly_item_sales",
    monthSource: "ask",
    hint: "Export Popular Dishes as CSV. The file has no date column, so pick which month it covers.",
    fields: [
      { key: "item_name", label: "Dish", defaults: ["Dish", "Item"], required: true },
      { key: "units", label: "Units", defaults: ["Total", "Units", "Quantity"], required: true },
    ],
    optionalFields: [
      { key: "revenue_jod", label: "Revenue (JOD)", defaults: ["Sales", "Sales (JOD)", "Gross Sales", "Revenue", "Total Sales"], required: false },
    ],
  },
  "talabat:invoice": {
    id: "talabat:invoice",
    platform: "Talabat",
    label: "Invoice report (monthly financials)",
    kind: "csv",
    portalUrl: TALABAT_PORTAL,
    portalLabel: "Open Talabat portal",
    table: "monthly_financials",
    monthSource: "none",
    hint: "Export the Invoice report. Billing periods are grouped by the End date column.",
    fields: [
      { key: "end_date", label: "End date (period)", defaults: ["End date", "End Date"], required: true },
      { key: "gross_sales", label: "Gross sales", defaults: ["Gross Sales"], required: true },
      { key: "actual_payout", label: "Total payout", defaults: ["Total Payout", "Payout"], required: true },
      { key: "orders", label: "Orders count", defaults: ["Orders Count", "Orders"], required: true },
      { key: "commission", label: "Commission charge", defaults: ["Commission Charge", "Commission"], required: true },
    ],
  },

  // ---------------- Careem ----------------
  "careem:daily_sales": {
    id: "careem:daily_sales",
    platform: "Careem",
    label: "Daily sales report",
    kind: "csv",
    portalUrl: CAREEM_PORTAL,
    portalLabel: "Open Careem partner portal",
    table: "daily_sales",
    monthSource: "none",
    hint: "Export the Daily Sales report as CSV. Careem only lists days that had orders — missing days will read as zero on the dashboard.",
    fields: [
      { key: "date", label: "Date", defaults: ["Date"], required: true },
      { key: "sales_jod", label: "Overall sales", defaults: ["Overall - Sales", "Overall Sales"], required: true },
      { key: "orders", label: "Delivered orders", defaults: ["Overall - Delivered orders", "Overall Delivered orders"], required: true },
    ],
    optionalFields: [
      { key: "cplus_sales_jod", label: "Careem+ sales", defaults: ["Cplus users - Sales", "Cplus Sales"], required: false },
      { key: "cplus_orders", label: "Careem+ orders", defaults: ["Cplus users - Delivered orders", "Cplus Delivered orders"], required: false },
      { key: "cplus_aov", label: "Careem+ avg basket", defaults: ["Cplus users - Average basket value", "Cplus Average basket value"], required: false },
    ],
  },
  "careem:gross_breakdown": {
    id: "careem:gross_breakdown",
    platform: "Careem",
    label: "Gross sales breakdown (items)",
    kind: "csv",
    portalUrl: CAREEM_PORTAL,
    portalLabel: "Open Careem partner portal",
    table: "monthly_item_sales",
    monthSource: "from-columns",
    monthColumns: { from: "FromDate", to: "ToDate" },
    hint: "Month is read automatically from the FromDate / ToDate columns in the file.",
    fields: [
      { key: "item_name", label: "Item name", defaults: ["Name"], required: true },
      { key: "units", label: "Orders (units)", defaults: ["Orders"], required: true },
    ],
    optionalFields: [
      { key: "revenue_jod", label: "Revenue (JOD)", defaults: ["Gross Sales", "Sales", "Sales (JOD)", "Revenue", "Total"], required: false },
    ],
  },
  "careem:invoice": {
    id: "careem:invoice",
    platform: "Careem",
    label: "Invoice (manual entry from PDF)",
    kind: "manual",
    portalUrl: CAREEM_PORTAL,
    portalLabel: "Open Careem partner portal",
    table: "monthly_financials",
    monthSource: "ask",
    hint: "Careem settles by PDF invoice — enter these figures from the monthly invoice.",
    fields: [],
  },
};

export function reportsForPlatform(p: Platform): ReportDef[] {
  return Object.values(REPORTS).filter((r) => r.platform === p);
}

export type Mapping = Record<string, string>; // targetKey -> source header

const mappingKey = (id: ReportId) => `csv_map:${id}`;
export function loadMapping(id: ReportId): Mapping | null {
  try { const raw = localStorage.getItem(mappingKey(id)); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
export function saveMapping(id: ReportId, m: Mapping) {
  localStorage.setItem(mappingKey(id), JSON.stringify(m));
}

/** Parse CSV text. Strips BOM, trims headers. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, "");
  const res = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  const headers = (res.meta.fields ?? []).filter(Boolean);
  const rows = (res.data ?? []).filter((r) => r && typeof r === "object");
  return { headers, rows };
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
      if (idx >= 0) { m[f.key] = headers[idx]; break; }
    }
  }
  return m;
}

/** Parse a number that may contain commas, currency, whitespace. Blank -> 0. */
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Parse a date string into YYYY-MM-DD. Returns null if unparseable. */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let y = Number(m[3]); if (y < 100) y += 2000;
    return `${y}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
}

export function dateToMonth(yyyymmdd: string): string {
  return yyyymmdd.slice(0, 7);
}

/** Read FromDate / ToDate columns from the first row that has them and
 *  return YYYY-MM. Returns null if neither column is parseable. */
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