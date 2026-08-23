import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DatePicker } from "@/components/fyxx/date-picker";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { PLATFORMS, logImport, type Platform } from "@/lib/fyxx";
import { canonicalItemName } from "@/lib/costs";
import { loadDbAliases } from "@/lib/aliases";
import { CATEGORIES } from "@/lib/categories";

const today = () => new Date().toISOString().slice(0, 10);

/** Add a brand-new product in one pass: registers it via a dated cost row, a set price per
 *  selected platform, and its category. Writes only to existing tables (item_costs,
 *  item_prices, item_categories); it never touches the importer, VAT, margin, or the
 *  effective-from evaluation logic. Reachable from the Items page and Data entry. */
export function AddProductDialog({
  variant = "outline",
  size = "sm",
  className,
  label = "Add product",
}: {
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [cost, setCost] = useState("");
  const [onTalabat, setOnTalabat] = useState(true);
  const [onCareem, setOnCareem] = useState(true);
  const [separate, setSeparate] = useState(false);
  // Shared price/date apply to every selected platform unless "separate" is on.
  const [sharedPrice, setSharedPrice] = useState("");
  const [sharedDate, setSharedDate] = useState(today());
  const [talPrice, setTalPrice] = useState("");
  const [talDate, setTalDate] = useState(today());
  const [carPrice, setCarPrice] = useState("");
  const [carDate, setCarDate] = useState(today());

  const { data: dbAliases = {} } = useQuery({
    queryKey: ["item_aliases"],
    queryFn: loadDbAliases,
    staleTime: 60_000,
  });

  // Every known item's canonical name — for duplicate detection (costs, prices, sales).
  const { data: existingCanon = new Set<string>() } = useQuery({
    queryKey: ["all_item_canon", dbAliases],
    queryFn: async () => {
      const [c, p, s] = await Promise.all([
        supabase.from("item_costs").select("item_name"),
        supabase.from("item_prices").select("item_name"),
        supabase.from("monthly_item_sales").select("item_name"),
      ]);
      const set = new Set<string>();
      for (const r of [...(c.data ?? []), ...(p.data ?? []), ...(s.data ?? [])]) {
        set.add(canonicalItemName(r.item_name, dbAliases));
      }
      return set;
    },
    staleTime: 30_000,
  });

  const selected: Platform[] = useMemo(
    () => PLATFORMS.filter((p) => (p === "Talabat" ? onTalabat : onCareem)),
    [onTalabat, onCareem],
  );

  const perPlatform = (p: Platform) =>
    separate
      ? p === "Talabat"
        ? { price: talPrice, date: talDate }
        : { price: carPrice, date: carDate }
      : { price: sharedPrice, date: sharedDate };

  const isDuplicate = !!name.trim() && existingCanon.has(canonicalItemName(name, dbAliases));

  const pricesFilled = selected.every((p) => {
    const { price, date } = perPlatform(p);
    return price.trim() !== "" && Number(price) >= 0 && !!date;
  });

  const valid =
    name.trim() !== "" &&
    category !== "" &&
    cost.trim() !== "" &&
    Number(cost) >= 0 &&
    selected.length > 0 &&
    pricesFilled &&
    !isDuplicate;

  function reset() {
    setName("");
    setCategory("");
    setCost("");
    setOnTalabat(true);
    setOnCareem(true);
    setSeparate(false);
    setSharedPrice("");
    setSharedDate(today());
    setTalPrice("");
    setTalDate(today());
    setCarPrice("");
    setCarDate(today());
  }

  const save = useMutation({
    mutationFn: async () => {
      const nm = name.trim();
      const plans = selected.map((p) => ({ platform: p, ...perPlatform(p) }));
      // Cost is shared and effective from the earliest platform launch date.
      const earliest = plans.map((x) => x.date).sort()[0];

      const cRes = await supabase
        .from("item_costs")
        .insert({ item_name: nm, cost_exvat: Number(cost), effective_from: earliest });
      if (cRes.error) throw cRes.error;

      const pRes = await supabase.from("item_prices").insert(
        plans.map((x) => ({
          item_name: nm,
          platform: x.platform,
          price_incl_vat: Number(x.price),
          effective_from: x.date,
        })),
      );
      if (pRes.error) throw pRes.error;

      const catRes = await supabase
        .from("item_categories")
        .upsert({ item_key: canonicalItemName(nm, dbAliases), category }, { onConflict: "item_key" });
      if (catRes.error) throw catRes.error;

      await logImport({ platform: "—", report_type: "invoice", file_name: `new product: ${nm}` });
    },
    onSuccess: () => {
      toast.success(`Added “${name.trim()}”`);
      [
        "item_costs", "item_prices", "item_categories",
        "entry_costs", "entry_item_prices", "entry_item_names",
        "all_item_names", "all_item_canon", "monthly_item_sales_all",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const priceStep = "0.001";

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Plus className="size-3.5 mr-1.5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
            <DialogDescription>
              Create a new menu item with its category, cost and set price in one step. Category and
              cost apply to both platforms; price and launch date can be shared or set per platform.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Item name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grilled Halloumi" autoFocus />
              {isDuplicate && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  This item already exists. Edit its cost, price or category from Data entry or the Items page instead.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cost / COGS (ex-VAT, JOD)</Label>
                <Input type="number" step="0.0001" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.000" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">On which platforms</Label>
              <div className="flex items-center gap-5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={onTalabat} onCheckedChange={(v) => setOnTalabat(!!v)} /> Talabat
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={onCareem} onCheckedChange={(v) => setOnCareem(!!v)} /> Careem
                </label>
              </div>
              {selected.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Pick at least one platform.</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label className="text-xs cursor-pointer" htmlFor="sep-toggle">Set price and date separately per platform</Label>
              <Switch id="sep-toggle" checked={separate} onCheckedChange={setSeparate} disabled={selected.length < 2} />
            </div>

            {!separate ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Price (incl VAT, JOD)</Label>
                  <Input type="number" step={priceStep} min="0" value={sharedPrice} onChange={(e) => setSharedPrice(e.target.value)} placeholder="0.000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date added</Label>
                  <DatePicker value={sharedDate} onChange={setSharedDate} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {onTalabat && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs" style={{ color: "#FF5A00" }}>Talabat price (incl VAT)</Label>
                      <Input type="number" step={priceStep} min="0" value={talPrice} onChange={(e) => setTalPrice(e.target.value)} placeholder="0.000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs" style={{ color: "#FF5A00" }}>Talabat date added</Label>
                      <DatePicker value={talDate} onChange={setTalDate} />
                    </div>
                  </div>
                )}
                {onCareem && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs" style={{ color: "#1BD15D" }}>Careem price (incl VAT)</Label>
                      <Input type="number" step={priceStep} min="0" value={carPrice} onChange={(e) => setCarPrice(e.target.value)} placeholder="0.000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs" style={{ color: "#1BD15D" }}>Careem date added</Label>
                      <DatePicker value={carDate} onChange={setCarDate} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>Cancel</Button>
            <Button
              className="bg-gradient-primary text-primary-foreground"
              disabled={!valid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              Add product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
