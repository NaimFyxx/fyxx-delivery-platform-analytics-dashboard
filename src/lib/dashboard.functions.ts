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

  const [daily, paceData, fin, costs, itemSales, targets, lastImport, allImports, custData, adjData] = await Promise.all([
    supabaseAdmin
      .from("daily_sales")
      .select(
        "date,platform,sales_jod,orders,cplus_sales_jod,cplus_orders,cplus_aov,cplus_customers,non_cplus_customers,pro_orders,pro_sales_jod",
      )
      .order("date"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin as any)
      .from("pace_daily")
      .select("date,platform,sales_jod,orders")
      .order("date"),
    supabaseAdmin
      .from("monthly_financials")
      .select("month,platform,gross_sales,actual_payout,cogs,discount"),
    supabaseAdmin
      .from("item_costs")
      .select("item_name,cost_exvat,effective_from")
      .order("effective_from"),
    supabaseAdmin.from("monthly_item_sales").select("month,platform,item_name,units,revenue_jod"),
    supabaseAdmin.from("targets").select("month,platform,sales_target_jod"),
    supabaseAdmin
      .from("import_log")
      .select("imported_at")
      .order("imported_at", { ascending: false })
      .limit(1),
    supabaseAdmin
      .from("import_log")
      .select("platform,report_type,imported_at")
      .eq("status", "success")
      .order("imported_at", { ascending: false }),
    supabaseAdmin
      .from("monthly_customers")
      .select("month,platform,basis,new,returning,reactivated,overall")
      .order("month"),
    supabaseAdmin
      .from("monthly_adjustments")
      .select("month,platform,deduction_type,amount"),
  ]);

  return {
    paceDaily: ((paceData.data ?? []) as { date: string; platform: string; sales_jod: number; orders: number | null }[]).map((r) => ({
      date: r.date,
      platform: r.platform as string,
      sales: Number(r.sales_jod),
      orders: r.orders,
    })),
    daily: (daily.data ?? []).map((r) => ({
      date: r.date,
      platform: r.platform as string,
      sales: Number(r.sales_jod),
      orders: r.orders,
      cplusSales: Number(r.cplus_sales_jod ?? 0),
      cplusOrders: Number(r.cplus_orders ?? 0),
      cplusAov: Number(r.cplus_aov ?? 0),
      cplusCustomers: Number(r.cplus_customers ?? 0),
      nonCplusCustomers: Number(r.non_cplus_customers ?? 0),
      proSales: Number(r.pro_sales_jod ?? 0),
      proOrders: Number(r.pro_orders ?? 0),
    })),
    financials: (fin.data ?? []).map((r) => ({
      month: r.month,
      platform: r.platform as string,
      gross: Number(r.gross_sales),
      payout: Number(r.actual_payout),
      discount: Number(r.discount ?? 0),
      cogsManual: Number(r.cogs),
    })),
    costs: (costs.data ?? []).map((r) => ({
      item: r.item_name,
      cost: Number(r.cost_exvat),
      effective_from: r.effective_from,
    })),
    itemSales: (itemSales.data ?? []).map((r) => ({
      month: r.month,
      platform: r.platform as string,
      item: r.item_name,
      units: r.units,
      revenue: Number(r.revenue_jod ?? 0),
    })),
    targets: (targets.data ?? []).map((r) => ({
      month: r.month,
      platform: r.platform as string,
      salesTarget: Number(r.sales_target_jod),
    })),
    lastImportAt: lastImport.data?.[0]?.imported_at ?? null,
    imports: (allImports.data ?? []).map((r) => ({
      platform: r.platform as string,
      reportType: r.report_type as string,
      importedAt: r.imported_at as string,
    })),
    customers: (custData.data ?? []).map((r) => ({
      month: r.month,
      platform: r.platform as string,
      basis: r.basis as string,
      new: Number(r.new),
      returning: Number(r.returning),
      reactivated: Number(r.reactivated),
      overall: Number(r.overall),
    })),
    adjustments: (adjData.data ?? []).map((r) => ({
      month: r.month as string,
      platform: r.platform as string,
      deductionType: r.deduction_type as string,
      amount: Number(r.amount),
    })),
  };
});

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
