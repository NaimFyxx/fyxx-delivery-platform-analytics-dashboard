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

import { PublicDashboard } from "@/routes/dashboard";
import { InsightsPage } from "@/routes/insights";
import { Financials } from "@/routes/_authenticated/financials";

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
  it("mounts and shows August net margin 53.2% and net profit 318", async () => {
    mountPage(React.createElement(PublicDashboard));
    await waitFor(() => expect(screen.getByText("Net Profit Kept")).toBeInTheDocument());
    expect(screen.getByText("53.2")).toBeInTheDocument(); // net margin
    expect(screen.getByText("318")).toBeInTheDocument(); // net profit (fmtInt of 317.51)
    expect(screen.getByText("68.0")).toBeInTheDocument(); // product margin
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
