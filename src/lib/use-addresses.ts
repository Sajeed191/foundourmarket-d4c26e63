import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

export type Address = {
  id: string;
  user_id: string;
  label: string | null;
  full_name: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal: string;
  country: string;
  is_default_shipping: boolean;
  is_default_billing: boolean;
  created_at: string;
  updated_at: string;
};

export type AddressInput = Omit<
  Address,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export function useAddresses() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setAddresses([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("addresses")
      .select("*")
      .order("is_default_shipping", { ascending: false })
      .order("created_at", { ascending: false });
    setAddresses((data as Address[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async (input: AddressInput) => {
    if (!user) throw new Error("Not signed in");
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

  const defaultShipping = addresses.find((a) => a.is_default_shipping) ?? null;
  const defaultBilling = addresses.find((a) => a.is_default_billing) ?? null;

  return {
    addresses,
    loading,
    refresh,
    create,
    update,
    remove,
    setDefaultShipping,
    setDefaultBilling,
    defaultShipping,
    defaultBilling,
  };
}
