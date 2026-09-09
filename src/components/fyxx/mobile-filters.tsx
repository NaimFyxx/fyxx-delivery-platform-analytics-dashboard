import { useState, type ReactNode } from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";

/**
 * Mobile filter shelf. On phones the filter chips collapse behind one "Filters" toggle that shows the
 * active range and platform, so real data reaches above the fold. On desktop (md and up) the children
 * render inline exactly as before: the toggle is md:hidden, the row is md:flex. State is ephemeral and
 * local, so it resets whenever the page unmounts.
 */
export function MobileFilters({
  summary,
  children,
  className = "mb-4",
}: {
  summary: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="md:hidden inline-flex items-center gap-2 h-9 px-3 rounded-full border border-border bg-card text-xs font-medium text-foreground"
      >
        <SlidersHorizontal className="size-3.5" />
        Filters
        {summary && <span className="text-muted-foreground truncate max-w-[180px]">{summary}</span>}
        <ChevronDown className="size-3.5 shrink-0" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      <div className={`${open ? "flex" : "hidden"} md:flex flex-wrap gap-3 mt-2 md:mt-0 items-center`}>
        {children}
      </div>
    </div>
  );
}
