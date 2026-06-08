import { supabase } from "@/integrations/supabase/client";

export const VAT_RATE = 0.16;
export const PLATFORMS = ["Talabat", "Careem"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const fmtJOD = (n: number) =>
  new Intl.NumberFormat("en-JO", { style: "currency", currency: "JOD", maximumFractionDigits: 2 }).format(n);
export const fmtInt = (n: number) =>
  new Intl.NumberFormat("en-JO").format(Math.round(n));
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