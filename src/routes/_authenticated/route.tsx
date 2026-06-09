import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, LineChart, Utensils, Target, PenSquare, Upload, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import tgrLogoLight from "@/assets/tgr-logo-light.svg";
import fyxxLogo from "@/assets/fyxx-logo-white.svg";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/financials", label: "Financials", icon: LineChart },
  { to: "/items", label: "Items", icon: Utensils },
  { to: "/targets", label: "Targets", icon: Target },
  { to: "/entry", label: "Data entry", icon: PenSquare },
  { to: "/import", label: "CSV import", icon: Upload },
] as const;

function Layout() {
  const router = useRouter();
  const { user } = Route.useRouteContext();

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="px-6 py-6">
          <Link to="/dashboard" className="block">
            <img src={tgrLogoLight} alt="The Green Room" className="h-10 w-auto" />
          </Link>
          <div className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/60 mt-3">Delivery Tracker</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors [&.active]:bg-sidebar-accent [&.active]:text-sidebar-foreground [&.active]:font-medium"
              activeProps={{ className: "active" }}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 text-xs text-sidebar-foreground/70 truncate">{user.email}</div>
          <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
            <LogOut className="size-4 mr-2" /> Sign out
          </Button>
          <div className="mt-3 px-3 flex items-center gap-1.5 text-[10px] text-sidebar-foreground/40">
            <span>TGR</span>
            <span>×</span>
            <img src={fyxxLogo} alt="Fyxx" className="h-2.5 w-auto opacity-70" />
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar">
          <Link to="/dashboard">
            <img src={tgrLogoLight} alt="The Green Room" className="h-7 w-auto" />
          </Link>
          <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="size-4" /></Button>
        </div>
        <div className="md:hidden flex overflow-x-auto gap-1 px-2 py-2 border-b border-border bg-sidebar">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex items-center gap-2 whitespace-nowrap px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent [&.active]:bg-sidebar-accent [&.active]:text-sidebar-foreground" activeProps={{ className: "active" }}>
              <Icon className="size-3.5" /> {label}
            </Link>
          ))}
        </div>
        <Outlet />
      </main>
    </div>
  );
}