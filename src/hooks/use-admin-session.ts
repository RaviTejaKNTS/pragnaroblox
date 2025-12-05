import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";

type AdminSessionState = {
  session: Session | null;
  role: string | null | undefined;
  loading: boolean;
};

export function useAdminSession(): AdminSessionState {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    type AdminRow = { role: string | null };

    const loadSession = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        const nextSession = data.session ?? null;
        setSession(nextSession);

        if (nextSession) {
          const { data: adminRow } = await supabase
            .from("admin_users")
            .select("role")
            .eq("user_id", nextSession.user.id)
            .maybeSingle<AdminRow>();

          if (active) {
            setRole(adminRow?.role ?? null);
          }
        } else {
          setRole(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession ?? null);
      if (!nextSession) {
        setRole(null);
        return;
      }
      try {
        const { data } = await supabase
          .from("admin_users")
          .select("role")
          .eq("user_id", nextSession.user.id)
          .maybeSingle<AdminRow>();

        if (active) {
          setRole(data?.role ?? null);
        }
      } catch {
        if (active) setRole(null);
      }
    });

    return () => {
      active = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, [supabase]);

  return { session, role, loading };
}
