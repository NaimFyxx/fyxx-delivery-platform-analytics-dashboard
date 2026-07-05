import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart2, LayoutDashboard, LineChart, LogOut, Menu, PenSquare, Target, Upload, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import tgrLogoLight from "@/assets/tgr-logo-light.svg";
import fyxxLogo from "@/assets/fyxx-logo-white.svg";

/** Nav grouped into labelled sections. Headings show when the rail is expanded; a thin
 *  divider stands in for them on the collapsed icon rail. */
export const NAV_GROUPS = [
  {
    heading: "Analytics",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { to: "/insights", label: "Insights", icon: BarChart2 },
      { to: "/financials", label: "Financials", icon: LineChart },
      { to: "/items", label: "Items", icon: Utensils },
    ],
  },
  {
    heading: "Planning",
    items: [{ to: "/targets", label: "Targets", icon: Target }],
  },
  {
    heading: "Data",
    items: [
      { to: "/entry", label: "Data entry", icon: PenSquare },
      { to: "/import", label: "CSV import", icon: Upload },
    ],
  },
];

/** Flat list of every destination (kept for any consumer that wants the whole nav). */
export const ADMIN_NAV = NAV_GROUPS.flatMap((g) => g.items);

export function AdminSidebar({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  // Default = expanded on every load. `collapsed` is the pinned state (burger); `hovering`
  // temporarily reveals the labels as an overlay flyout while collapsed.
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const expanded = !collapsed || hovering;

  const navLink = (to: string, label: string, Icon: typeof LayoutDashboard) => (
    <Link
      key={to}
      to={to}
      title={!expanded ? label : undefined}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors whitespace-nowrap [&.active]:bg-sidebar-accent [&.active]:text-sidebar-foreground [&.active]:font-medium"
      activeProps={{ className: "active" }}
    >
      <Icon className="size-4 shrink-0" />
      <span className={`transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"}`}>{label}</span>
    </Link>
  );

  return (
    <>
      {/* Desktop: sticky full-height rail. The flow width follows the PINNED state so the
          hover flyout overlays the content instead of pushing it. */}
      <aside
        className={`hidden md:block sticky top-0 self-start h-screen shrink-0 z-[60] transition-[width] duration-200 ease-out ${collapsed ? "w-14" : "w-64"}`}
      >
        <div
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          className={`absolute inset-y-0 left-0 h-screen flex flex-col border-r border-border bg-sidebar overflow-hidden transition-[width] duration-200 ease-out ${expanded ? "w-64" : "w-14"} ${collapsed && hovering ? "shadow-xl" : ""}`}
        >
          {/* Burger + logo */}
          <div className="flex items-center gap-2 px-3 pt-5 pb-1">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="p-1.5 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0"
            >
              <Menu className="size-5" />
            </button>
            <Link
              to="/dashboard"
              className={`transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            >
              <img src={tgrLogoLight} alt="The Green Room" className="h-8 w-auto max-w-none" />
            </Link>
          </div>
          <div
            className={`px-4 pb-3 text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/60 whitespace-nowrap transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"}`}
          >
            Delivery Tracker
          </div>

          {/* Grouped nav */}
          <nav className="flex-1 px-2 pb-2 overflow-y-auto overflow-x-hidden">
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.heading} className={gi > 0 ? "mt-3" : ""}>
                {expanded ? (
                  <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 whitespace-nowrap">
                    {group.heading}
                  </div>
                ) : (
                  gi > 0 && <div className="mx-2.5 my-2 border-t border-sidebar-border/60" />
                )}
                <div className="space-y-0.5">
                  {group.items.map(({ to, label, icon }) => navLink(to, label, icon))}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-2 border-t border-sidebar-border">
            {expanded && (
              <div className="px-3 py-2 text-xs text-sidebar-foreground/70 truncate">{email}</div>
            )}
            <Button
              variant="ghost"
              onClick={onSignOut}
              title={!expanded ? "Sign out" : undefined}
              className={`w-full ${expanded ? "justify-start" : "justify-center px-0"}`}
            >
              <LogOut className="size-4 shrink-0" />
              {expanded && <span className="ml-2">Sign out</span>}
            </Button>
            {expanded && (
              <div className="mt-3 px-3 flex items-center gap-1.5 text-[10px] text-sidebar-foreground/40 whitespace-nowrap">
                <span>TGR</span><span>×</span>
                <img src={fyxxLogo} alt="Fyxx" className="h-2.5 w-auto opacity-70" />
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile: top strip nav (unchanged behavior; groups get a thin separator). */}
      <div className="md:hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar">
          <Link to="/dashboard">
            <img src={tgrLogoLight} alt="The Green Room" className="h-7 w-auto" />
          </Link>
          <Button size="sm" variant="ghost" onClick={onSignOut}><LogOut className="size-4" /></Button>
        </div>
        <div className="flex overflow-x-auto gap-1 px-2 py-2 border-b border-border bg-sidebar">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.heading} className="flex items-center gap-1 shrink-0">
              {gi > 0 && <div className="w-px h-5 bg-sidebar-border/60 mx-1 shrink-0" />}
              {group.items.map(({ to, label, icon: Icon }) => (
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
