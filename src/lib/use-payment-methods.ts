import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  listSavedPaymentMethods,
  deletePaymentMethod,
  setDefaultPaymentMethod,
  syncRazorpayPaymentMethods,
} from "@/lib/payment-methods.functions";

export type PaymentMethod = {
  id: string;
  user_id: string;
  razorpay_customer_id: string;
  razorpay_token_id: string;
  provider: string;
  payment_type: string;
  brand: string | null;
  last4: string | null;
  expiry_month: number | null;
  expiry_year: number | null;
  upi_vpa: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export function isExpired(m: PaymentMethod) {
  if (!m.expiry_month || !m.expiry_year) return false;
  const now = new Date();
  const exp = new Date(m.expiry_year, m.expiry_month, 0, 23, 59, 59);
  return exp < now;
}

export function usePaymentMethods() {
  const { user } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const listFn = useServerFn(listSavedPaymentMethods);
  const removeFn = useServerFn(deletePaymentMethod);
  const defaultFn = useServerFn(setDefaultPaymentMethod);
  const syncFn = useServerFn(syncRazorpayPaymentMethods);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await listFn();
      if (mounted.current) setMethods((res.methods as PaymentMethod[]) ?? []);
    } catch {
      /* ignore */
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [user, listFn]);

  useEffect(() => {
    mounted.current = true;
    if (!user) {
      setLoading(false);
      setMethods([]);
      return;
    }
    load();
    const channel = supabase
      .channel(`spm-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "saved_payment_methods", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      mounted.current = false;
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const sync = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      await syncFn();
      await load();
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }, [user, syncFn, load]);

  const remove = useCallback(
    async (id: string) => {
      // optimistic
      setMethods((prev) => prev.filter((m) => m.id !== id));
      await removeFn({ data: { id } });
    },
    [removeFn],
  );

  const makeDefault = useCallback(
    async (id: string) => {
      setMethods((prev) => prev.map((m) => ({ ...m, is_default: m.id === id })));
      await defaultFn({ data: { id } });
    },
    [defaultFn],
  );

  return { methods, loading, syncing, load, sync, remove, makeDefault };
}
