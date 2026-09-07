/**
 * Pace tracker view preference: card only, both, or bar only. Stored per user on profiles so it
 * follows them between devices; guests (public read-only link) get 'both' with no persistence.
 * It is a display preference and touches no business data, so read/write failures are swallowed
 * and the preference simply stays session-local (this also covers the window before the
 * profiles.pace_view_mode migration has run).
 */
import { createContext, useContext, useCallback, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PaceViewMode = "card" | "both" | "bar";
const QK = ["pace_view_mode"] as const;
const isMode = (m: unknown): m is PaceViewMode => m === "card" || m === "both" || m === "bar";

async function loadMode(): Promise<PaceViewMode> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "both";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column not in generated types yet
    const { data } = await (supabase as any).from("profiles").select("pace_view_mode").eq("id", user.id).maybeSingle();
    return isMode(data?.pace_view_mode) ? data.pace_view_mode : "both";
  } catch {
    return "both";
  }
}

type Ctx = { mode: PaceViewMode; setMode: (m: PaceViewMode) => void; open: boolean; setOpen: (b: boolean) => void };
const PaceViewContext = createContext<Ctx | null>(null);

export function PaceViewProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: mode = "both" } = useQuery({
    queryKey: QK,
    queryFn: loadMode,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const setMode = useCallback((m: PaceViewMode) => {
    qc.setQueryData(QK, m); // immediate and session-local (also the guest path)
    // Persist for a logged-in user. Errors (guest, or column missing pre-migration) are ignored.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column not in generated types yet
      (supabase as any).from("profiles").update({ pace_view_mode: m }).eq("id", user.id).then(() => {}, () => {});
    }, () => {});
  }, [qc]);

  return <PaceViewContext.Provider value={{ mode, setMode, open, setOpen }}>{children}</PaceViewContext.Provider>;
}

export function usePaceView(): Ctx {
  return useContext(PaceViewContext) ?? { mode: "both", setMode: () => {}, open: false, setOpen: () => {} };
}
