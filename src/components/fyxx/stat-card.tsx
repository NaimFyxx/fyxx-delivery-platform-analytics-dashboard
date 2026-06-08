import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function StatCard({
  label, value, sub, accent = false, icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Card className={cn(
      "p-5 relative overflow-hidden",
      accent && "bg-gradient-surface border-primary/30 shadow-glow"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
          <div className="mt-2 text-3xl font-display font-bold text-num">{value}</div>
          {sub != null && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        {icon && <div className="text-primary/80">{icon}</div>}
      </div>
    </Card>
  );
}