import { createServerFn } from "@tanstack/react-start";

/**
 * Public dashboard data — no auth required, shareable URL.
 * Uses the service-role client to bypass RLS. Returns plain serializable DTOs.
 *
 * COGS RULES (must stay correct):
 *   For each monthly_item_sales row (month, item, units, platform), look up
 *   the item_costs version with the GREATEST effective_from that is on or
 *   before the LAST day of that month. Multiply units × that cost. Sum.
 *   This means: adding a NEW cost version with a future effective_from
 *   NEVER changes any past month's COGS — history is immutable.
 */
export const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [daily, fin, costs, itemSales, targets, lastImport] = await Promise.all([
    supabaseAdmin.from("daily_sales").select("date,platform,sales_jod,orders").order("date"),
    supabaseAdmin.from("monthly_financials").select("month,platform,gross_sales,actual_payout,cogs"),
    supabaseAdmin.from("item_costs").select("item_name,cost_exvat,effective_from").order("effective_from"),
    supabaseAdmin.from("monthly_item_sales").select("month,platform,item_name,units"),
    supabaseAdmin.from("targets").select("month,platform,sales_target_jod,orders_target"),
    supabaseAdmin.from("import_log").select("imported_at").order("imported_at", { ascending: false }).limit(1),
  ]);

  return {
    daily: (daily.data ?? []).map((r) => ({
      date: r.date, platform: r.platform as string, sales: Number(r.sales_jod), orders: r.orders,
    })),
    financials: (fin.data ?? []).map((r) => ({
      month: r.month, platform: r.platform as string,
      gross: Number(r.gross_sales), payout: Number(r.actual_payout), cogsManual: Number(r.cogs),
    })),
    costs: (costs.data ?? []).map((r) => ({
      item: r.item_name, cost: Number(r.cost_exvat), effective_from: r.effective_from,
    })),
    itemSales: (itemSales.data ?? []).map((r) => ({
      month: r.month, platform: r.platform as string, item: r.item_name, units: r.units,
    })),
    targets: (targets.data ?? []).map((r) => ({
      month: r.month, platform: r.platform as string,
      salesTarget: Number(r.sales_target_jod), ordersTarget: r.orders_target,
    })),
    lastImportAt: lastImport.data?.[0]?.imported_at ?? null,
  };
});

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;