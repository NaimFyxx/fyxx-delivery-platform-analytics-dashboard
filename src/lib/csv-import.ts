import Papa from "papaparse";

export type ReportType = "performance" | "popular_dishes" | "invoice";

export interface FieldDef {
  key: string;
  label: string;
  defaults: string[]; // candidate header names
  required: boolean;
}

export interface ReportDef {
  type: ReportType;
  label: string;
  table: "daily_sales" | "monthly_item_sales" | "monthly_financials";
  fields: FieldDef[];
  needsMonth?: boolean;
}

export const REPORTS: Record<ReportType, ReportDef> = {
  performance: {
    type: "performance",
    label: "Performance report (daily sales)",
    table: "daily_sales",
    fields: [
      { key: "date", label: "Date", defaults: ["Date"], required: true },
      { key: "sales_jod", label: "Gross sales", defaults: ["Gross Sales", "Sales"], required: true },
      { key: "orders", label: "Orders", defaults: ["Successful Orders", "Orders"], required: true },
    ],
  },
  popular_dishes: {
    type: "popular_dishes",
    label: "Popular dishes (monthly items)",
    table: "monthly_item_sales",
    needsMonth: true,
    fields: [
      { key: "item_name", label: "Dish", defaults: ["Dish", "Item"], required: true },
      { key: "units", label: "Units", defaults: ["Total", "Units", "Quantity"], required: true },
    ],
  },
  invoice: {
    type: "invoice",
    label: "Invoice report (monthly financials)",
    table: "monthly_financials",
    fields: [
      { key: "end_date", label: "End date (period)", defaults: ["End date", "End Date"], required: true },
      { key: "gross_sales", label: "Gross sales", defaults: ["Gross Sales"], required: true },
      { key: "actual_payout", label: "Total payout", defaults: ["Total Payout", "Payout"], required: true },
      { key: "orders", label: "Orders count", defaults: ["Orders Count", "Orders"], required: true },
      { key: "commission", label: "Commission charge", defaults: ["Commission Charge", "Commission"], required: true },
    ],
  },
};

export type Mapping = Record<string, string>; // targetKey -> source header

const mappingKey = (platform: string, type: ReportType) => `csv_map:${platform}:${type}`;
export function loadMapping(platform: string, type: ReportType): Mapping | null {
  try { const raw = localStorage.getItem(mappingKey(platform, type)); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
export function saveMapping(platform: string, type: ReportType, m: Mapping) {
  localStorage.setItem(mappingKey(platform, type), JSON.stringify(m));
}

/** Parse CSV text. Strips BOM, trims headers. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip BOM
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

/** Auto-match fields to headers using defaults (case-insensitive). */
export function autoMap(headers: string[], type: ReportType): Mapping {
  const m: Mapping = {};
  const lower = headers.map((h) => h.toLowerCase());
  for (const f of REPORTS[type].fields) {
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
  // ISO YYYY-MM-DD (allow trailing time)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let y = Number(m[3]); if (y < 100) y += 2000;
    return `${y}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }
  // Fallback to Date parser
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
}

export function dateToMonth(yyyymmdd: string): string {
  return yyyymmdd.slice(0, 7);
}