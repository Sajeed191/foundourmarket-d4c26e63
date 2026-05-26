import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Address, AddressInput } from "@/lib/use-addresses";

type Props = {
  initial?: Partial<Address>;
  onSubmit: (input: AddressInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
};

const empty: AddressInput = {
  label: "",
  full_name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal: "",
  country: "",
  is_default_shipping: false,
  is_default_billing: false,
};

export function AddressForm({ initial, onSubmit, onCancel, submitLabel = "Save address" }: Props) {
  const [form, setForm] = useState<AddressInput>({
    ...empty,
    ...(initial ?? {}),
    label: initial?.label ?? "",
    phone: initial?.phone ?? "",
    line2: initial?.line2 ?? "",
    state: initial?.state ?? "",
  } as AddressInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof AddressInput>(k: K, v: AddressInput[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err: any) {
      setError(err?.message ?? "Could not save address");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full bg-background border border-border rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        placeholder="Label (Home, Work)"
        value={form.label ?? ""}
        onChange={(e) => set("label", e.target.value)}
        className={input}
      />
      <input
        required
        placeholder="Full name"
        value={form.full_name}
        onChange={(e) => set("full_name", e.target.value)}
        className={input}
      />
      <input
        placeholder="Phone"
        value={form.phone ?? ""}
        onChange={(e) => set("phone", e.target.value)}
        className={input}
      />
      <input
        required
        placeholder="Address line 1"
        value={form.line1}
        onChange={(e) => set("line1", e.target.value)}
        className={input}
      />
      <input
        placeholder="Address line 2 (optional)"
        value={form.line2 ?? ""}
        onChange={(e) => set("line2", e.target.value)}
        className={input}
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          required
          placeholder="City"
          value={form.city}
          onChange={(e) => set("city", e.target.value)}
          className={input}
        />
        <input
          placeholder="State / Region"
          value={form.state ?? ""}
          onChange={(e) => set("state", e.target.value)}
          className={input}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          required
          placeholder="Postal code"
          value={form.postal}
          onChange={(e) => set("postal", e.target.value)}
          className={input}
        />
        <input
          required
          placeholder="Country"
          value={form.country}
          onChange={(e) => set("country", e.target.value)}
          className={input}
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_default_shipping}
            onChange={(e) => set("is_default_shipping", e.target.checked)}
            className="accent-accent"
          />
          Default shipping
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_default_billing}
            onChange={(e) => set("is_default_billing", e.target.checked)}
            className="accent-accent"
          />
          Default billing
        </label>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="bg-accent text-accent-foreground font-bold px-5 py-3 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-60 inline-flex items-center gap-2"
        >
          {busy && <Loader2 className="size-3 animate-spin" />}
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-3 rounded-full text-[11px] uppercase tracking-widest border border-border hover:bg-white/5"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
