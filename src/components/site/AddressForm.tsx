import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Home, Briefcase, MapPin, CheckCircle2, AlertCircle, Clock,
  Building2, Map as MapIcon, Navigation, Pencil, Zap,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import type { CountryCode } from "libphonenumber-js";
import { type Address, type AddressInput, type AddressType } from "@/lib/use-addresses";
import { validateIndianPincode } from "@/lib/address.functions";
import { PhoneInput } from "@/components/site/PhoneInput";
import { useRegion } from "@/lib/region";
import { useLowEndDevice } from "@/lib/use-low-end-device";
import type { MapPickResult } from "@/components/site/MapPicker";

// Leaflet + its CSS only download when the customer opens "Select on Map".
const MapPicker = lazy(() => import("@/components/site/MapPicker"));

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
  // India market is country-locked: no country/flag/dial selectors anywhere.
  const isIndia = market === "india";

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
  const [pinState, setPinState] = useState<"idle" | "checking" | "valid" | "unverified" | "unsupported">("idle");
  const [geoBusy, setGeoBusy] = useState(false);
  const lowEnd = useLowEndDevice();
  // Which premium mode the customer last used to fill the address.
  const [mode, setMode] = useState<"gps" | "map" | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  // Compact "selected address" preview shown after GPS / map autofill.
  const [geoStatus, setGeoStatus] = useState<"ok" | "fail" | null>(null);
  // City/state/areas the postal service resolved for the current PIN.
  const [resolvedPin, setResolvedPin] = useState<{
    city: string | null;
    state: string | null;
    areas: string[];
  } | null>(null);
  const lastPin = useRef<string>("");
  const countryTouched = useRef<boolean>(!!initial?.country);

  const set = <K extends keyof AddressInput>(k: K, v: AddressInput[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  /** Lightweight, fire-and-forget address-funnel analytics. */
  const trackAddr = (event: string, meta: Record<string, unknown> = {}) => {
    void import("@/lib/visitor").then((m) =>
      m.trackEvent(event, { metadata: { form: "address", market, ...meta } }),
    );
  };

  // Fire `manual_address_edit` once when the customer manually edits an
  // auto-filled locality/city/district/address field after GPS autofill.
  const manualEditTracked = useRef(false);
  const trackManualEdit = (field: string) => {
    if (manualEditTracked.current) return;
    manualEditTracked.current = true;
    trackAddr("manual_address_edit", { field });
  };



  // Keep the country field aligned with the detected region until the user
  // edits it manually (Phase 1 / Phase 8: never strand an Indian user on GB).
  useEffect(() => {
    if (countryTouched.current) return;
    setForm((p) => (p.country === regionCountryName ? p : { ...p, country: regionCountryName }));
  }, [regionCountryName]);

  // India market is country-locked — the stored country is always "India",
  // regardless of any previously saved value or geocoder result.
  useEffect(() => {
    if (!isIndia) return;
    setForm((p) => (p.country === "India" ? p : { ...p, country: "India" }));
  }, [isIndia]);



  // Auto city/state from Indian pincode (best-effort autofill + area
  // autocomplete). A lookup miss or network/API failure NEVER blocks the
  // customer — it only shows a soft, non-blocking notice and lets them type
  // city/state manually.
  useEffect(() => {
    const pin = (form.postal ?? "").trim();
    if (form.country !== "India") return;
    if (!/^\d{6}$/.test(pin)) {
      if (pin.length === 0) {
        setPinState("idle");
        setResolvedPin(null);
      }
      return;
    }
    if (pin === lastPin.current) return;
    lastPin.current = pin;
    let cancelled = false;
    setPinState("checking");
    (async () => {
      try {
        const r = await validatePin({ data: { pincode: pin } });
        if (cancelled) return;
        if (r.valid) {
          setPinState("valid");
          setResolvedPin({ city: r.city, state: r.state, areas: r.areas ?? [] });
          setForm((p) => ({
            ...p,
            city: p.city || r.city || "",
            state: p.state || r.state || "",
          }));
        } else if (r.serviceable === false) {
          // Confirmed unsupported destination — the ONLY case that blocks save
          // & checkout. (A failed/unknown lookup keeps serviceable === true.)
          setPinState("unsupported");
          setResolvedPin(null);
          trackAddr("unsupported_pin", { pincode: pin });
          trackAddr("unsupported_pincode_blocked", { pincode: pin });
        } else {
          // PIN couldn't be auto-verified (not in lookup DB or transient gap) —
          // soft, NON-BLOCKING. Customer types city/state and continues.
          setPinState("unverified");
          setResolvedPin(null);
          trackAddr("unknown_pin", { pincode: pin, reason: r.reason ?? "not_found" });
          trackAddr("unknown_pin_entered", { pincode: pin, reason: r.reason ?? "not_found" });
        }
      } catch {
        // Network/API failure — also soft and non-blocking.
        if (cancelled) return;
        setPinState("unverified");
        setResolvedPin(null);
        trackAddr("gps_lookup_failed", { pincode: pin, reason: "lookup_error" });
        trackAddr("serviceability_lookup_failed", { pincode: pin, reason: "lookup_error" });
      }


    })();
    return () => {
      cancelled = true;
    };
  }, [form.postal, form.country, validatePin]);

  // Soft, NON-BLOCKING PIN ↔ City notice. When the postal lookup resolved a
  // canonical city but the customer typed something that doesn't match (common
  // for nearby towns, villages, or local names), we only warn — never block.
  const cityMismatch = useMemo(() => {
    const resolved = resolvedPin?.city?.trim().toLowerCase();
    const entered = form.city.trim().toLowerCase();
    if (!resolved || !entered) return false;
    return !resolved.includes(entered) && !entered.includes(resolved);
  }, [resolvedPin, form.city]);

  useEffect(() => {
    if (cityMismatch) {
      trackAddr("pin_city_warning", {
        pincode: (form.postal ?? "").trim(),
        entered_city: form.city.trim(),
        postal_city: resolvedPin?.city ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityMismatch]);




  // Shared structured autofill used by BOTH "Current location" (GPS) and
  // "Select on map". Reverse-geocoded fields enrich (never overwrite) what the
  // customer already typed; the India Post PIN lookup is the primary signal.
  const applyGeoAddress = async (
    latitude: number,
    longitude: number,
    a: Record<string, string>,
  ) => {
    set("latitude", latitude);
    set("longitude", longitude);

    const line1 = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(" ");
    const area = a.neighbourhood || a.suburb || a.quarter || a.hamlet || "";
    const locality = a.suburb || a.city_district || a.residential || "";
    let city = a.city || a.town || a.village || a.municipality || a.county || "";
    let district = a.state_district || a.county || "";
    let state = a.state || "";
    const postal = a.postcode || "";
    const country = a.country || "";

    if (country) countryTouched.current = true;

    if (/^\d{6}$/.test(postal) && (country === "" || /india/i.test(country))) {
      try {
        const v = await validatePin({ data: { pincode: postal } });
        if (v.valid) {
          trackAddr("gps_lookup_success", { pincode: postal });
          state = v.state || state;
          district = v.district || district;
          city = v.city || city;
        } else {
          trackAddr(v.reason === "service_down" ? "gps_lookup_failed" : "unknown_pin", {
            pincode: postal,
            reason: v.reason ?? "not_found",
          });
        }
      } catch {
        trackAddr("gps_lookup_failed", { pincode: postal, reason: "lookup_error" });
      }
    } else if (postal || city || state) {
      trackAddr("gps_lookup_success", { pincode: postal || null, non_india: true });
    }

    setForm((p) => ({
      ...p,
      line1: p.line1 || line1,
      line2: p.line2 || [locality, area, district].filter(Boolean).join(", "),
      landmark: p.landmark || (area && area !== locality ? area : p.landmark),
      city: city || p.city,
      state: state || p.state,
      postal: postal || p.postal,
      // India market is country-locked — geocoded country is ignored.
      country: isIndia ? "India" : country || p.country,
    }));
    setGeoStatus(city || postal || state ? "ok" : "fail");
  };

  // 📍 Current Location — GPS detect + reverse geocode. Never blocks checkout.
  const useCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      setGeoStatus("fail");
      return;
    }
    setMode("gps");
    setGeoBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          let j: any = null;
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,
              { headers: { Accept: "application/json" }, signal: controller.signal },
            );
            j = await res.json();
          } catch {
            trackAddr("reverse_geocode_timeout", { latitude, longitude });
          } finally {
            clearTimeout(timer);
          }
          await applyGeoAddress(latitude, longitude, j?.address ?? {});
        } catch {
          set("latitude", latitude);
          set("longitude", longitude);
          setGeoStatus("ok");
          trackAddr("gps_lookup_failed", { reason: "geocode_error" });
        }
        setGeoBusy(false);
      },
      () => {
        setError("Unable to detect location. Please enter your address manually.");
        setGeoStatus("fail");
        trackAddr("gps_lookup_failed", { reason: "permission_denied" });
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // 🗺 Select on Map — confirm handler from the fullscreen Leaflet picker.
  const onMapConfirm = async (r: MapPickResult) => {
    setMapOpen(false);
    setMode("map");
    setGeoBusy(true);
    trackAddr("map_location_selected", { lat: r.lat, lng: r.lng });
    await applyGeoAddress(r.lat, r.lng, r.address);
    setGeoBusy(false);
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
    // Field abandonment: user left a required field empty or invalid.
    if (e) trackAddr("address_field_abandoned", { field: k, reason: e });
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
    const failed = Object.keys(e);
    if (failed.length > 0) {
      trackAddr("address_validation_failed", { fields: failed, count: failed.length });
    }
    return failed.length === 0;
  };

  // Block save/checkout ONLY for a confirmed-unsupported destination.
  const blockedByServiceability = pinState === "unsupported";

  const submit = async (ev?: React.FormEvent | React.MouseEvent) => {
    ev?.preventDefault();
    setError(null);
    if (blockedByServiceability) {
      setError("We're unable to deliver to this PIN code yet. Please use a different delivery address.");
      return;
    }
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
    <div className="space-y-3">
      {/* Not a <form>: this component renders inside the checkout's own <form>,
          and nested forms are invalid HTML (the browser flattens them, which
          would make this button submit the outer order form). Submit on click. */}
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

      {/* Premium address modes — Flipkart-style cards. Only one active. */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={geoBusy}
          aria-pressed={mode === "gps"}
          className={`relative overflow-hidden text-left rounded-[20px] border p-3.5 min-h-[88px] transition-all duration-200 disabled:opacity-70 ${
            mode === "gps"
              ? "border-accent bg-accent/10 shadow-[0_0_28px_-8px_var(--color-accent)]"
              : "border-border bg-background/50 hover:border-accent/40"
          }`}
        >
          <span
            className={`grid place-items-center size-9 rounded-xl mb-2 ${
              mode === "gps" ? "bg-accent text-accent-foreground" : "bg-accent/10 text-accent"
            }`}
          >
            {geoBusy && mode === "gps" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Navigation className="size-4" />
            )}
          </span>
          <span className="block text-[13px] font-semibold">Current Location</span>
          <span className="block text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Zap className="size-3" /> Detect using GPS · Fastest
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMapOpen(true)}
          aria-pressed={mode === "map"}
          className={`relative overflow-hidden text-left rounded-[20px] border p-3.5 min-h-[88px] transition-all duration-200 ${
            mode === "map"
              ? "border-accent bg-accent/10 shadow-[0_0_28px_-8px_var(--color-accent)]"
              : "border-border bg-background/50 hover:border-accent/40"
          }`}
        >
          <span
            className={`grid place-items-center size-9 rounded-xl mb-2 ${
              mode === "map" ? "bg-accent text-accent-foreground" : "bg-accent/10 text-accent"
            }`}
          >
            <MapIcon className="size-4" />
          </span>
          <span className="block text-[13px] font-semibold">Select on Map</span>
          <span className="block text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <MapPin className="size-3" /> Choose exact location
          </span>
        </button>
      </div>

      {/* Selected-address preview after GPS / map autofill */}
      {geoStatus === "ok" && (form.city || form.postal || form.state) && (
        <div className="rounded-[18px] border border-accent/30 bg-accent/[0.06] p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-widest text-accent flex items-center gap-1.5">
                <MapPin className="size-3" /> Selected address
              </p>
              <p className="text-sm mt-1.5 leading-relaxed">
                {[form.line1, form.line2, form.city, form.state, form.postal, form.country]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="size-3" /> Verified location
              </p>
            </div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1 shrink-0">
              <Pencil className="size-3" /> Edit below
            </span>
          </div>
        </div>
      )}

      {geoStatus === "fail" && (
        <p className="text-[11px] text-amber-400/90 flex items-center gap-1.5">
          <AlertCircle className="size-3.5 shrink-0" />
          Unable to detect location. Please enter your address manually.
        </p>
      )}

      {/* Fullscreen map picker — Leaflet loads lazily only when opened. */}
      {mapOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[2100] grid place-items-center bg-background/90">
              <Loader2 className="size-6 animate-spin text-accent" />
            </div>
          }
        >
          <MapPicker
            initial={{ lat: form.latitude, lng: form.longitude }}
            lowEnd={lowEnd}
            onConfirm={onMapConfirm}
            onCancel={() => setMapOpen(false)}
          />
        </Suspense>
      )}





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
          autoComplete="name"
          placeholder="Full name *"
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          onBlur={() => markTouched("full_name")}
          className={cls("full_name")}
        />
        <Err k="full_name" />
      </div>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <div className="min-w-0">
          <PhoneInput
            value={form.phone ?? ""}
            defaultCountry={regionCountry}
            autoDetect={false}
            lockCountry={isIndia ? "IN" : undefined}
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
        <div className="min-w-0">
          <PhoneInput
            value={form.alternate_phone ?? ""}
            defaultCountry={regionCountry}
            autoDetect={false}
            lockCountry={isIndia ? "IN" : undefined}
            onChange={(e164) => set("alternate_phone", e164)}
            placeholder="Alternate"
          />
        </div>
      </div>


      <div>
        <input
          placeholder="Address line 1 *"
          autoComplete="address-line1"
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
          autoComplete="address-line2"
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
              autoComplete="postal-code"
              inputMode="numeric"
              value={form.postal}
              onChange={(e) => set("postal", e.target.value)}
              onBlur={() => markTouched("postal")}
              className={cls("postal")}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {pinState === "checking" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              {pinState === "valid" && <CheckCircle2 className="size-4 text-accent" />}
            </span>
          </div>
          <Err k="postal" />
          {/* Soft, non-blocking notice when the PIN couldn't be auto-verified.
              The customer can still type city/state and continue to payment. */}
          {pinState === "unverified" && !errors.postal && (
            <p className="text-[11px] text-amber-400/90 mt-1 flex items-center gap-1">
              <AlertCircle className="size-3 shrink-0" />
              We could not verify this PIN right now. Please confirm your address details.
            </p>
          )}
          {/* Hard block — confirmed unsupported destination only. */}
          {pinState === "unsupported" && !errors.postal && (
            <p className="text-[11px] text-destructive mt-1 flex items-start gap-1">
              <AlertCircle className="size-3 shrink-0 mt-0.5" />
              We're unable to deliver to this PIN code yet. Please use a different delivery address.
            </p>
          )}
        </div>
        <div>
          {isIndia ? (
            <input
              placeholder="Country *"
              autoComplete="country-name"
              value="India"
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              className={`${base} border-border opacity-90 cursor-not-allowed`}
            />
          ) : (
            <input
              placeholder="Country *"
              autoComplete="country-name"
              value={form.country}
              onChange={(e) => {
                countryTouched.current = true;
                set("country", e.target.value);
              }}
              onBlur={() => markTouched("country")}
              className={cls("country")}
            />
          )}
          <Err k="country" />
        </div>


      </div>

      {/* City + State (Phase 5 — area/locality autocomplete from the PIN) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          {/* Plain editable text input — no dropdown / select / arrow. */}
          <input
            placeholder="City *"
            value={form.city}
            autoComplete="address-level2"
            onChange={(e) => {
              set("city", e.target.value);
              trackManualEdit("city");
            }}
            onBlur={() => markTouched("city")}
            className={cls("city")}
          />
          <Err k="city" />
          {/* Non-blocking PIN ↔ City notice — customer can still save & checkout. */}
          {cityMismatch && !errors.city && (
            <p className="text-[11px] text-amber-400/90 mt-1 flex items-start gap-1">
              <AlertCircle className="size-3 shrink-0 mt-0.5" />
              The city entered does not exactly match postal records. Please verify your address.
            </p>
          )}
        </div>
        <input
          placeholder="State / Region"
          value={form.state ?? ""}
          autoComplete="address-level1"
          onChange={(e) => {
            set("state", e.target.value);
            trackManualEdit("state");
          }}
          className={cls("state")}
        />
      </div>

      {/* PIN ↔ City mismatch is intentionally NOT surfaced: customers often
          enter nearby cities, towns, villages, or local names that differ from
          postal records, and that must never block or alarm them. */}



      <textarea
        placeholder="Delivery instructions (optional)"
        value={form.delivery_notes ?? ""}
        onChange={(e) => set("delivery_notes", e.target.value)}
        rows={2}
        className={`${base} border-border resize-none`}
      />

      {/* Internal address-quality scores, confidence %, and risk diagnostics
          are intentionally NOT surfaced to customers. */}


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
          type="button"
          onClick={submit}
          disabled={busy || blockedByServiceability}
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
    </div>
  );
}
