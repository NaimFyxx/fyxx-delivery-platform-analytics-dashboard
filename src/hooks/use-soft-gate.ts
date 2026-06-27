import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const UNLOCK_KEY = "tgr_dash_unlock";

export function useSoftGate() {
  const nav = useNavigate();
  const [adminUser, setAdminUser] = useState<{ email: string } | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        localStorage.setItem(UNLOCK_KEY, "1");
        setAdminUser({ email: data.user.email ?? "" });
      } else if (localStorage.getItem(UNLOCK_KEY) !== "1") {
        nav({ to: "/" });
        return;
      }
      setSessionChecked(true);
    });
  }, [nav]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    nav({ to: "/auth" });
  }

  return { adminUser, sessionChecked, handleSignOut };
}
