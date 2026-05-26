import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to realtime changes on a table and run a callback.
 * The public site uses this so visitors get live updates the moment
 * an admin publishes a change.
 */
export function useRealtime(table: string, onChange: () => void, deps: unknown[] = []) {
  useEffect(() => {
    const ch = supabase
      .channel(`rt-${table}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => onChange())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
