import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useMemo, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

// A stale-chunk error is what a lazily loaded route throws when the browser is still running the
// previous build's shell and asks for a chunk filename that a fresh publish has removed. It is a
// deployment artefact, not a real bug: the current build serves the code under new filenames, so a
// full reload fixes it. We match it on the messages the three engines use (Chrome/Edge, Firefox,
// Safari) plus Vite's own ChunkLoadError name and CSS-preload failure. Genuine runtime errors do
// not match, so they fall straight through to the error boundary.
function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const { name, message } = error as { name?: string; message?: string };
  if (name === "ChunkLoadError") return true;
  const m = message ?? "";
  return (
    /error loading dynamically imported module/i.test(m) || // Firefox
    /Failed to fetch dynamically imported module/i.test(m) || // Chrome / Edge
    /Importing a module script failed/i.test(m) || // Safari
    /Unable to preload CSS/i.test(m) // Vite CSS preload
  );
}

// One auto-reload per short window. We stamp the time of the reload we trigger; if another stale
// chunk error arrives within the window, the fresh build did NOT fix it (a genuinely broken deploy),
// so we stop reloading and show the boundary. The stamp self-expires, so a later publish can recover
// again without us ever clearing a flag by hand. sessionStorage keeps it to the one tab.
const CHUNK_RELOAD_KEY = "tgr_chunk_reload_at";
const CHUNK_RELOAD_WINDOW_MS = 10_000;

function shouldAutoReload(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    return !last || Date.now() - last > CHUNK_RELOAD_WINDOW_MS;
  } catch {
    return true; // sessionStorage blocked: still worth a single reload attempt
  }
}
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  // Stale-chunk errors recover with a full reload, not a plain retry (the old "Try again" reran the
  // same missing chunk). Decide once, before paint, so we can reload instead of flashing the error.
  const willReload = useMemo(() => isChunkLoadError(error) && shouldAutoReload(), [error]);

  useEffect(() => {
    if (willReload) {
      try {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
      } catch {
        // ignore: without a stamp we simply cannot loop-guard, and the reload below still runs once
      }
      // Full document reload: fetches the fresh HTML shell and the current chunk manifest.
      window.location.reload();
      return;
    }
    // Genuine error, or a chunk error a reload already failed to fix: log and report as before.
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [willReload, error]);

  // While the reload is in flight, do not flash "This page didn't load".
  if (willReload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading the latest version...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TGR Delivery Tracker" },
      { name: "description", content: "Performance dashboard for Talabat and Careem delivery sales." },
      { name: "author", content: "The Green Room" },
      { property: "og:title", content: "TGR Delivery Tracker" },
      { property: "og:description", content: "Performance dashboard for Talabat and Careem delivery sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Favicon: TGR monogram (cream) on brand dark green #092727. SVG is preferred by modern
      // browsers; the .ico is the fallback that also stops the automatic /favicon.ico 404.
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Outfit:wght@300;400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
