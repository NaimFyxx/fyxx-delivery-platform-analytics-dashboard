/**
 * Product-blocks view preference on Insights: photo "grid" or ranked "rows". Stored per user on
 * profiles.item_view_mode so it follows them between devices; guests (public read-only link) get the
 * 'grid' default with no persistence. Mirrors the pace tracker's pace_view_mode exactly. It is a
 * display preference and touches no business data, so read/write failures are swallowed and the
 * preference simply stays session-local (this also covers the window before the
 * profiles.item_view_mode migration has run).
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ItemViewMode = "grid" | "rows";
const QK = ["item_view_mode"] as const;
const isMode = (m: unknown): m is ItemViewMode => m === "grid" || m === "rows";

async function loadMode(): Promise<ItemViewMode> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "grid";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column not in generated types yet
    const { data } = await (supabase as any).from("profiles").select("item_view_mode").eq("id", user.id).maybeSingle();
    return isMode(data?.item_view_mode) ? data.item_view_mode : "grid";
  } catch {
    return "grid";
  }
}

export function useItemView(): { mode: ItemViewMode; setMode: (m: ItemViewMode) => void } {
  const qc = useQueryClient();
  const { data: mode = "grid" } = useQuery({
    queryKey: QK,
    queryFn: loadMode,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const setMode = useCallback((m: ItemViewMode) => {
    qc.setQueryData(QK, m); // immediate and session-local (also the guest path)
    // Persist for a logged-in user. Errors (guest, or column missing pre-migration) are ignored.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column not in generated types yet
      (supabase as any).from("profiles").update({ item_view_mode: m }).eq("id", user.id).then(() => {}, () => {});
    }, () => {});
  }, [qc]);

  return { mode, setMode };
}
