import type { ReactNode } from "react";
import { FreshnessLabel } from "@/components/fyxx/freshness-label";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>}
      </div>
      <div className="flex items-center gap-3">
        {/* Same freshness statement, same words, as the Overview/Insights header: the admin pages
            are where money decisions get made, so they must show how current the data is too. */}
        <FreshnessLabel />
        {actions && <div className="flex gap-2 items-center">{actions}</div>}
      </div>
    </div>
  );
}
