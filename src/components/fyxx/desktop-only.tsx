import type { ReactNode } from "react";
import { Monitor } from "lucide-react";

/** Show children on md+ screens; on phones show a short "available on desktop" note instead, so
 *  desk-work routes are not usable at narrow width even if reached by URL. Pure CSS (no JS), so it
 *  is SSR-safe with no flash and never renders the heavy page on a phone. */
export function DesktopOnly({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="hidden md:block">{children}</div>
      <div className="md:hidden p-6">
        <div className="mt-20 mx-auto max-w-sm text-center flex flex-col items-center gap-3">
          <Monitor className="size-8 text-muted-foreground" />
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This page is available on desktop. Open the dashboard on a larger screen to use it.
          </p>
        </div>
      </div>
    </>
  );
}
