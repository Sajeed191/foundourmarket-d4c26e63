import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  User as UserIcon,
  Mail,
  Phone,
  PhoneCall,
  Globe,
  Upload,
  Trash2,
  ShieldCheck,
  Check,
  X,
  Search,
  ChevronDown,
  Calendar,
  Languages,
  Clock,
  Users,
} from "lucide-react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { saveProfile } from "@/lib/profile.functions";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { cn } from "@/lib/utils";
import { ThemeSelector } from "@/components/site/ThemeSelector";

export const Route = createFileRoute("/account_/profile")({
  head: () => ({ meta: [{ title: "Edit Profile — FoundOurMarket™" }] }),
  component: EditProfilePage,
});

/* ── Country reference data (ISO → name, dial code, flag) ── */
function flagEmoji(cc: string): string {
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const REGION_NAMES =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

type Country = { cc: CountryCode; name: string; dial: string };

const COUNTRIES: Country[] = getCountries()
  .map((cc) => ({
    cc,
    name: REGION_NAMES?.of(cc) ?? cc,
    dial: getCountryCallingCode(cc),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const BY_CC = new Map(COUNTRIES.map((c) => [c.cc, c]));
const BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c]));

/** Resolve a stored country (name or ISO code) into a Country record. */
function resolveCountry(value: string | null | undefined): Country | null {
  if (!value) return null;
  const v = value.trim();
  if (BY_CC.has(v.toUpperCase() as CountryCode)) return BY_CC.get(v.toUpperCase() as CountryCode)!;
  return BY_NAME.get(v.toLowerCase()) ?? null;
}

type Form = {
  fullName: string;
  phone: string; // national digits only
  altPhone: string; // national digits only
  gender: string;
  birthDate: string;
  countryCode: CountryCode | "";
  language: string;
  timezone: string;
  avatarUrl: string;
};

const EMPTY: Form = {
  fullName: "",
  phone: "",
  altPhone: "",
  gender: "",
  birthDate: "",
  countryCode: "",
  language: "",
  timezone: "",
  avatarUrl: "",
};

const GENDERS = ["", "Female", "Male", "Non-binary", "Prefer not to say"];

const DIGITS_ONLY = /[^0-9]/g;
const HAS_NON_DIGIT = /[^0-9]/;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

function EditProfilePage() {
  const { user, loading } = useAuth();
  const { market, countryCode: detectedCC } = useRegion();
  const nav = useNavigate();
  const saveProfileFn = useServerFn(saveProfile);
  const [form, setForm] = useState<Form>(EMPTY);
  const [initial, setInitial] = useState<Form>(EMPTY);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // India lock: account market, detected geo, or phone country code → India.
  const isIndia =
    market === "india" ||
    detectedCC === "IN" ||
    form.countryCode === "IN";

  // Country validation (international only).
  const [countryStatus, setCountryStatus] =
    useState<"idle" | "checking" | "valid" | "invalid">("idle");

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const onPickAvatar = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      set("avatarUrl", data.publicUrl);
      toast.success("Photo uploaded");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name,phone,alt_phone,gender,birth_date,country,country_code,language,timezone,avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        // Resolve stored country (name/ISO) and stored phones into national digits.
        const storedCountry = resolveCountry(data?.country_code ?? data?.country);
        const parsedPhone = data?.phone ? parsePhoneNumberFromString(data.phone) : undefined;
        const parsedAlt = data?.alt_phone ? parsePhoneNumberFromString(data.alt_phone) : undefined;
        const next: Form = {
          fullName: data?.full_name ?? (user.user_metadata?.full_name as string) ?? "",
          phone: parsedPhone?.nationalNumber ?? (data?.phone ?? "").replace(DIGITS_ONLY, ""),
          altPhone: parsedAlt?.nationalNumber ?? (data?.alt_phone ?? "").replace(DIGITS_ONLY, ""),
          gender: data?.gender ?? "",
          birthDate: data?.birth_date ?? "",
          countryCode:
            (storedCountry?.cc as CountryCode) ??
            (market === "india" || detectedCC === "IN" ? "IN" : (detectedCC as CountryCode) ?? ""),
          language: data?.language ?? "",
          timezone: data?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""),
          avatarUrl: data?.avatar_url ?? (user.user_metadata?.avatar_url as string) ?? "",
        };
        setForm(next);
        setInitial(next);
        setFetching(false);
      });
  }, [user, market, detectedCC]);

  // Force India lock whenever Indian context is detected.
  useEffect(() => {
    if (isIndia && form.countryCode !== "IN") set("countryCode", "IN");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIndia]);

  // Debounced country validation for international users.
  useEffect(() => {
    if (isIndia) { setCountryStatus("idle"); return; }
    if (!form.countryCode) { setCountryStatus("idle"); return; }
    setCountryStatus("checking");
    const t = setTimeout(() => {
      setCountryStatus(BY_CC.has(form.countryCode as CountryCode) ? "valid" : "invalid");
    }, 1200);
    return () => clearTimeout(t);
  }, [form.countryCode, isIndia]);

  /* ── Validation ── */
  const activeCC: CountryCode = (isIndia ? "IN" : (form.countryCode || "")) as CountryCode;

  const validatePhone = (digits: string): string | null => {
    if (!digits) return null; // optional
    if (HAS_NON_DIGIT.test(digits)) return "Only numbers are allowed";
    if (activeCC) {
      const parsed = parsePhoneNumberFromString(digits, activeCC);
      if (!parsed || !parsed.isValid()) return "Enter a valid phone number";
    } else if (digits.length < 6) {
      return "Enter a valid phone number";
    }
    return null;
  };

  const nameError = (() => {
    const v = form.fullName.trim();
    if (!v) return null;
    if (v.length < 2) return "Name must be at least 2 characters";
    const emojis = (v.match(EMOJI_RE) || []).length;
    if (emojis > 2) return "Too many emojis in name";
    const specials = (v.replace(EMOJI_RE, "").match(/[^\p{L}\p{N}\s.'-]/gu) || []).length;
    if (specials > 3) return "Too many special characters";
    return null;
  })();

  const dobError = (() => {
    if (!form.birthDate) return null;
    const d = new Date(form.birthDate);
    if (Number.isNaN(d.getTime())) return "Invalid date";
    const now = new Date();
    if (d > now) return "Date of birth cannot be in the future";
    const age = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 13) return "You must be at least 13 years old";
    if (age > 120) return "Please enter a valid date of birth";
    return null;
  })();

  const phoneError = validatePhone(form.phone);
  const altPhoneError = validatePhone(form.altPhone);
  const countryError = !isIndia && form.countryCode && countryStatus === "invalid"
    ? "Invalid country selection"
    : null;

  const hasErrors = Boolean(
    nameError || dobError || phoneError || altPhoneError || countryError,
  );

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  );

  const maxDob = new Date().toISOString().split("T")[0];

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || saving || saved) return;
    if (hasErrors) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      const cc = activeCC || null;
      const country = cc ? BY_CC.get(cc)?.name ?? null : null;
      const dial = cc ? getCountryCallingCode(cc) : "";
      const e164 = (digits: string) =>
        digits && dial ? `+${dial}${digits}` : digits || null;
      // Server validates phone numbers again before persisting.
      await saveProfileFn({
        data: {
          full_name: form.fullName.trim() || null,
          phone: e164(form.phone.trim()),
          alt_phone: e164(form.altPhone.trim()),
          gender: form.gender.trim() || null,
          birth_date: form.birthDate || null,
          country,
          country_code: cc,
          language: form.language.trim() || null,
          timezone: form.timezone.trim() || null,
          avatar_url: form.avatarUrl.trim() || null,
        },
      });
      await supabase.auth.updateUser({ data: { full_name: form.fullName.trim(), avatar_url: form.avatarUrl.trim() } });
      setSaved(true);
      setInitial(form);
      toast.success("Profile updated successfully");
      setTimeout(() => nav({ to: "/account" }), 900);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save profile");
      setSaving(false);
    }
  };

  if (loading || !user || fetching) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-accent" />
      </div>
    );
  }

  const initials = (form.fullName || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient lighting backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="orb" style={{ width: 340, height: 340, top: -80, left: -60, background: "var(--gradient-ember)" }} />
        <div className="orb" style={{ width: 300, height: 300, bottom: 40, right: -80, background: "var(--gradient-violet)", animationDelay: "-8s" }} />
        <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 lg:pt-16 pb-8 sm:pb-12 lg:pb-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <Link to="/account" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-accent mb-6 transition-colors">
            <ArrowLeft className="size-3.5" /> Back to account
          </Link>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Account · Personal info</p>
          <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-8 tracking-tight">
            Edit <span className="text-gradient-ember">profile</span>
          </h1>

          {/* ── Clean minimalist profile header ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.5 }}
            className="glass-strong rounded-3xl p-5 sm:p-6 mb-6 relative overflow-hidden border border-white/10"
          >
            
            <div className="relative flex items-center gap-4 sm:gap-5">
              {/* Avatar with glow + online indicator */}
              <div className="relative shrink-0">
                <div aria-hidden className="absolute inset-0 -m-2 rounded-full blur-xl opacity-60 animate-glow" style={{ background: "var(--gradient-ember)" }} />
                <div className="relative size-20 sm:size-24 rounded-full overflow-hidden border border-white/15 grid place-items-center bg-card shadow-[var(--shadow-ember)]">
                  {form.avatarUrl ? (
                    <img src={form.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-display font-semibold text-accent">{initials}</span>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/60 grid place-items-center">
                      <Loader2 className="size-5 animate-spin text-accent" />
                    </div>
                  )}
                </div>
                <span className="absolute bottom-1 right-1 size-3.5 rounded-full bg-emerald-500 border-2 border-card shadow-[0_0_10px_oklch(0.7_0.18_150)]" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-accent mb-1 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_oklch(0.7_0.18_150)] animate-pulse" /> Online
                </p>
                <p className="text-base sm:text-lg font-semibold truncate">{form.fullName || "Your name"}</p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                  <Mail className="size-3 shrink-0" /> {user.email}
                </p>
              </div>
            </div>

            <div className="relative mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest border border-accent/30 bg-accent/5 rounded-full px-3.5 py-2 min-h-[44px] hover:border-accent/60 hover:bg-accent/10 hover:text-accent transition-all active:scale-95 disabled:opacity-60"
              >
                <Upload className="size-3" /> {form.avatarUrl ? "Change photo" : "Upload photo"}
              </button>
              {form.avatarUrl && (
                <button
                  type="button"
                  onClick={() => set("avatarUrl", "")}
                  className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground min-h-[44px] px-2 hover:text-destructive transition-colors active:scale-95"
                >
                  <Trash2 className="size-3" /> Remove photo
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickAvatar(f); e.target.value = ""; }}
              />
            </div>
          </motion.div>

          <form onSubmit={onSubmit} className="space-y-6">
            {/* ── Personal Information ── */}
            <Section title="Personal Information" delay={0.1}>
              <FloatingField icon={UserIcon} label="Full name">
                <input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} maxLength={100} placeholder=" " className="peer input-glass" />
              </FloatingField>
              <FieldError msg={nameError} />
              <FloatingField icon={Mail} label="Email" disabled>
                <input value={user.email ?? ""} disabled placeholder=" " className="peer input-glass !text-muted-foreground" />
              </FloatingField>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="relative group">
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-accent transition-colors z-10" />
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className="input-glass input-glass-static !pl-11 !pr-10 appearance-none">
                    {GENDERS.map((g) => <option key={g} value={g} className="bg-card">{g || "Gender"}</option>)}
                  </select>
                </div>
                <div className="relative group">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-accent transition-colors z-10" />
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none z-10" />
                  <input type="date" max={maxDob} value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} className="input-glass input-glass-static !pl-11 !pr-10 relative" />
                </div>

              </div>

              <FieldError msg={dobError} />
            </Section>

            {/* ── Region ── */}
            <Section title="Region" delay={0.15}>
              {isIndia ? (
                <div className="relative">
                  <div className="input-glass input-glass-static !pl-11 flex items-center gap-2 cursor-not-allowed opacity-95">
                    <span className="text-base leading-none">🇮🇳</span>
                    <span>India</span>
                    <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-accent">INR ₹ · Locked</span>
                  </div>
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                </div>

              ) : (
                <>
                  <CountrySelect
                    value={form.countryCode || null}
                    onChange={(cc) => set("countryCode", cc)}
                  />
                  <CountryStatus status={countryStatus} />
                </>
              )}
            </Section>

            {/* ── Contact Details ── */}
            <Section title="Contact Details" delay={0.2}>
              <PhoneField
                icon={Phone}
                label="Phone number"
                dial={activeCC ? getCountryCallingCode(activeCC) : ""}
                flag={activeCC ? flagEmoji(activeCC) : "🌐"}
                value={form.phone}
                onChange={(v) => set("phone", v)}
                error={phoneError}
                locked={isIndia}
              />
              <PhoneField
                icon={PhoneCall}
                label="Alternate phone"
                dial={activeCC ? getCountryCallingCode(activeCC) : ""}
                flag={activeCC ? flagEmoji(activeCC) : "🌐"}
                value={form.altPhone}
                onChange={(v) => set("altPhone", v)}
                error={altPhoneError}
                locked={isIndia}
              />
            </Section>

            {/* ── Preferences ── */}
            <Section title="Preferences" delay={0.25}>
              <div className="grid sm:grid-cols-2 gap-4">
                <FloatingField icon={Languages} label="Language">
                  <input value={form.language} onChange={(e) => set("language", e.target.value)} maxLength={40} placeholder=" " className="peer input-glass" />
                </FloatingField>
                <FloatingField icon={Clock} label="Timezone">
                  <input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} maxLength={60} placeholder=" " className="peer input-glass" />
                </FloatingField>
              </div>
              <div className="mt-4">
                <ThemeSelector />
              </div>
            </Section>

            {/* ── Actions ── */}
            <div className="flex items-center gap-3 pt-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                whileHover={{ y: -2 }}
                type="submit"
                disabled={saving || saved || !dirty || hasErrors}
                className={`relative flex-1 inline-flex items-center justify-center gap-2 font-bold py-3.5 px-8 rounded-2xl text-xs uppercase tracking-widest shadow-[var(--shadow-ember)] transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden ${
                  saved
                    ? "bg-emerald-500 text-white"
                    : "bg-gradient-to-r from-accent to-amber-400 text-accent-foreground hover:brightness-110 cta-sweep"
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {saved ? (
                    <motion.span key="done" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-2">
                      <Check className="size-4" /> Saved
                    </motion.span>
                  ) : saving ? (
                    <motion.span key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-2">
                      <Loader2 className="size-3.5 animate-spin" /> Saving…
                    </motion.span>
                  ) : (
                    <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-2">
                      <ShieldCheck className="size-3.5" /> Save changes
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
              <Link
                to="/account"
                className="inline-flex items-center justify-center text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground glass border border-white/12 hover:border-accent/40 rounded-2xl px-6 py-3.5 transition-all active:scale-95"
              >
                Cancel
              </Link>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Country status indicator ── */
function CountryStatus({ status }: { status: "idle" | "checking" | "valid" | "invalid" }) {
  if (status === "idle") return null;
  if (status === "checking")
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Validating country…
      </p>
    );
  if (status === "valid")
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400">
        <Check className="size-3" /> Valid country
      </p>
    );
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-destructive">
      <X className="size-3" /> Invalid country selection
    </p>
  );
}

function FieldError({ msg, className }: { msg: string | null; className?: string }) {
  if (!msg) return null;
  return (
    <p className={cn("-mt-2 flex items-center gap-1.5 text-[11px] text-destructive", className)}>
      <X className="size-3 shrink-0" /> {msg}
    </p>
  );
}

/* ── Searchable country dropdown (international) ── */
function CountrySelect({
  value,
  onChange,
}: {
  value: CountryCode | null;
  onChange: (cc: CountryCode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = value ? BY_CC.get(value) : null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.cc.toLowerCase().includes(q) || c.dial.includes(q),
    );
  }, [query]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="input-glass input-glass-static !pl-11 flex items-center gap-2 text-left"
      >

        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        {selected ? (
          <>
            <span className="text-base leading-none">{flagEmoji(selected.cc)}</span>
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Select country</span>
        )}
        <ChevronDown className="ml-auto size-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full max-h-64 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              autoFocus
              placeholder="Search country"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.map((c) => (
              <li key={c.cc}>
                <button
                  type="button"
                  onClick={() => { onChange(c.cc); setOpen(false); setQuery(""); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-accent/10"
                >
                  <span className="text-base leading-none">{flagEmoji(c.cc)}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">+{c.dial}</span>
                  {c.cc === value && <Check className="size-3.5 text-accent" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Phone field with locked dial-code prefix + digit-only input ── */
function PhoneField({
  icon: Icon,
  label,
  dial,
  flag,
  value,
  onChange,
  error,
  locked,
}: {
  icon: typeof Phone;
  label: string;
  dial: string;
  flag: string;
  value: string;
  onChange: (digits: string) => void;
  error: string | null;
  locked?: boolean;
}) {
  const [typedSymbol, setTypedSymbol] = useState(false);

  const handle = (raw: string) => {
    const cleaned = raw.replace(DIGITS_ONLY, "");
    setTypedSymbol(raw !== cleaned);
    onChange(cleaned);
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-stretch rounded-2xl border bg-background/60 transition-all focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/40",
          error ? "border-destructive/60" : "border-border",
        )}
      >
        <span
          className="flex items-center gap-1.5 pl-4 pr-2.5 text-sm border-r border-border/70 shrink-0 select-none"
          aria-label={locked ? "Country code locked" : "Country code"}
        >

          <Icon className="size-4 text-muted-foreground" />
          <span className="text-base leading-none">{flag}</span>
          <span className="font-mono text-xs text-muted-foreground">{dial ? `+${dial}` : ""}</span>
        </span>
        <input
          inputMode="numeric"
          autoComplete="tel"
          placeholder={label}
          value={value}
          onChange={(e) => handle(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            handle((value + e.clipboardData.getData("text")));
          }}
          className="flex-1 min-w-0 bg-transparent px-3 py-[0.925rem] text-sm outline-none"
        />
      </div>
      <FieldError className="mt-2" msg={error ?? (typedSymbol ? "Only numbers are allowed" : null)} />
    </div>
  );
}

function Section({ title, delay, children }: { title: string; delay: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glass rounded-3xl p-5 sm:p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-accent">{title}</h2>
        <div className="h-px flex-1 bg-gradient-to-r from-accent/30 via-white/10 to-transparent" />
      </div>
      <div className="space-y-4">{children}</div>
    </motion.div>
  );
}

function FloatingField({
  icon: Icon,
  label,
  children,
  disabled,
}: {
  icon: typeof UserIcon;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group">
      <Icon className={`absolute left-4 top-1/2 -translate-y-1/2 size-4 transition-colors ${disabled ? "text-muted-foreground/50" : "text-muted-foreground group-focus-within:text-accent"}`} />
      {children}
      <label className="pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 text-sm text-muted-foreground transition-all duration-200 peer-focus:top-1 peer-focus:-translate-y-0 peer-focus:text-[10px] peer-focus:font-mono peer-focus:uppercase peer-focus:tracking-[0.2em] peer-focus:text-accent peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:-translate-y-0 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:font-mono peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-[0.2em] peer-[:not(:placeholder-shown)]:text-muted-foreground">
        {label}
      </label>
    </div>
  );
}
