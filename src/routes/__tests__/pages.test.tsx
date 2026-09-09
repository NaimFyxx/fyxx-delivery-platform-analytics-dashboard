import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildFixture } from "@/test/fixture";

// Mount tests: the direct answer to a route throwing at runtime while tsc and build both passed.
// We seed react-query with the golden fixture and mock the router / auth / server-fn boundaries, then
// assert the RENDERED figures. Time is pinned to 2026-09-15 so the default range settles on "last"
// (August), whose numbers are deterministic.
vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return {
    ...actual,
    createFileRoute: () => (opts: unknown) => ({ ...(opts as object), useRouteContext: () => ({}), useSearch: () => ({}) }),
    Link: ({ children, to, ...rest }: { children?: React.ReactNode; to?: string }) =>
      React.createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children),
    useRouter: () => ({ invalidate: () => {} }),
    useNavigate: () => () => {},
    useSearch: () => ({}), // filters read from the URL; empty means the smart default
    useRouterState: (opts?: { select?: (s: unknown) => unknown }) =>
      opts?.select ? opts.select({ location: { pathname: "/dashboard" } }) : { location: { pathname: "/dashboard" } },
    retainSearchParams: () => () => ({}),
    Outlet: () => null,
  };
});
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn }),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/hooks/use-soft-gate", () => ({
  UNLOCK_KEY: "tgr_dash_unlock",
  useSoftGate: () => ({ adminUser: { email: "admin@test" }, sessionChecked: true, handleSignOut: () => {} }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({ select: () => ({ data: [], error: null }) }),
  },
}));

import { PublicDashboard, Header } from "@/routes/dashboard";
import { InsightsPage } from "@/routes/insights";
import { Financials } from "@/routes/_authenticated/financials";
import { PaceBar, isDockPath } from "@/components/fyxx/pace-dock";

function mountPage(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  qc.setQueryData(["dashboard"], buildFixture());
  qc.setQueryData(["item_aliases"], {});
  qc.setQueryData(["item_categories"], {});
  return render(React.createElement(QueryClientProvider, { client: qc }, ui));
}

beforeEach(() => vi.setSystemTime(new Date("2026-09-15T12:00:00Z")));
afterEach(() => vi.useRealTimers());

describe("Overview (Dashboard) renders August figures from the money trail", () => {
  it("mounts and shows August net margin 53.2% and net profit 318, plus the Monthly Average card", async () => {
    mountPage(React.createElement(PublicDashboard));
    await waitFor(() => expect(screen.getByText("Net Profit Kept")).toBeInTheDocument());
    expect(screen.getByText("53.2")).toBeInTheDocument(); // net margin
    expect(screen.getByText("318")).toBeInTheDocument(); // net profit (fmtInt of 317.51)
    expect(screen.getByText("68.0")).toBeInTheDocument(); // product margin
    expect(screen.getByText("Monthly Average")).toBeInTheDocument(); // new KPI card present
  });
});

describe("Pace bar renders the base/stretch badge", () => {
  it("shows Stretch reached and the base+stretch row", () => {
    const pace = {
      rows: [
        { platform: "Talabat" as const, sales: 700, target: 590, achievement: 0 },
        { platform: "Careem" as const, sales: 500, target: 410, achievement: 0 },
      ],
      totalSales: 1200, totalTarget: 1000, totalAchievement: 120, proRated: 0, proRatedAch: 0,
      dayOfMonth: 20, daysInMonth: 30, workingDay: 18, dataThroughLabel: null, dataThroughStale: false,
      perPlatformThrough: [], base: 1000, stretch: 1150,
    };
    mountPage(React.createElement(PaceBar, { pace, month: "2026-09" }));
    // jsdom applies no CSS, so both the mobile (collapsed) summary and the desktop block render, which
    // duplicates the month, percentage and badge. The base/stretch detail lives only in the desktop
    // block here (mobile shows it on expand), so it is single.
    expect(screen.getAllByText("Stretch reached").length).toBeGreaterThan(0);
    expect(screen.getAllByText("120%").length).toBeGreaterThan(0); // percent of base, not stretch
    expect(screen.getByText("1,000")).toBeInTheDocument(); // base value
    expect(screen.getByText("1,150")).toBeInTheDocument(); // stretch value
    // The Talabat/Careem figures render, and the bar sets an explicit cream text colour on a defined
    // token (not the undefined --cream that made those spans dark-on-dark). Guards that regression.
    expect(screen.getByText("Talabat")).toBeInTheDocument();
    expect(screen.getByText("Careem")).toBeInTheDocument();
    const bar = document.querySelector(".fixed.bottom-0") as HTMLElement;
    expect(bar.style.color).toBe("var(--primary-foreground)");
    expect(bar.className).not.toContain("--cream");
    // The mobile summary carries a chevron toggle to expand the rest.
    expect(screen.getByRole("button", { name: /expand pace details/i })).toBeInTheDocument();
  });
});

describe("Header freshness reads the real calendar today against the coverage date", () => {
  // The bug was today === coverage date, so days was always 0 and only "current" ever showed. These
  // pin the real clock and pass a coverage date (the earlier platform's last order date), proving the
  // staleness branches are now live. now = 2026-09-15 from beforeEach.
  const mountHeader = (coverageDate: string | null) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(React.createElement(QueryClientProvider, { client: qc },
      React.createElement(Header, { coverageDate, showNav: false })));
  };
  // The Header renders the freshness text in both its mobile and desktop rows, so it appears twice.
  const seen = (t: string) => expect(screen.getAllByText(t).length).toBeGreaterThan(0);
  it("shows 'Data current as of' when coverage is today or yesterday", () => {
    mountHeader("2026-09-14");
    seen("Data current as of 14 Sept");
  });
  it("shows 'Updated N days ago' when the import is a few days behind", () => {
    mountHeader("2026-09-12");
    seen("Updated 3 days ago (12 Sept)");
  });
  it("shows a stale warning when the import is well behind", () => {
    mountHeader("2026-09-05");
    seen("⚠ Stale, last update 10 days ago (5 Sept)");
  });
  it("shows 'No data yet' when there is no order coverage", () => {
    mountHeader(null);
    seen("No data yet");
  });
});

describe("Pace dock only renders on app pages (not sign-in or 404)", () => {
  it("allows the pace, dashboard and admin pages", () => {
    for (const p of ["/", "/dashboard", "/insights", "/financials", "/items", "/report", "/entry", "/targets", "/import"]) {
      expect(isDockPath(p)).toBe(true);
    }
  });
  it("blocks the sign-in page and any unknown (404) path", () => {
    expect(isDockPath("/auth")).toBe(false);
    expect(isDockPath("/nope")).toBe(false);
    expect(isDockPath("/dashboard/extra")).toBe(false); // exact match only, no accidental prefix leak
  });
});

describe("Financials renders August totals from the money trail", () => {
  it("mounts and shows the August gross and net profit totals", async () => {
    mountPage(React.createElement(Financials));
    await waitFor(() => expect(screen.getByText("TOTALS")).toBeInTheDocument());
    expect(screen.getByText("JOD 1,011.28")).toBeInTheDocument(); // August gross
    expect(screen.getByText("JOD 317.51")).toBeInTheDocument(); // August net profit
  });
});

describe("Insights mounts without throwing", () => {
  it("renders the item table sourced from the shared data", async () => {
    mountPage(React.createElement(InsightsPage));
    // The page mounting at all is the primary assertion (a lazy route threw at runtime before).
    await waitFor(() => expect(screen.getByText(/Top Products/i)).toBeInTheDocument());
  });
});
