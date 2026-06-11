import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global manual-reshuffle nonce. Admins can trigger an instant reshuffle of all
 * rotating collections (Best Sellers, Trending, Flash Deals) by bumping this
 * value. It is combined with the time-based rotation seed everywhere, so a bump
 * re-randomizes the order for every visitor immediately (via realtime), while
 * the regular 12:00 AM / PM rotation still applies on top.
 */
export function useRotationNonce(): number {
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("rotation_state")
        .select("nonce")
        .limit(1)
        .maybeSingle();
      if (active && data) setNonce(Number(data.nonce) || 0);
    };
    load();

    const channel = supabase
      .channel("rotation-state-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rotation_state" },
        (payload) => {
          const row = payload.new as { nonce?: number } | null;
          if (row && row.nonce != null) setNonce(Number(row.nonce) || 0);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return nonce;
}

/**
 * Triggers a global reshuffle of all rotating collections. Admin-only (enforced
 * by RLS). Returns true on success.
 */
export async function triggerGlobalReshuffle(): Promise<boolean> {
  const nonce = Date.now();
  const { data, error } = await supabase
    .from("rotation_state")
    .update({ nonce, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("nonce");
  // RLS can silently block the update (0 rows affected) without an error;
  // requiring a returned row guarantees the reshuffle actually persisted.
  return !error && Array.isArray(data) && data.length > 0;
}
