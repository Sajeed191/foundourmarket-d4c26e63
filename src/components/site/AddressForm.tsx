import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Home, Briefcase, MapPin, Locate, CheckCircle2, AlertCircle, Clock, Building2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import type { CountryCode } from "libphonenumber-js";
import type { Address, AddressInput, AddressType } from "@/lib/use-addresses";
import { validateIndianPincode } from "@/lib/address.functions";
import { PhoneInput } from "@/components/site/PhoneInput";
import { useRegion } from "@/lib/region";

/** Friendly country name from an ISO code, with a safe fallback. */
const REGION_NAMES =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/** Map detected region/country-code to the ISO country used by the phone input. */
function regionToCountry(market: string, countryCode: string | null): CountryCode {
  if (market === "india") return "IN";
  const cc = (countryCode ?? "").toUpperCase();
  if (/^[A-Z]{2}$/.test(cc)) return cc as CountryCode;
  return "US";
}

type Props = {
  initial?: Partial<Address>;
  onSubmit: (input: AddressInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
};

const empty: AddressInput = {
  label: "",
  nickname: "",
  full_name: "",
  phone: "",
  alternate_phone: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "",
  postal: "",
  country: "India",
  address_type: "home",
  delivery_notes: "",
  latitude: null,
  longitude: null,
  is_default_shipping: false,
  is_default_billing: false,
};

const TYPES: { value: AddressType; label: string; icon: typeof Home }[] = [
  { value: "home", label: "Home", icon: Home },
  { value: "work", label: "Office", icon: Briefcase },
  { value: "other", label: "Other", icon: MapPin },
];

/** Country-specific postal-code rules. Keyed by lowercase country name. */
const POSTAL_RULES: Record<string, { re: RegExp; msg: string }> = {
  india: { re: /^\d{6}$/, msg: "Indian PIN code must be 6 digits" },
  "united states": { re: /^\d{5}(-\d{4})?$/, msg: "Enter a valid US ZIP code" },
  usa: { re: /^\d{5}(-\d{4})?$/, msg: "Enter a valid US ZIP code" },
  canada: { re: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, msg: "Enter a valid Canadian postal code" },
  "united kingdom": { re: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/, msg: "Enter a valid UK postcode" },
  uk: { re: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/, msg: "Enter a valid UK postcode" },
  australia: { re: /^\d{4}$/, msg: "Enter a valid 4-digit postcode" },
};

function postalError(country: string, postal: string): string | null {
  const v = postal.trim();
  if (!v) return "Postal code is required";
  const rule = POSTAL_RULES[country.trim().toLowerCase()];
  if (rule) return rule.re.test(v) ? null : rule.msg;
  return v.length >= 3 ? null : "Enter a valid postal code";
}

export function AddressForm({ initial, onSubmit, onCancel, submitLabel = "Save address" }: Props) {
  const validatePin = useServerFn(validateIndianPincode);
  const { market, countryCode } = useRegion();

  // Region-derived defaults so we never fall back to GB/+44 for Indian users.
  const regionCountry = useMemo<CountryCode>(
    () => regionToCountry(market, countryCode),
    [market, countryCode],
  );
  const regionCountryName = useMemo(
    () => (market === "india" ? "India" : REGION_NAMES?.of(regionCountry) ?? regionCountry),
    [market, regionCountry],
  );

  const [form, setForm] = useState<AddressInput>({
    ...empty,
    ...(initial ?? {}),
    nickname: initial?.nickname ?? "",
    label: initial?.label ?? "",
    phone: initial?.phone ?? "",
    alternate_phone: initial?.alternate_phone ?? "",
    line2: initial?.line2 ?? "",
    landmark: initial?.landmark ?? "",
    state: initial?.state ?? "",
    delivery_notes: initial?.delivery_notes ?? "",
    address_type: (initial?.address_type as AddressType) ?? "home",
    country: initial?.country ?? regionCountryName,
  } as AddressInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [phoneValid, setPhoneValid] = useState<boolean>(!!initial?.phone);
  const [pinState, setPinState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [geoBusy, setGeoBusy] = useState(false);
  const lastPin = useRef<string>("");
  const countryTouched = useRef<boolean>(!!initial?.country);

  const set = <K extends keyof AddressInput>(k: K, v: AddressInput[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Keep the country field aligned with the detected region until the user
  // edits it manually (Phase 1 / Phase 8: never strand an Indian user on GB).
  useEffect(() => {
    if (countryTouched.current) return;
    setForm((p) => (p.country === regionCountryName ? p : { ...p, country: regionCountryName }));
  }, [regionCountryName]);


  // Auto city/state from Indian pincode
  useEffect(() => {
    const pin = (form.postal ?? "").trim();
    if (form.country !== "India") return;
    if (!/^\d{6}$/.test(pin)) {
      if (pin.length === 0) setPinState("idle");
      return;
    }
    if (pin === lastPin.current) return;
    lastPin.current = pin;
    let cancelled = false;
    setPinState("checking");
    (async () => {
      const r = await validatePin({ data: { pincode: pin } });
      if (cancelled) return;
      if (r.valid) {
        setPinState("valid");
        setForm((p) => ({ ...p, city: p.city || r.city || "", state: p.state || r.state || "" }));
      } else {
        setPinState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.postal, form.country, validatePin]);

  const useCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        set("latitude", latitude);
        set("longitude", longitude);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
            { headers: { Accept: "application/json" } }
          );
          const j = await res.json();
          const a = j?.address ?? {};
          setForm((p) => ({
            ...p,
            line1: p.line1 || [a.road, a.house_number].filter(Boolean).join(" "),
            city: a.city || a.town || a.village || a.county || p.city,
            state: a.state || p.state,
            postal: a.postcode || p.postal,
            country: a.country || p.country,
          }));
        } catch {
          /* coordinates saved even if reverse geocode fails */
        }
        setGeoBusy(false);
      },
      () => {
        setError("Couldn't access your location. You can enter the address manually.");
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const fieldError = (k: string, f = form): string | undefined => {
    switch (k) {
      case "full_name":
        return f.full_name.trim() ? undefined : "Full name is required";
      case "phone":
        if (!(f.phone ?? "").trim()) return "Phone number is required";
        return phoneValid ? undefined : "Enter a valid phone number";
      case "line1":
        return f.line1.trim() ? undefined : "Address line 1 is required";
      case "city":
        return f.city.trim() ? undefined : "City is required";
      case "country":
        return f.country.trim() ? undefined : "Country is required";
      case "postal":
        return postalError(f.country, f.postal) ?? undefined;
      case "nickname":
        // Required only as a custom label for "Other" address types.
        return f.address_type === "other" && !(f.nickname ?? "").trim()
          ? "Add a label for this address"
          : undefined;
      default:
        return undefined;
    }
  };

  // Re-validate a field that's already been touched, as the user fixes it.
  useEffect(() => {
    setErrors((prev) => {
      const next: Record<string, string> = {};
      for (const k of Object.keys(touched)) {
        const e = fieldError(k);
        if (e) next[k] = e;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, phoneValid]);

  const markTouched = (k: string) => {
    setTouched((p) => ({ ...p, [k]: true }));
    const e = fieldError(k);
    setErrors((prev) => {
      const next = { ...prev };
      if (e) next[k] = e;
      else delete next[k];
      return next;
    });
  };

  const validateAll = () => {
    const keys = ["full_name", "phone", "line1", "city", "postal", "country", "nickname"];
    const e: Record<string, string> = {};
    for (const k of keys) {
      const msg = fieldError(k);
      if (msg) e[k] = msg;
    }
    setErrors(e);
    setTouched(Object.fromEntries(keys.map((k) => [k, true])));
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (!validateAll()) return;
    setBusy(true);
    try {
      await onSubmit({
        ...form,
        full_name: form.full_name.trim(),
        line1: form.line1.trim(),
        city: form.city.trim(),
        postal: form.postal.trim(),
      });
    } catch (err: any) {
      setError(err?.message ?? "Could not save address");
    } finally {
      setBusy(false);
    }
  };

  const base =
    "w-full bg-background/60 border rounded-2xl px-3.5 py-3 text-sm outline-none transition-all focus:border-accent focus:ring-1 focus:ring-accent/40";
  const cls = (k: string) => `${base} ${errors[k] ? "border-destructive/60" : "border-border"}`;
  const Err = ({ k }: { k: string }) =>
    errors[k] ? (
      <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
        <AlertCircle className="size-3" /> {errors[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Type selector */}
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => {
          const Icon = t.icon;
          const active = form.address_type === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => set("address_type", t.value)}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border text-[11px] uppercase tracking-widest font-mono transition-all ${
                active
                  ? "border-accent bg-accent/10 text-accent shadow-[0_0_20px_-6px_var(--color-accent)]"
                  : "border-border text-muted-foreground hover:border-accent/40"
              }`}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={geoBusy}
        className="w-full inline-flex items-center justify-center gap-2 border border-accent/40 text-accent rounded-2xl py-2.5 text-[11px] uppercase tracking-widest font-mono hover:bg-accent/10 transition-all disabled:opacity-60"
      >
        {geoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Locate className="size-3.5" />}
        Use current location
      </button>

      {/* Smart, type-aware label (Phase 2) */}
      {form.address_type === "work" ? (
        <div>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              placeholder="Company / Office name"
              value={form.nickname ?? ""}
              onChange={(e) => set("nickname", e.target.value)}
              className={`${cls("nickname")} pl-9`}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <Clock className="size-3" /> Weekday delivery recommended — weekend delivery may be limited at offices.
          </p>
        </div>
      ) : form.address_type === "other" ? (
        <div>
          <input
            placeholder="Custom label (e.g. Warehouse, Gift Address) *"
            value={form.nickname ?? ""}
            onChange={(e) => set("nickname", e.target.value)}
            onBlur={() => markTouched("nickname")}
            className={cls("nickname")}
          />
          <Err k="nickname" />
        </div>
      ) : (
        <input
          placeholder="Nickname (e.g. Mom's house) — optional"
          value={form.nickname ?? ""}
          onChange={(e) => set("nickname", e.target.value)}
          className={cls("nickname")}
        />
      )}

      <div>
        <input
          autoFocus
          placeholder="Full name *"
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          onBlur={() => markTouched("full_name")}
          className={cls("full_name")}
        />
        <Err k="full_name" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <PhoneInput
            value={form.phone ?? ""}
            defaultCountry={regionCountry}
            autoDetect={false}
            onChange={(e164, valid) => {
              set("phone", e164);
              setPhoneValid(valid);
            }}
            onBlur={() => markTouched("phone")}
            invalid={!!errors.phone}
            placeholder="Phone *"
          />
          <Err k="phone" />
        </div>
        <PhoneInput
          value={form.alternate_phone ?? ""}
          defaultCountry={regionCountry}
          autoDetect={false}
          onChange={(e164) => set("alternate_phone", e164)}
          placeholder="Alternate"
        />
      </div>


      <div>
        <input
          placeholder="Address line 1 *"
          value={form.line1}
          onChange={(e) => set("line1", e.target.value)}
          onBlur={() => markTouched("line1")}
          className={cls("line1")}
        />
        <Err k="line1" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="Address line 2 (optional)"
          value={form.line2 ?? ""}
          onChange={(e) => set("line2", e.target.value)}
          className={cls("line2")}
        />
        <input
          placeholder="Landmark (optional)"
          value={form.landmark ?? ""}
          onChange={(e) => set("landmark", e.target.value)}
          className={cls("landmark")}
        />
      </div>

      {/* Pincode + Country */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="relative">
            <input
              placeholder="PIN code *"
              inputMode="numeric"
              value={form.postal}
              onChange={(e) => set("postal", e.target.value)}
              onBlur={() => markTouched("postal")}
              className={cls("postal")}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {pinState === "checking" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              {pinState === "valid" && <CheckCircle2 className="size-4 text-accent" />}
              {pinState === "invalid" && <AlertCircle className="size-4 text-destructive" />}
            </span>
          </div>
          <Err k="postal" />
        </div>
        <div>
          <input
            placeholder="Country *"
            value={form.country}
            onChange={(e) => {
              countryTouched.current = true;
              set("country", e.target.value);
            }}
            onBlur={() => markTouched("country")}
            className={cls("country")}
          />
          <Err k="country" />
        </div>

      </div>

      {/* City + State */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <input
            placeholder="City *"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            onBlur={() => markTouched("city")}
            className={cls("city")}
          />
          <Err k="city" />
        </div>
        <input
          placeholder="State / Region"
          value={form.state ?? ""}
          onChange={(e) => set("state", e.target.value)}
          className={cls("state")}
        />
      </div>

      <textarea
        placeholder="Delivery instructions (optional)"
        value={form.delivery_notes ?? ""}
        onChange={(e) => set("delivery_notes", e.target.value)}
        rows={2}
        className={`${base} border-border resize-none`}
      />

      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-0.5 text-xs text-muted-foreground">
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

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertCircle className="size-3.5" /> {error}
        </p>
      )}

      <div className="flex gap-2 pt-0.5 sticky bottom-0">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 bg-accent text-accent-foreground font-bold px-5 py-3.5 rounded-2xl text-[11px] uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2 shadow-[0_0_30px_-8px_var(--color-accent)]"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-3.5 rounded-2xl text-[11px] uppercase tracking-widest border border-border hover:bg-white/5"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
