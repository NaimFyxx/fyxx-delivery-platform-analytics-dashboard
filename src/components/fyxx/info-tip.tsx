import { useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EXPLAINERS } from "@/lib/explainers";

export function InfoTip({
  id,
  side = "top",
}: {
  id: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const exp = EXPLAINERS[id];
  if (!exp) return null;

  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  const scheduleClose = () => {
    timer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-full ml-0.5 align-middle"
          onMouseEnter={() => { cancelClose(); setOpen(true); }}
          onMouseLeave={scheduleClose}
          aria-label={`Explain: ${exp.label}`}
        >
          <span className="text-[12px] leading-none select-none">ⓘ</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        sideOffset={6}
        className="w-[280px] p-3 text-[12px] leading-relaxed z-[200]"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="font-semibold text-[13px] mb-1 text-foreground">{exp.label}</p>
        <p className="text-muted-foreground mb-2">{exp.meaning}</p>
        {exp.formula && (
          <p className="font-mono bg-muted rounded px-2 py-1 text-[11px] mb-1.5 text-foreground">{exp.formula}</p>
        )}
        {exp.example && (
          <p className="text-[11px] text-muted-foreground/80 italic">{exp.example}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
