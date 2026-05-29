import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  User as UserIcon,
  Mail,
  Phone,
  Globe,
  Upload,
  Trash2,
  Camera,
  BadgeCheck,
  Crown,
  Sparkles,
  ShieldCheck,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/account_/profile")({
  head: () => ({ meta: [{ title: "Edit Profile — FoundOurMarket™" }] }),
  component: EditProfilePage,
});

function EditProfilePage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);


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
      setAvatarUrl(data.publicUrl);
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
      .select("full_name,phone,country,avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name ?? (user.user_metadata?.full_name as string) ?? "");
        setPhone(data?.phone ?? "");
        setCountry(data?.country ?? "");
        setAvatarUrl(data?.avatar_url ?? (user.user_metadata?.avatar_url as string) ?? "");
        setFetching(false);
      });
  }, [user]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          country: country.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        }, { onConflict: "id" });
      if (error) throw error;
      await supabase.auth.updateUser({ data: { full_name: fullName.trim(), avatar_url: avatarUrl.trim() } });
      setSaved(true);
      toast.success("Profile updated");
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

  const initials = (fullName || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient lighting backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="orb animate-orb" style={{ width: 340, height: 340, top: -80, left: -60, background: "var(--gradient-ember)" }} />
        <div className="orb animate-orb" style={{ width: 300, height: 300, bottom: 40, right: -80, background: "var(--gradient-violet)", animationDelay: "-8s" }} />
        <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
        {[...Array(6)].map((_, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-accent/40"
            style={{ width: 3, height: 3, left: `${12 + i * 15}%`, top: `${20 + (i % 3) * 22}%` }}
            animate={{ y: [0, -22, 0], opacity: [0.15, 0.6, 0.15] }}
            transition={{ duration: 6 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.7 }}
          />
        ))}
      </div>


      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 lg:pt-16 pb-32 sm:pb-12 lg:pb-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <Link to="/account" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-accent mb-6 transition-colors">
            <ArrowLeft className="size-3.5" /> Back to account
          </Link>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Account · Personal info</p>
          <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-8 tracking-tight">
            Edit <span className="text-gradient-ember">profile</span>
          </h1>

          {/* ── Profile header card ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: [0, -5, 0] }}
            transition={{ opacity: { delay: 0.05, duration: 0.5 }, y: { duration: 7, repeat: Infinity, ease: "easeInOut" } }}
            className="border-glow glass-strong rounded-3xl p-5 sm:p-6 mb-6 relative overflow-hidden"

          >
            <div aria-hidden className="absolute -top-16 left-8 size-40 rounded-full blur-3xl opacity-60" style={{ background: "var(--gradient-ember-soft)" }} />
            <div className="relative flex items-center gap-4">
              {/* Avatar with radial glow + pulse */}
              <div className="relative shrink-0">
                <div aria-hidden className="absolute inset-0 -m-2 rounded-full blur-xl opacity-70 animate-glow" style={{ background: "var(--gradient-ember)" }} />
                <div className="relative size-20 sm:size-24 rounded-full overflow-hidden border border-white/15 grid place-items-center bg-card shadow-[var(--shadow-ember)]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-display font-semibold text-accent">{initials}</span>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/60 grid place-items-center">
                      <Loader2 className="size-5 animate-spin text-accent" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-base sm:text-lg font-semibold truncate">{fullName || "Your name"}</p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                  <Mail className="size-3 shrink-0" /> {user.email}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Badge icon={BadgeCheck} label="Verified" />
                  <Badge icon={Crown} label="Premium" tone="gold" />
                  <Badge icon={Sparkles} label="Gold Shopper" />
                </div>
              </div>
            </div>

            <div className="relative mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest border border-accent/30 bg-accent/5 rounded-full px-3.5 py-2 hover:border-accent/60 hover:bg-accent/10 hover:text-accent transition-all active:scale-95 disabled:opacity-60"
              >
                <Upload className="size-3" /> {avatarUrl ? "Change photo" : "Upload photo"}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl("")}
                  className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors active:scale-95"
                >
                  <Trash2 className="size-3" /> Remove
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
              <FloatingField icon={UserIcon} label="Full name" value={fullName}>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={100}
                  placeholder=" "
                  className="peer input-glass"
                />
              </FloatingField>
              <FloatingField icon={Mail} label="Email" value={user.email ?? ""} disabled>
                <input value={user.email ?? ""} disabled placeholder=" " className="peer input-glass !text-muted-foreground" />
              </FloatingField>
            </Section>

            {/* ── Contact Details ── */}
            <Section title="Contact Details" delay={0.15}>
              <FloatingField icon={Phone} label="Phone" value={phone}>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={30}
                  placeholder=" "
                  className="peer input-glass"
                />
              </FloatingField>
              <FloatingField icon={Globe} label="Country" value={country}>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  maxLength={60}
                  placeholder=" "
                  className="peer input-glass"
                />
              </FloatingField>
            </Section>

            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
              <Camera className="size-3" /> Uploads support gallery, camera, and albums on mobile.
            </p>

            {/* ── Actions ── */}
            <div className="flex items-center gap-3 pt-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                whileHover={{ y: -2 }}
                type="submit"
                disabled={saving || saved}
                className={`relative flex-1 inline-flex items-center justify-center gap-2 font-bold py-3.5 px-8 rounded-2xl text-xs uppercase tracking-widest shadow-[var(--shadow-ember)] transition-all disabled:opacity-90 overflow-hidden ${
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
  value: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group">
      <Icon className={`absolute left-4 top-1/2 -translate-y-1/2 size-4 transition-colors ${disabled ? "text-muted-foreground/50" : "text-muted-foreground group-focus-within:text-accent"}`} />
      {children}
      <label className="pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 text-sm text-muted-foreground transition-all duration-200 peer-focus:top-2.5 peer-focus:text-[10px] peer-focus:font-mono peer-focus:uppercase peer-focus:tracking-[0.2em] peer-focus:text-accent peer-[:not(:placeholder-shown)]:top-2.5 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:font-mono peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-[0.2em] peer-[:not(:placeholder-shown)]:text-muted-foreground">
        {label}
      </label>
    </div>
  );
}

function Badge({ icon: Icon, label, tone }: { icon: typeof UserIcon; label: string; tone?: "gold" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-mono uppercase tracking-widest border ${
        tone === "gold"
          ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
          : "border-accent/30 bg-accent/8 text-accent"
      }`}
    >
      <Icon className="size-2.5" /> {label}
    </span>
  );
}
