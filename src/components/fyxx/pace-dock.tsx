import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { ChevronUp } from "lucide-react";
import { getDashboardData } from "@/lib/dashboard.functions";
import { computePace, currentPaceMonth, type PaceData } from "@/lib/pace";
import { paceBadgeState, PACE_BADGE_LABEL, paceBasePct } from "@/lib/pace-badge";
import { usePaceView, type PaceViewMode } from "@/lib/pace-view";
import { fmtInt } from "@/lib/fyxx";
import { InfoTip } from "@/components/fyxx/info-tip";

// The dock (gear + bar) belongs only on the app's own pace, dashboard and admin pages. It is mounted
// in __root, which sits above every route including the public sign-in page, so without this gate it
// leaked onto /auth and onto any unknown (404) path. That matters beyond layout: the bar reads the
// public getDashboardData query (service-role, no session), so it would show real sales, targets and
// the platform split to anyone sitting on the sign-in page. This is an allowlist on purpose: a route
// not listed here gets no dock, so a future public page can never silently start showing it again.
// The soft-gated share pages (/dashboard, /insights) and the guest pace landing (/) are legitimate
// and stay. Admin pages live at the top level because /_authenticated is a pathless layout route.
const DOCK_PATHS = new Set<string>([
  "/", // guest landing / pace page (gear only; the page owns its own tracker, bar suppressed below)
  "/dashboard", // public read-only share dashboard (the card owns the pace; gear only in "both")
  "/insights", // soft-gated share insights
  "/financials", "/items", "/report", "/entry", "/targets", "/import", // admin pages (behind /auth)
]);

/** Whether the pace dock may render on this path. Exported so the allowlist is unit-tested directly. */
export function isDockPath(pathname: string): boolean {
  return DOCK_PATHS.has(pathname);
}

/**
 * Global pace dock: the floating gear and the slim bottom bar (per the chosen mode and page). Mounted
 * once in __root. It is purely additive: while the dashboard query is loading or errored it renders
 * the gear only and no bar, and it never blocks page content or throws. The gear works without pace
 * data because the mode lives in PaceViewProvider, not here. It renders nothing outside DOCK_PATHS
 * (the sign-in page and any 404), so no page but an app page ever shows it.
 */
export function PaceDock() {
  const { mode, open, setOpen } = usePaceView();
  const fetchData = useServerFn(getDashboardData);
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchData(), refetchOnWindowFocus: false });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const dockAllowed = isDockPath(pathname);
  // Overview (/dashboard) owns the card; the guest landing (/) is itself a pace page. The bar shows
  // everywhere else in "both", and everywhere but the landing in "bar" (and never off an app page).
  const onDashboard = pathname === "/dashboard";
  const onLanding = pathname === "/";
  const barEligible = dockAllowed && !onLanding && (mode === "bar" || (mode === "both" && !onDashboard));

  const { month, asOf } = currentPaceMonth();
  const pace = data ? computePace(data, month, asOf) : null; // null while loading/errored: no throw
  const showBar = barEligible && pace != null;

  // Close on click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, setOpen]);

  // Off an app page (sign-in, 404), render neither gear nor bar. The bar never mounts here, so its
  // effect never runs and --pace-bar-pad stays 0; navigating in from an app page unmounts the bar,
  // whose cleanup already reset the pad to 0, so the sign-in page keeps no gap.
  if (!dockAllowed) return null;

  return (
    <>
      {/* key by pathname so the mobile expand/collapse state is ephemeral: it resets to collapsed on
          navigation (the dock itself stays mounted in __root). */}
      {showBar && <PaceBar key={pathname} pace={pace!} month={month} />}
      <PaceGear mode={mode} open={open} setOpen={setOpen} lifted={showBar} />
    </>
  );
}

/**
 * The one-line pace summary: month, percentage of base, badge, chevron. Shared by the bar and the
 * Overview card so both collapse to an identical line on mobile. Cream text on gold/green, meant to
 * sit on the dark green pace surface (the bar, or the card's collapsed dark wrapper). The whole line
 * is the toggle button.
 */
export function PaceSummaryLine({ pace, month, expanded, onToggle }: {
  pace: PaceData; month: string; expanded: boolean; onToggle: () => void;
}) {
  const monthLong = new Date(month + "-01T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });
  const targetSet = pace.base > 0;
  const complete = pace.dayOfMonth >= pace.daysInMonth;
  const badge = paceBadgeState({ totalSales: pace.totalSales, base: pace.base, stretch: pace.stretch, complete });
  const badgeText = PACE_BADGE_LABEL[badge] ?? (targetSet ? `${Math.round(pace.proRatedAch)}% of pace` : "no target set");
  const pct = paceBasePct(pace.totalSales, pace.base);
  const isReached = badge === "base_reached" || badge === "stretch_reached";
  const isStretch = badge === "stretch_reached";
  const isMissed = badge === "missed";
  const badgeStyle =
    isStretch ? { background: "#EEC36A", color: "#092727" }
    : isReached ? { background: "rgba(31,122,77,.28)", color: "#8ff0b8" }
    : isMissed ? { background: "rgba(244,239,231,.13)", color: "rgba(244,239,231,.7)" }
    : { background: "rgba(244,239,231,.15)", color: "#f4efe7" };
  const pctColor = pct != null && pct >= 100 ? "var(--careem-dark-bg)" : "#EEC36A";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse pace details" : "Expand pace details"}
      className="w-full flex items-center gap-2 text-left"
    >
      <span className="font-display text-[14px] whitespace-nowrap" style={{ color: "#f4efe7" }}>{monthLong}</span>
      <span className="ml-auto font-display text-[18px] leading-none" style={{ color: pctColor }}>
        {targetSet && pct != null ? Math.round(pct) + "%" : "-"}
      </span>
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap" style={badgeStyle}>
        {badgeText}
      </span>
      <ChevronUp className="size-4 shrink-0" style={{ transform: expanded ? "none" : "rotate(180deg)", opacity: 0.85 }} />
    </button>
  );
}

export function PaceBar({ pace, month }: { pace: PaceData; month: string }) {
  const monthLong = new Date(month + "-01T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });
  const targetSet = pace.base > 0;
  const complete = pace.dayOfMonth >= pace.daysInMonth;
  const badge = paceBadgeState({ totalSales: pace.totalSales, base: pace.base, stretch: pace.stretch, complete });
  const pct = paceBasePct(pace.totalSales, pace.base);
  const talabat = pace.rows.find((r) => r.platform === "Talabat");
  const careem = pace.rows.find((r) => r.platform === "Careem");

  const scaleMax = pace.stretch ?? pace.base;
  const fillPct = scaleMax > 0 ? Math.min(pace.totalSales / scaleMax, 1) * 100 : 0;
  const baseTickPct = pace.stretch != null && scaleMax > 0 ? (pace.base / scaleMax) * 100 : null;

  const isReached = badge === "base_reached" || badge === "stretch_reached";
  const isStretch = badge === "stretch_reached";
  const isMissed = badge === "missed";
  const badgeText = PACE_BADGE_LABEL[badge] ?? (targetSet ? `${Math.round(pace.proRatedAch)}% of pace` : "no target set");

  // Mobile only: the bar collapses to a single line (month, %, badge, chevron) and expands on tap.
  // Ephemeral, resets on navigation (PaceDock keys this component by pathname). Desktop ignores it.
  const [expanded, setExpanded] = useState(false);

  // Reserve exactly the bar's height as bottom room, remeasured on resize/wrap and on expand/collapse
  // (offsetHeight of whichever of the mobile/desktop blocks is displayed). Released to 0 on unmount.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    const root = document.documentElement;
    if (!el) return;
    const set = () => root.style.setProperty("--pace-bar-pad", `${Math.ceil(el.offsetHeight) + 10}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.setProperty("--pace-bar-pad", "0px"); };
  }, []);
  // Re-measure when the mobile bar expands or collapses (height changes but the element does not resize
  // its own box synchronously before paint, so nudge the var immediately too).
  useEffect(() => {
    const el = barRef.current;
    if (el) document.documentElement.style.setProperty("--pace-bar-pad", `${Math.ceil(el.offsetHeight) + 10}px`);
  }, [expanded]);

  const detail = (
    <>
      {/* 0 to stretch track (0 to base when no stretch), yellow base tick + muted stretch tick */}
      <div className="relative h-2.5 rounded-md mt-3" style={{ background: "rgba(244,239,231,.16)" }}>
        <div className="absolute left-0 top-0 bottom-0 rounded-md" style={{ width: `${fillPct}%`, background: "#f4efe7" }} />
        {baseTickPct != null && (
          <div className="absolute -top-1 -bottom-1 w-0.5 rounded-sm" style={{ left: `${baseTickPct}%`, background: "#EEC36A" }} />
        )}
        {pace.stretch != null && (
          <div className="absolute -top-1 -bottom-1 w-0.5 rounded-sm" style={{ left: "100%", background: "rgba(244,239,231,.4)" }} />
        )}
      </div>
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2.5 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--talabat)" }} />Talabat <span className="font-semibold">{fmtInt(talabat?.sales ?? 0)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--careem-dark-bg)" }} />Careem <span className="font-semibold">{fmtInt(careem?.sales ?? 0)}</span>
        </span>
        <span style={{ color: "rgba(244,239,231,.62)" }}>Combined <span className="font-semibold" style={{ color: "#f4efe7" }}>{fmtInt(pace.totalSales)}</span> JOD</span>
        {targetSet && (
          <span className="sm:ml-auto inline-flex items-center gap-1" style={{ color: "rgba(244,239,231,.72)" }}>
            Base <b style={{ color: "#EEC36A" }}>{fmtInt(pace.base)}</b>
            {pace.stretch != null && <>{" · "}Stretch <b style={{ color: "#EEC36A" }}>{fmtInt(pace.stretch)}</b></>}
            {" JOD"}
            <InfoTip id="pace_base_stretch" side="top" className="text-white/70 hover:text-white" />
          </span>
        )}
      </div>
    </>
  );

  return (
    <div
      ref={barRef}
      className="fixed right-0 bottom-0 z-[70]"
      // The bar sits on dark green, so its text must be cream. --cream was never defined, so the old
      // text-[var(--cream)] resolved to nothing and any span without its own colour (Talabat, Careem,
      // the Day badge) fell back to the inherited #092727 foreground and rendered dark on dark.
      // --primary-foreground is the defined cream-on-dark-green token; set it here so it cascades.
      style={{ left: "var(--pace-bar-left)", background: "#092727", color: "var(--primary-foreground)", boxShadow: "0 -3px 22px rgba(9,39,39,.2)" }}
    >
      {/* MOBILE: one-line summary, chevron expands the rest. Collapsed by default; resets on nav. */}
      <div className="md:hidden px-4 py-2.5">
        <PaceSummaryLine pace={pace} month={month} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        {expanded && (
          <div className="mt-2">
            <div className="flex items-center gap-2 flex-wrap text-[10px]">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold" style={{ background: "rgba(244,239,231,.13)" }}>
                Day {pace.dayOfMonth}/{pace.daysInMonth}
              </span>
              {pace.dataThroughLabel && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold"
                      style={{ background: "rgba(244,239,231,.13)", color: pace.dataThroughStale ? "#EEC36A" : "rgba(244,239,231,.75)" }}>
                  data through {pace.dataThroughLabel}
                </span>
              )}
            </div>
            {detail}
          </div>
        )}
      </div>

      {/* DESKTOP: full bar, unchanged. */}
      <div className="hidden md:block px-6 py-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="font-display text-[15px] whitespace-nowrap" style={{ color: "#f4efe7" }}>{monthLong}</span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(244,239,231,.13)" }}>
          Day {pace.dayOfMonth}/{pace.daysInMonth}
        </span>
        {pace.dataThroughLabel && (
          <span className="hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(244,239,231,.13)", color: pace.dataThroughStale ? "#EEC36A" : "rgba(244,239,231,.75)" }}>
            data through {pace.dataThroughLabel}
          </span>
        )}
        {/* percentage + badge: their own full-width line on phones so they never collide */}
        <span className="w-full sm:w-auto sm:ml-auto flex items-center gap-2 mt-0.5 sm:mt-0">
          <span className="font-display text-[22px] leading-none" style={{ color: pct != null && pct >= 100 ? "var(--careem-dark-bg)" : "#EEC36A" }}>
            {targetSet && pct != null ? Math.round(pct) + "%" : "-"}
          </span>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-semibold whitespace-nowrap"
            style={
              isStretch ? { background: "#EEC36A", color: "#092727" }
              : isReached ? { background: "rgba(31,122,77,.28)", color: "#8ff0b8" }
              : isMissed ? { background: "rgba(244,239,231,.13)", color: "rgba(244,239,231,.7)" }
              : { background: "rgba(244,239,231,.15)", color: "#f4efe7" }
            }
          >
            {badgeText}
          </span>
          <InfoTip id="pace_bar" side="top" className="text-white/70 hover:text-white" />
        </span>
      </div>

      {/* 0 to stretch track (0 to base when no stretch), yellow base tick + muted stretch tick */}
      <div className="relative h-2.5 rounded-md mt-3" style={{ background: "rgba(244,239,231,.16)" }}>
        <div className="absolute left-0 top-0 bottom-0 rounded-md" style={{ width: `${fillPct}%`, background: "#f4efe7" }} />
        {baseTickPct != null && (
          <div className="absolute -top-1 -bottom-1 w-0.5 rounded-sm" style={{ left: `${baseTickPct}%`, background: "#EEC36A" }} />
        )}
        {pace.stretch != null && (
          <div className="absolute -top-1 -bottom-1 w-0.5 rounded-sm" style={{ left: "100%", background: "rgba(244,239,231,.4)" }} />
        )}
      </div>

      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2.5 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--talabat)" }} />Talabat <span className="font-semibold">{fmtInt(talabat?.sales ?? 0)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--careem-dark-bg)" }} />Careem <span className="font-semibold">{fmtInt(careem?.sales ?? 0)}</span>
        </span>
        <span style={{ color: "rgba(244,239,231,.62)" }}>Combined <span className="font-semibold" style={{ color: "#f4efe7" }}>{fmtInt(pace.totalSales)}</span> JOD</span>
        {targetSet && (
          <span className="sm:ml-auto inline-flex items-center gap-1" style={{ color: "rgba(244,239,231,.72)" }}>
            Base <b style={{ color: "#EEC36A" }}>{fmtInt(pace.base)}</b>
            {pace.stretch != null && <>{" · "}Stretch <b style={{ color: "#EEC36A" }}>{fmtInt(pace.stretch)}</b></>}
            {" JOD"}
            <InfoTip id="pace_base_stretch" side="top" className="text-white/70 hover:text-white" />
          </span>
        )}
      </div>
      </div>
    </div>
  );
}

function PaceGear({ mode, open, setOpen, lifted }: {
  mode: PaceViewMode; open: boolean; setOpen: (b: boolean) => void; lifted: boolean;
}) {
  const { setMode } = usePaceView();
  const OPTS: { m: PaceViewMode; t: string; d: string }[] = [
    { m: "card", t: "Card only", d: "Full card on Overview. Nothing on other pages." },
    { m: "both", t: "Both", d: "Card on Overview, slim bar everywhere else. The default." },
    { m: "bar", t: "Bar only", d: "No card. Slim bar on every page, Overview included." },
  ];
  return (
    <div
      className="fixed right-[15px] md:right-[22px] z-[95] transition-[bottom] duration-200"
      // Sit clear of the bar by tracking its measured height (--pace-bar-pad already includes a 10px
      // gap). Because it follows the real height, the collapsed mobile bar lifts the gear far less
      // than the old fixed 128px did, which also shrinks the Overview/Insights jump.
      style={{ bottom: lifted ? "calc(env(safe-area-inset-bottom, 0px) + var(--pace-bar-pad, 0px) + 12px)" : "22px" }}
      onClick={(e) => e.stopPropagation()}
    >
      {open && (
        <div className="absolute right-0 bottom-14 w-[min(296px,calc(100vw-30px))] rounded-2xl bg-card border border-border p-4 shadow-xl">
          <h4 className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-0.5">Pace tracker view</h4>
          <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">Where the monthly target appears while you browse. Saved to your profile.</p>
          {OPTS.map((o) => {
            const on = o.m === mode;
            return (
              <button
                key={o.m}
                type="button"
                onClick={() => { setMode(o.m); setOpen(false); }}
                className={`flex gap-2.5 w-full text-left rounded-xl border p-2.5 mb-2 last:mb-0 items-start transition-colors ${
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"
                }`}
              >
                <span className={`w-3 h-3 rounded-full border-[1.5px] mt-0.5 shrink-0 ${on ? "border-[#EEC36A] bg-[#EEC36A]" : "border-muted-foreground"}`} />
                <span>
                  <span className="block text-[12.5px] font-semibold">{o.t}</span>
                  <span className={`block text-[10.5px] leading-snug mt-0.5 ${on ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{o.d}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        aria-label="Pace tracker view"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-11 h-11 rounded-full grid place-items-center text-lg shadow-lg transition-colors"
        style={open ? { background: "#EEC36A", color: "#092727" } : { background: "#092727", color: "#f4efe7" }}
      >
        {"⚙"}
      </button>
    </div>
  );
}
