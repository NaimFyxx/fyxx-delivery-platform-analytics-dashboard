import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/* ---------- Date picker (YYYY-MM-DD) ---------- */
export interface DatePickerProps {
  value: string; // YYYY-MM-DD or ""
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, placeholder = "Pick a date", className, disabled }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const valid = date && isValid(date) ? date : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start text-left font-normal", !valid && "text-muted-foreground", className)}
        >
          <CalendarIcon className="mr-2 size-4" />
          {valid ? format(valid, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={valid}
          captionLayout="dropdown"
          onSelect={(d) => {
            if (d) {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              onChange(`${y}-${m}-${day}`);
              setOpen(false);
            }
          }}
          initialFocus
          className={cn("pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Month picker (YYYY-MM) ---------- */
export interface MonthPickerProps {
  value: string; // YYYY-MM or ""
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function MonthPicker({ value, onChange, placeholder = "Pick a month", className, disabled }: MonthPickerProps) {
  const [open, setOpen] = React.useState(false);
  const valid = /^\d{4}-\d{2}$/.test(value);
  const [vy, vm] = valid ? value.split("-").map(Number) : [new Date().getFullYear(), 0];
  const [year, setYear] = React.useState<number>(valid ? vy : new Date().getFullYear());

  React.useEffect(() => { if (valid) setYear(vy); }, [value, valid, vy]);

  const label = valid
    ? `${MONTH_NAMES[vm - 1]} ${vy}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start text-left font-normal", !valid && "text-muted-foreground", className)}
        >
          <CalendarIcon className="mr-2 size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 pointer-events-auto" align="start">
        <div className="flex items-center justify-between mb-3">
          <Button type="button" size="icon" variant="ghost" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-sm font-semibold">{year}</div>
          <Button type="button" size="icon" variant="ghost" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_NAMES.map((name, i) => {
            const selected = valid && vy === year && vm === i + 1;
            return (
              <Button
                key={name}
                type="button"
                size="sm"
                variant={selected ? "default" : "ghost"}
                className={cn("h-8 text-xs", selected && "bg-primary text-primary-foreground")}
                onClick={() => {
                  onChange(`${year}-${String(i + 1).padStart(2, "0")}`);
                  setOpen(false);
                }}
              >
                {name}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}