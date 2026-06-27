import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart2, LayoutDashboard, LineChart, LogOut, PenSquare, Target, Upload, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import tgrLogoLight from "@/assets/tgr-logo-light.svg";
import fyxxLogo from "@/assets/fyxx-logo-white.svg";

export const ADMIN_NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/insights", label: "Insights", icon: BarChart2 },
  { to: "/financials", label: "Financials", icon: LineChart },
  { to: "/items", label: "Items", icon: Utensils },
  { to: "/targets", label: "Targets", icon: Target },
  { to: "/entry", label: "Data entry", icon: PenSquare },
  { to: "/import", label: "CSV import", icon: Upload },
] as const;

export function AdminSidebar({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <>
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="px-6 py-6">
          <Link to="/dashboard" className="block">
            <img src={tgrLogoLight} alt="The Green Room" className="h-10 w-auto" />
          </Link>
          <div className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/60 mt-3">Delivery Tracker</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
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
          <div className="px-3 py-2 text-xs text-sidebar-foreground/70 truncate">{email}</div>
          <Button variant="ghost" className="w-full justify-start" onClick={onSignOut}>
            <LogOut className="size-4 mr-2" /> Sign out
          </Button>
          <div className="mt-3 px-3 flex items-center gap-1.5 text-[10px] text-sidebar-foreground/40">
            <span>TGR</span><span>×</span>
            <img src={fyxxLogo} alt="Fyxx" className="h-2.5 w-auto opacity-70" />
          </div>
        </div>
      </aside>
      <div className="md:hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar">
          <Link to="/dashboard">
            <img src={tgrLogoLight} alt="The Green Room" className="h-7 w-auto" />
          </Link>
          <Button size="sm" variant="ghost" onClick={onSignOut}><LogOut className="size-4" /></Button>
        </div>
        <div className="flex overflow-x-auto gap-1 px-2 py-2 border-b border-border bg-sidebar">
          {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 whitespace-nowrap px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent [&.active]:bg-sidebar-accent [&.active]:text-sidebar-foreground"
              activeProps={{ className: "active" }}
            >
              <Icon className="size-3.5" /> {label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

export function AdminShell({
  admin,
  onSignOut,
  children,
}: {
  admin: { email: string } | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  if (!admin) return <>{children}</>;
  return (
    <div className="min-h-screen bg-background flex">
      <AdminSidebar email={admin.email} onSignOut={onSignOut} />
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
