import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

export type AddressType = "home" | "work" | "other";

export type Address = {
  id: string;
  user_id: string;
  label: string | null;
  nickname: string | null;
  full_name: string;
  phone: string | null;
  alternate_phone: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string | null;
  postal: string;
  country: string;
  address_type: AddressType;
  delivery_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default_shipping: boolean;
  is_default_billing: boolean;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
};

export type AddressInput = Omit<
  Address,
  "id" | "user_id" | "created_at" | "updated_at" | "last_used_at" | "use_count"
>;

/** Normalised fingerprint used to detect duplicate saved addresses. */
export function addressFingerprint(a: {
  line1?: string | null;
  line2?: string | null;
  postal?: string | null;
  city?: string | null;
}): string {
  const norm = (s?: string | null) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return [norm(a.line1), norm(a.line2), norm(a.postal), norm(a.city)].join("|");
}

/** Address completeness score (0–100) with a per-field checklist. */
export function addressCompleteness(a: {
  full_name?: string | null;
  phone?: string | null;
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal?: string | null;
  country?: string | null;
}): { score: number; checks: { label: string; ok: boolean }[] } {
  const checks = [
    { label: "Name", ok: !!(a.full_name ?? "").trim() },
    { label: "Phone", ok: !!(a.phone ?? "").trim() },
    { label: "Address", ok: !!(a.line1 ?? "").trim() },
    { label: "City", ok: !!(a.city ?? "").trim() },
    { label: "State", ok: !!(a.state ?? "").trim() },
    { label: "PIN", ok: !!(a.postal ?? "").trim() },
    { label: "Country", ok: !!(a.country ?? "").trim() },
  ];
  const ok = checks.filter((c) => c.ok).length;
  return { score: Math.round((ok / checks.length) * 100), checks };
}

export function useAddresses() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);


  const refresh = useCallback(async () => {
    if (!user) {
      setAddresses([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("addresses")
      .select("*")
      .order("is_default_shipping", { ascending: false })
      .order("created_at", { ascending: false });
    setAddresses((data as Address[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // Realtime multi-device sync
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`addresses:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "addresses", filter: `user_id=eq.${user.id}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  /** Returns an existing address matching the same physical location, or null. */
  const findDuplicate = useCallback(
    (input: { line1?: string | null; line2?: string | null; postal?: string | null; city?: string | null }, ignoreId?: string) => {
      const fp = addressFingerprint(input);
      return addresses.find((a) => a.id !== ignoreId && addressFingerprint(a) === fp) ?? null;
    },
    [addresses],
  );

  const create = async (input: AddressInput) => {
    if (!user) throw new Error("Not signed in");
    if (findDuplicate(input)) {
      throw new Error("You've already saved this address.");
    }
    const { data, error } = await supabase
      .from("addresses")
      .insert({ ...input, user_id: user.id })
      .select("*")
      .single();
    if (error) throw error;
    await refresh();
    return data as Address;
  };


  const update = async (id: string, input: Partial<AddressInput>) => {
    const { error } = await supabase.from("addresses").update(input).eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("addresses").delete().eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const setDefaultShipping = async (id: string) => update(id, { is_default_shipping: true });
  const setDefaultBilling = async (id: string) => update(id, { is_default_billing: true });

  // Mark an address as used at checkout (usage analytics)
  const markUsed = async (id: string) => {
    const current = addresses.find((a) => a.id === id);
    const { error } = await supabase
      .from("addresses")
      .update({ last_used_at: new Date().toISOString(), use_count: (current?.use_count ?? 0) + 1 })
      .eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const duplicate = async (id: string) => {
    const a = addresses.find((x) => x.id === id);
    if (!a) return;
    const { id: _i, user_id: _u, created_at, updated_at, last_used_at, use_count, ...rest } = a;
    await create({
      ...rest,
      nickname: a.nickname ? `${a.nickname} (copy)` : null,
      is_default_shipping: false,
      is_default_billing: false,
    });
  };

  const defaultShipping = addresses.find((a) => a.is_default_shipping) ?? null;
  const defaultBilling = addresses.find((a) => a.is_default_billing) ?? null;
  const lastUsed = useMemo(() => {
    const used = addresses.filter((a) => a.last_used_at);
    if (!used.length) return null;
    return [...used].sort(
      (a, b) => new Date(b.last_used_at!).getTime() - new Date(a.last_used_at!).getTime()
    )[0];
  }, [addresses]);

  return {
    addresses,
    loading,
    refresh,
    create,
    update,
    remove,
    duplicate,
    findDuplicate,

    markUsed,
    setDefaultShipping,
    setDefaultBilling,
    defaultShipping,
    defaultBilling,
    lastUsed,
  };
}
