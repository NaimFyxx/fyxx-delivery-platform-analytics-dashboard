import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminSidebar } from "@/components/fyxx/admin-sidebar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  const router = useRouter();
  const { user } = Route.useRouteContext();

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <AdminSidebar email={user.email ?? ""} onSignOut={signOut} />
      {/* Reserve the fixed pace bar's height on this content column only (this layout window-scrolls,
          so the reservation cannot live on body without clamping the sticky full-height sidebar). */}
      <main className="flex-1 min-w-0" style={{ paddingBottom: "var(--pace-bar-pad, 0px)" }}>
        <Outlet />
      </main>
    </div>
  );
}
