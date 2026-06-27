import { supabase } from "@/integrations/supabase/client";

export const VAT_RATE = 0.16;
export const PLATFORMS = ["Talabat", "Careem"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Precise money: "JOD 1,234.50" — used in admin tables (Financials, etc.) */
export const fmtJOD = (n: number) =>
  new Intl.NumberFormat("en-JO", { style: "currency", currency: "JOD", maximumFractionDigits: 2 }).format(n);
/** Rounded money, suffix style: "1,234 JOD" — used in KPI cards and charts */
export const fmtJOD0 = (n: number) => `${Math.round(n).toLocaleString()} JOD`;
export const fmtInt = (n: number) =>
  new Intl.NumberFormat("en-JO").format(Math.round(n));
/** Input is a fraction 0–1 (e.g. 0.72), returns "72.0%". Do NOT pass an already-percent number. */
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export const exVat = (gross: number) => gross / (1 + VAT_RATE);
export const vatOf = (gross: number) => gross - exVat(gross);

/** Returns YYYY-MM for a Date or ISO date string */
export const toMonth = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const currentMonth = () => toMonth(new Date());

export const platformColor = (p: Platform) =>
  p === "Talabat" ? "text-talabat" : "text-careem";
export const platformBg = (p: Platform) =>
  p === "Talabat" ? "bg-talabat/15 text-talabat border-talabat/30"
                  : "bg-careem/15 text-careem border-careem/30";

export async function requireUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/** Log a successful manual entry to import_log so the dashboard can show
 *  a "last updated" freshness indicator per source. */
export async function logImport(args: {
  platform: string;
  report_type: "performance" | "popular_dishes" | "invoice";
  file_name?: string;
  rows_imported?: number;
}) {
  await supabase.from("import_log").insert({
    platform: args.platform,
    report_type: args.report_type,
    file_name: args.file_name ?? "manual entry",
    rows_imported: args.rows_imported ?? 1,
    status: "success",
  });
}