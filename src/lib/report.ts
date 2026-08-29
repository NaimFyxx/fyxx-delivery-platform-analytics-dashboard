/**
 * One-page executive PDF report. Read-only: it renders figures the dashboard already
 * computes (same sources and formulas as Financials + Items) into the approved
 * TGR_Delivery_Performance_Report template, then opens it ready to save as PDF via the
 * browser (which embeds the web fonts as vectors so the output matches the template).
 * No calculation, margin/VAT logic, importer or aggregation is changed here.
 */
import { exVat } from "./fyxx";
import { cogsFor, canonicalItemName, normalizeItemName, type DbAliasMap } from "./costs";
import { categoryFor } from "./categories";
import type { DashboardData } from "./dashboard.functions";

const PLATFORMS = ["Talabat", "Careem"] as const;
type PlatformName = (typeof PLATFORMS)[number];

// ---------- formatting ----------
const money2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => Math.round(n).toLocaleString("en-US");
const pct1 = (frac: number) => (frac * 100).toFixed(1);
const paren = (n: number) => `(${money2(n)})`;
const monthLong = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleString("en-US", { month: "long" });
const monthShortUpper = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleString("en-US", { month: "short" }).toUpperCase();
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- period math (mirrors the Financials page) ----------
type PeriodTotals = {
  gross: number; payout: number; discount: number; netSales: number; commFees: number;
  cogs: number; payoutExVat: number; netProfit: number; netMargin: number; prodMargin: number;
};

function periodTotals(data: DashboardData, months: string[], platforms: string[], dbAliases: DbAliasMap): PeriodTotals {
  let gross = 0, payout = 0, discount = 0;
  for (const f of data.financials) {
    if (!months.includes(f.month) || !platforms.includes(f.platform)) continue;
    gross += f.gross; payout += f.payout; discount += f.discount;
  }
  let cogs = 0;
  for (const m of months) cogs += cogsFor(data.itemSales, data.costs, m, platforms, dbAliases);
  const netSales = gross - discount;
  const commFees = netSales - payout;
  const payoutExVat = exVat(payout);
  const netProfit = payoutExVat - cogs;
  const netMargin = payoutExVat > 0 ? netProfit / payoutExVat : 0;
  const grossExVat = exVat(gross);
  const prodMargin = grossExVat > 0 ? (grossExVat - cogs) / grossExVat : 0;
  return { gross, payout, discount, netSales, commFees, cogs, payoutExVat, netProfit, netMargin, prodMargin };
}

function finGross(data: DashboardData, month: string, platform: string): number {
  return data.financials.filter((f) => f.month === month && f.platform === platform).reduce((s, f) => s + f.gross, 0);
}
function dailyGross(data: DashboardData, month: string, platform: string): number {
  return data.daily.filter((d) => d.date.slice(0, 7) === month && d.platform === platform).reduce((s, d) => s + d.sales, 0);
}
/** Combined gross incl VAT for a month, same basis as the Total sales over time chart. */
function combinedGross(data: DashboardData, month: string): number {
  return PLATFORMS.reduce((s, p) => s + (finGross(data, month, p) || dailyGross(data, month, p)), 0);
}

// ---------- model ----------
type NamedValue = { name: string; value: string };
export interface ReportModel {
  fileName: string;
  headerMonth: string;
  periodLine: string;
  issued: string;
  preparedBy: string;
  monthShort: string;
  ytdLabel: string;
  highlight: string;
  kpi: { gross: string; splitTal: string; splitCar: string; netProfit: string; netMargin: string; prodMargin: string };
  money: { label: string; month: string; ytd: string; cls: string }[];
  monthNet: string;
  ytdNet: string;
  moneyMonthMargin: string;
  moneyYtdMargin: string;
  byPlatform: { name: PlatformName; color: string; gross: string; netProfit: string; margin: string }[];
  combined: { gross: string; netProfit: string; margin: string };
  byPlatformInsight: string;
  menu: { productRev: NamedValue; productUnits: NamedValue; categoryRev: NamedValue; categoryUnits: NamedValue };
  trend: { label: string; value: number; isReport: boolean }[];
  trendCaption: string;
}

function bestGroup(
  data: DashboardData, month: string, dbAliases: DbAliasMap,
): { productRev: NamedValue; productUnits: NamedValue; categoryRev: NamedValue; categoryUnits: NamedValue } {
  const prod = new Map<string, { name: string; rev: number; units: number }>();
  const cat = new Map<string, { rev: number; units: number }>();
  for (const s of data.itemSales) {
    if (s.month !== month) continue;
    const canon = canonicalItemName(s.item, dbAliases);
    const e = prod.get(canon) ?? { name: s.item, rev: 0, units: 0 };
    e.rev += s.revenue; e.units += s.units;
    // Prefer a display name that is already canonical (no alias), then the shorter one.
    const eDirect = normalizeItemName(e.name) === canon;
    const sDirect = normalizeItemName(s.item) === canon;
    if ((sDirect && !eDirect) || (sDirect === eDirect && s.item.length < e.name.length)) e.name = s.item;
    prod.set(canon, e);

    const c = categoryFor(s.item, data.itemCategories, dbAliases);
    const ce = cat.get(c) ?? { rev: 0, units: 0 };
    ce.rev += s.revenue; ce.units += s.units;
    cat.set(c, ce);
  }
  const prods = [...prod.values()];
  const cats = [...cat.entries()].map(([name, v]) => ({ name, ...v }));
  const topBy = <T extends { rev: number; units: number }>(arr: T[], key: "rev" | "units") =>
    arr.slice().sort((a, b) => b[key] - a[key])[0];
  const pr = topBy(prods, "rev"), pu = topBy(prods, "units");
  const cr = topBy(cats, "rev"), cu = topBy(cats, "units");
  const nv = (name: string | undefined, suffix: string, v: number | undefined): NamedValue =>
    name ? { name, value: `${money0(v ?? 0)} ${suffix}` } : { name: "n/a", value: "" };
  return {
    productRev: nv(pr?.name, "JOD", pr?.rev),
    productUnits: pu ? { name: pu.name, value: `${pu.units} sold` } : { name: "n/a", value: "" },
    categoryRev: nv(cr?.name, "JOD", cr?.rev),
    categoryUnits: cu ? { name: cu.name, value: `${cu.units} items` } : { name: "n/a", value: "" },
  };
}

/** Build the report model, or null if there is no completed month of data yet. */
export function buildReportModel(
  data: DashboardData,
  dbAliases: DbAliasMap,
  opts?: { now?: Date; preparedBy?: string },
): ReportModel | null {
  const now = opts?.now ?? new Date();
  const curCalMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthsWithData = Array.from(new Set(data.financials.map((f) => f.month))).sort();
  const completed = monthsWithData.filter((m) => m < curCalMonth);
  if (!completed.length) return null;

  const monthKey = completed[completed.length - 1];
  const [yrStr, moStr] = monthKey.split("-");
  const year = Number(yrStr), moNum = Number(moStr);
  const ytdMonths = completed.filter((m) => m.slice(0, 4) === yrStr && m <= monthKey);

  const month = periodTotals(data, [monthKey], [...PLATFORMS], dbAliases);
  const ytd = periodTotals(data, ytdMonths, [...PLATFORMS], dbAliases);

  const talMonthGross = finGross(data, monthKey, "Talabat");
  const carMonthGross = finGross(data, monthKey, "Careem");

  const perPlatformYtd = PLATFORMS.map((p) => {
    const t = periodTotals(data, ytdMonths, [p], dbAliases);
    return { name: p, gross: t.gross, netProfit: t.netProfit, margin: t.netMargin };
  });
  const tal = perPlatformYtd[0], car = perPlatformYtd[1];
  const higher = tal.margin >= car.margin ? tal : car;
  const other = higher === tal ? car : tal;

  const menu = bestGroup(data, monthKey, dbAliases);

  // Trend: last up to 9 completed months, combined gross incl VAT (sales-over-time basis).
  const trendMonths = completed.slice(-9);
  const trend = trendMonths.map((m) => ({
    label: monthShortUpper(m),
    value: combinedGross(data, m),
    isReport: m === monthKey,
  }));

  // Highlight paragraph (rules-based, factual, no em dashes).
  const priorKey = completed[completed.length - 2];
  const grossMonth = month.gross;
  let momClause: string, verb: string;
  if (priorKey) {
    const priorGross = periodTotals(data, [priorKey], [...PLATFORMS], dbAliases).gross;
    const chg = priorGross > 0 ? ((grossMonth - priorGross) / priorGross) * 100 : 0;
    const flat = Math.abs(chg) <= 3;
    verb = flat ? "held at" : chg > 0 ? "rose to" : "fell to";
    momClause = flat
      ? `roughly flat versus ${monthLong(priorKey)}`
      : `${chg > 0 ? "up" : "down"} ${Math.abs(Math.round(chg))}% on ${monthLong(priorKey)}`;
  } else {
    verb = "reached";
    momClause = "the first full month on record";
  }
  const highlight =
    `${monthLong(monthKey)} delivery sales ${verb} ${money0(grossMonth)} JOD, ${momClause}, and the channel kept ` +
    `${money0(month.netProfit)} JOD in net profit at a ${pct1(month.netMargin)}% net margin after all platform fees. ` +
    `${higher.name} delivered the stronger margin year to date at ${pct1(higher.margin)}% against ${other.name}'s ${pct1(other.margin)}%. ` +
    `The month's best seller was ${menu.productRev.name}, and ${menu.categoryRev.name} was the leading category.`;

  const otherHasMoreGross = other.gross > higher.gross;
  const byPlatformInsight =
    `<b>${higher.name} earns the higher margin</b>, ${pct1(higher.margin)}% against ${other.name}'s ${pct1(other.margin)}%` +
    (otherHasMoreGross ? `. ${other.name} sells more but keeps less after commission.` : ".");

  const lastDay = new Date(year, moNum, 0).getDate();

  return {
    fileName: `tgr-delivery-report-${monthLong(monthKey).toLowerCase()}-${year}`,
    headerMonth: `${monthLong(monthKey)} ${year}`,
    periodLine: `1 to ${lastDay} ${monthLong(monthKey)} ${year}`,
    issued: `${now.getDate()} ${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}`,
    preparedBy: opts?.preparedBy || "Naím Aljada",
    monthShort: monthLong(monthKey),
    ytdLabel: `YTD ${year}`,
    highlight,
    kpi: {
      gross: money0(grossMonth),
      splitTal: money0(talMonthGross),
      splitCar: money0(carMonthGross),
      netProfit: money0(month.netProfit),
      netMargin: pct1(month.netMargin),
      prodMargin: pct1(month.prodMargin),
    },
    money: [
      { label: "Gross sales (incl VAT)", month: money2(month.gross), ytd: money2(ytd.gross), cls: "name" },
      { label: "Less: discounts", month: paren(month.discount), ytd: paren(ytd.discount), cls: "name sub" },
      { label: "Net sales (NSV)", month: money2(month.netSales), ytd: money2(ytd.netSales), cls: "name" },
      { label: "Less: commissions &amp; fees", month: paren(month.commFees), ytd: paren(ytd.commFees), cls: "name sub" },
      { label: "Payout received", month: money2(month.payout), ytd: money2(ytd.payout), cls: "name" },
      { label: "Less: VAT", month: paren(month.payout - month.payoutExVat), ytd: paren(ytd.payout - ytd.payoutExVat), cls: "name sub" },
      { label: "Payout ex-VAT", month: money2(month.payoutExVat), ytd: money2(ytd.payoutExVat), cls: "name" },
      { label: "Less: cost of goods", month: paren(month.cogs), ytd: paren(ytd.cogs), cls: "name sub" },
    ],
    monthNet: money2(month.netProfit),
    ytdNet: money2(ytd.netProfit),
    moneyMonthMargin: `${pct1(month.netMargin)}%`,
    moneyYtdMargin: `${pct1(ytd.netMargin)}%`,
    byPlatform: [
      { name: "Talabat", color: "var(--talabat)", gross: money2(tal.gross), netProfit: money2(tal.netProfit), margin: `${pct1(tal.margin)}%` },
      { name: "Careem", color: "var(--careem)", gross: money2(car.gross), netProfit: money2(car.netProfit), margin: `${pct1(car.margin)}%` },
    ],
    combined: { gross: money2(ytd.gross), netProfit: money2(ytd.netProfit), margin: `${pct1(ytd.netMargin)}%` },
    byPlatformInsight,
    menu,
    trend,
    trendCaption:
      `Combined monthly gross including VAT, last ${trend.length} completed months. Careem shown on a food-basket ` +
      `(own-revenue) basis, roughly 11% below Careem's headline GMV. Report month in gold.`,
  };
}

// ---------- HTML render (the approved template, verbatim styles) ----------
const REPORT_CSS = `
  @page { size: A4; margin: 0; }
  :root {
    --green:#092727; --ink:#1d2b2b; --grey:#5f6d6d; --line:#d8d0c4;
    --yellow:#EEC36A; --cream:#f4efe7; --white:#fff;
    --talabat:#FF5A00; --careem:#1BD15D;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { background:#e9e9e9; }
  body { font-family:"Inter", system-ui, sans-serif; color:var(--ink); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { width:210mm; height:297mm; margin:12mm auto; background:var(--white);
    padding:8mm 13mm 6.5mm 13mm; display:flex; flex-direction:column; gap:2mm; box-shadow:0 2px 20px rgba(0,0,0,.12); }
  @media print { html, body { background:#fff; } .page { margin:0; box-shadow:none; } }
  .head { border-bottom:1.5px solid var(--green); padding-bottom:2.8mm; }
  .headtop { display:flex; justify-content:space-between; align-items:center; }
  .brandlock { display:flex; align-items:center; gap:3mm; }
  .badge { width:12mm; height:12mm; flex:0 0 auto; }
  .wordmark { font-family:"Baskervville", Georgia, serif; font-size:19pt; letter-spacing:.2px; line-height:1; color:var(--green); }
  .wordmark .u { color:var(--yellow); }
  .eyebrow { font-family:"Syne", sans-serif; font-weight:800; font-size:6.5pt; letter-spacing:2px; text-transform:uppercase; color:var(--grey); }
  .head .eyebrow { white-space:nowrap; text-align:right; line-height:1.7; }
  .head .eyebrow b { color:var(--green); }
  .headgrid { display:grid; grid-template-columns:1fr auto; align-items:end; margin-top:2mm; }
  .month { font-family:"Baskervville", Georgia, serif; font-size:26pt; line-height:1; color:var(--green); }
  .meta { text-align:right; font-size:7.5pt; color:var(--grey); line-height:1.5; }
  .meta b { color:var(--ink); font-weight:600; }
  .sec { display:flex; align-items:baseline; gap:2.5mm; margin-bottom:1.3mm; }
  .sec .eyebrow { color:var(--green); }
  .sec::after { content:""; flex:1; border-bottom:1px solid var(--yellow); transform:translateY(-1.5px); }
  .highlight { font-family:"Baskervville", Georgia, serif; font-size:11pt; line-height:1.36; padding-left:4mm; border-left:2.5px solid var(--yellow); color:var(--ink); }
  .reach { display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .kpi { padding:2mm 0 2mm 3mm; border-left:1px solid var(--line); }
  .kpi:first-child { border-left:0; padding-left:0; }
  .kpi .n { font-family:"Baskervville", Georgia, serif; font-size:19pt; line-height:1; letter-spacing:-.3px; color:var(--green); }
  .kpi .n small { font-size:10pt; color:var(--grey); letter-spacing:0; margin-left:1px; }
  .kpi .l { font-size:7pt; color:var(--grey); margin-top:1.4mm; }
  .kpi .l b { color:var(--ink); font-weight:600; }
  table { width:100%; border-collapse:collapse; font-size:8pt; table-layout:fixed; }
  th { font-family:"Syne", sans-serif; font-weight:700; font-size:5.8pt; letter-spacing:1.2px; text-transform:uppercase; color:var(--grey); text-align:right; padding:0 0 1.4mm 0; border-bottom:1px solid var(--line); vertical-align:bottom; }
  td { padding:1.15mm 0; border-bottom:1px solid #efe9de; text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  th:first-child, td:first-child { text-align:left; }
  th:not(:first-child), td:not(:first-child) { padding-left:2.5mm; }
  td.name { font-weight:500; color:var(--ink); }
  td.sub { color:var(--grey); font-weight:400; }
  tr.total td { border-top:1.2px solid var(--green); border-bottom:0; font-weight:600; padding-top:1.7mm; color:var(--green); }
  tr.total td:first-child { font-family:"Syne", sans-serif; font-size:6pt; letter-spacing:1.2px; text-transform:uppercase; }
  tr.net td { border-top:1.2px solid var(--green); border-bottom:0; padding-top:1.7mm; font-family:"Baskervville",Georgia,serif; font-size:12pt; font-weight:600; color:var(--green); }
  tr.net td:first-child { font-family:"Syne", sans-serif; font-size:7pt; letter-spacing:1.2px; text-transform:uppercase; color:var(--green); }
  tr.mg td { border-bottom:0; color:var(--grey); font-size:7.4pt; padding-top:.8mm; }
  .plnote { font-size:6.6pt; color:var(--grey); margin-top:2mm; line-height:1.45; }
  .dot { display:inline-block; width:7px; height:7px; border-radius:2px; margin-right:5px; vertical-align:middle; }
  .cols { display:grid; grid-template-columns:1.15fr 1fr; gap:8mm; }
  .cols > section { min-width:0; }
  .insight { font-family:"Baskervville", Georgia, serif; font-size:9.5pt; line-height:1.4; padding-left:3.5mm; border-left:2.5px solid var(--yellow); margin-top:3mm; color:var(--ink); }
  .insight b { font-weight:600; color:var(--green); }
  .trend-cap { font-size:6.8pt; color:var(--grey); margin-top:2mm; line-height:1.45; }
  .foot { margin-top:auto; display:flex; justify-content:space-between; font-size:6.4pt; color:var(--grey); border-top:1px solid var(--line); padding-top:1.4mm; }
`;

function trendSvg(trend: { label: string; value: number; isReport: boolean }[]): string {
  const max = Math.max(...trend.map((t) => t.value), 1);
  const bars = trend.map((t, i) => {
    const x = 4 + i * 77;
    const h = (t.value / max) * 70;
    const y = 86 - h;
    const fill = t.isReport ? "#EEC36A" : "#092727";
    return `<rect x="${x}" y="${y.toFixed(1)}" width="60" height="${h.toFixed(1)}" fill="${fill}"/>`;
  }).join("");
  const labels = trend.map((t, i) => {
    const cx = 4 + i * 77 + 30;
    const extra = t.isReport ? ` fill="#092727" font-weight="700"` : "";
    return `<text x="${cx}" y="99"${extra}>${t.label}</text>`;
  }).join("");
  return `<svg viewBox="0 0 700 104" width="100%" height="86" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style="display:block">
      <line x1="0" y1="86" x2="700" y2="86" stroke="#d8d0c4" stroke-width="1"/>
      <g>${bars}</g>
      <g font-family="Syne, sans-serif" font-size="8.5" fill="#5f6d6d" text-anchor="middle" letter-spacing="0.5">${labels}</g>
    </svg>`;
}

export function renderReportHtml(m: ReportModel): string {
  const nv = (x: NamedValue) =>
    x.value ? `${escapeHtml(x.name)} &nbsp;<span style="color:var(--grey)">${x.value}</span>` : escapeHtml(x.name);
  const moneyRows = m.money.map((r) =>
    `<tr><td class="${r.cls}">${r.label}</td><td${r.cls.includes("sub") ? ' class="sub"' : ""}>${r.month}</td><td${r.cls.includes("sub") ? ' class="sub"' : ""}>${r.ytd}</td></tr>`,
  ).join("");
  const platRows = m.byPlatform.map((p) =>
    `<tr><td class="name"><span class="dot" style="background:${p.color}"></span>${p.name}</td><td>${p.gross}</td><td>${p.netProfit}</td><td>${p.margin}</td></tr>`,
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(m.fileName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baskervville:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet">
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="page">
  <header class="head">
    <div class="headtop">
      <div class="brandlock">
        <svg class="badge" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="23" fill="#092727"/>
          <circle cx="24" cy="24" r="19.5" fill="none" stroke="#EEC36A" stroke-width="0.8"/>
          <text x="24" y="29.5" text-anchor="middle" font-family="Baskervville, Georgia, serif" font-size="15" fill="#f4efe7" font-style="italic">TGR</text>
        </svg>
        <div class="wordmark">The Green Room</div>
      </div>
      <div class="eyebrow">Talabat &amp; Careem Delivery<br><b>Monthly Performance Report</b></div>
    </div>
    <div class="headgrid">
      <div class="month">${escapeHtml(m.headerMonth)}</div>
      <div class="meta">
        Period <b>${escapeHtml(m.periodLine)}</b> &nbsp;&middot;&nbsp; Prepared by <b>${escapeHtml(m.preparedBy)}</b> &nbsp;&middot;&nbsp; Issued <b>${escapeHtml(m.issued)}</b>
      </div>
    </div>
  </header>

  <section>
    <div class="sec"><span class="eyebrow">Month highlight</span></div>
    <p class="highlight">${escapeHtml(m.highlight)}</p>
  </section>

  <section>
    <div class="sec"><span class="eyebrow">Performance &middot; ${escapeHtml(m.monthShort)}</span></div>
    <div class="reach">
      <div class="kpi"><div class="n">${m.kpi.gross} <small>JOD</small></div><div class="l">Gross sales <b>&middot; Talabat ${m.kpi.splitTal} &middot; Careem ${m.kpi.splitCar}</b></div></div>
      <div class="kpi"><div class="n">${m.kpi.netProfit} <small>JOD</small></div><div class="l">Net profit kept after all fees and cost</div></div>
      <div class="kpi"><div class="n">${m.kpi.netMargin}<small>%</small></div><div class="l">Net margin <b>on ex-VAT payout, after commission</b></div></div>
      <div class="kpi"><div class="n">${m.kpi.prodMargin}<small>%</small></div><div class="l">Product margin on menu price, before discounts and fees</div></div>
    </div>
  </section>

  <div class="cols">
    <section>
      <div class="sec"><span class="eyebrow">The money trail &middot; month vs year</span></div>
      <table>
        <thead><tr><th>JOD</th><th>${escapeHtml(m.headerMonth)}</th><th>${escapeHtml(m.ytdLabel)}</th></tr></thead>
        <tbody>
          ${moneyRows}
          <tr class="net"><td>Net profit</td><td>${m.monthNet}</td><td>${m.ytdNet}</td></tr>
          <tr class="mg"><td class="name">Net margin</td><td>${m.moneyMonthMargin}</td><td>${m.moneyYtdMargin}</td></tr>
        </tbody>
      </table>
      <p class="plnote">Net profit is the delivery-channel contribution and excludes TGR internal overheads (staff, rent, packaging).</p>
    </section>

    <section>
      <div class="sec"><span class="eyebrow">By platform &middot; year to date</span></div>
      <table>
        <thead><tr><th>${escapeHtml(m.ytdLabel)}</th><th>Gross</th><th>Net profit</th><th>Margin</th></tr></thead>
        <tbody>
          ${platRows}
          <tr class="total"><td>Combined</td><td>${m.combined.gross}</td><td>${m.combined.netProfit}</td><td>${m.combined.margin}</td></tr>
        </tbody>
      </table>
      <p class="insight">${m.byPlatformInsight}</p>
    </section>
  </div>

  <section>
    <div class="sec"><span class="eyebrow">Menu signals &middot; ${escapeHtml(m.monthShort)}</span></div>
    <table>
      <thead><tr><th>What is carrying the month</th><th>By revenue</th><th>By quantity</th></tr></thead>
      <tbody>
        <tr><td class="name">Best-selling product</td><td>${nv(m.menu.productRev)}</td><td>${nv(m.menu.productUnits)}</td></tr>
        <tr><td class="name">Best-selling category</td><td>${nv(m.menu.categoryRev)}</td><td>${nv(m.menu.categoryUnits)}</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <div class="sec"><span class="eyebrow">Total sales trend &middot; monthly gross incl VAT</span></div>
    ${trendSvg(m.trend)}
    <p class="trend-cap">${escapeHtml(m.trendCaption)}</p>
  </section>

  <footer class="foot">
    <span>The Green Room &middot; Al-Kasra for Trade and Marketing &middot; Prepared for Zeid Salfiti</span>
    <span>Sources: Talabat, Careem &middot; Generated from the TGR Delivery Dashboard &middot; Page 1 of 1</span>
  </footer>
</div>
<script>
  window.addEventListener("load", function () {
    var go = function () { setTimeout(function () { window.focus(); window.print(); }, 350); };
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(go); } else { go(); }
  });
</script>
</body>
</html>`;
}

/** Compose the report and open it in a new window, ready to save as PDF. */
export function exportReportPdf(data: DashboardData, dbAliases: DbAliasMap, preparedBy?: string): { ok: boolean; error?: string } {
  const model = buildReportModel(data, dbAliases, { preparedBy });
  if (!model) return { ok: false, error: "No completed month of data to report yet." };
  const html = renderReportHtml(model);
  const w = window.open("", "_blank");
  if (!w) return { ok: false, error: "Allow pop-ups for this site to export the report." };
  w.document.open();
  w.document.write(html);
  w.document.close();
  return { ok: true };
}
