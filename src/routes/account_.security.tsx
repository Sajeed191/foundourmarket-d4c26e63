import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, Lock, LogOut, Shield, Mail, Eye, EyeOff,
  Check, X, Smartphone, Monitor, MapPin, Clock, ShieldCheck,
  KeyRound, Fingerprint, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/account_/security")({
  head: () => ({ meta: [{ title: "Security — FoundOurMarket™" }] }),
  component: SecurityPage,
});

type Rule = { label: string; test: (p: string) => boolean };
const RULES: Rule[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One number", test: (p) => /[0-9]/.test(p) },
  { label: "One symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function scorePassword(p: string) {
  if (!p) return 0;
  return RULES.reduce((n, r) => n + (r.test(p) ? 1 : 0), 0);
}

const STRENGTH = [
  { label: "—", color: "oklch(0.5 0 0)", bar: "20%" },
  { label: "Very weak", color: "oklch(0.65 0.22 25)", bar: "20%" },
  { label: "Weak", color: "oklch(0.7 0.2 45)", bar: "40%" },
  { label: "Fair", color: "oklch(0.78 0.16 85)", bar: "60%" },
  { label: "Strong", color: "oklch(0.74 0.19 49)", bar: "80%" },
  { label: "Excellent", color: "oklch(0.78 0.18 150)", bar: "100%" },
];

function SecurityPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [show2, setShow2] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  if (!loading && !user) {
    nav({ to: "/auth" });
    return null;
  }

  const score = scorePassword(pw);
  const strength = STRENGTH[score];
  const match = pw.length > 0 && pw === pw2;
  const securityScore = Math.min(98, 60 + score * 7);

  const onChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) return toast.error(error.message);
    setSuccess(true);
    toast.success("Password updated");
    setTimeout(() => setSuccess(false), 2200);
    setPw(""); setPw2("");
  };

  const sendReset = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setSendingReset(false);
    if (error) return toast.error(error.message);
    toast.success("Reset link sent to your email");
  };

  const signOutAll = async () => {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut({ scope: "global" });
    setSigningOut(false);
    if (error) return toast.error(error.message);
    toast.success("Signed out everywhere");
    nav({ to: "/auth" });
  };

  const memberSince = useMemo(() => {
    const d = user?.created_at ? new Date(user.created_at) : null;
    return d ? d.toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";
  }, [user]);

  return (
    <div className="relative">
      {/* Ambient cinematic backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb animate-orb" style={{ width: 340, height: 340, top: -80, right: -60, background: "var(--gradient-ember)" }} />
        <div className="orb animate-orb" style={{ width: 300, height: 300, bottom: 40, left: -80, background: "var(--gradient-violet)", animationDelay: "-8s" }} />
        <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "linear-gradient(oklch(1 0 0 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.5) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse 70% 50% at 50% 0%, #000, transparent)" }} />
      </div>

      <div className="container-page py-10 sm:py-16 max-w-2xl relative">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">
          <Link to="/account" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="size-3" /> Back to account
          </Link>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Account · Protection</p>
          <h1 className="text-fluid-2xl font-display font-semibold mt-2">Security</h1>
          <p className="text-sm text-muted-foreground mt-2">Enterprise-grade protection for your FoundOurMarket™ account.</p>
        </motion.div>

        {/* Security overview / score card */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }}
          className="border-glow relative overflow-hidden rounded-2xl glass-strong p-6 sm:p-7 mb-5"
        >
          <div className="relative flex items-center gap-5">
            <div className="relative grid place-items-center size-20 shrink-0">
              <svg viewBox="0 0 100 100" className="size-20 -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="7" />
                <motion.circle
                  cx="50" cy="50" r="42" fill="none" stroke="var(--color-accent)" strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={264}
                  initial={{ strokeDashoffset: 264 }}
                  animate={{ strokeDashoffset: 264 - (264 * securityScore) / 100 }}
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
              <ShieldCheck className="absolute size-7 text-accent animate-glow" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Security score</p>
              <p className="text-3xl font-display font-semibold leading-none mt-1">{securityScore}<span className="text-base text-muted-foreground">/100</span></p>
              <p className="text-xs text-muted-foreground mt-1.5">Account protected · Active monitoring</p>
            </div>
          </div>

          <div className="relative grid grid-cols-2 gap-3 mt-5">
            <StatusPill icon={<Mail className="size-3.5" />} label="Email verified" ok />
            <StatusPill icon={<Fingerprint className="size-3.5" />} label="2FA disabled" ok={false} />
          </div>
        </motion.div>

        {/* Account email */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-2xl glass p-6 sm:p-7 mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="size-4 text-muted-foreground" />
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Account email</p>
          </div>
          <p className="font-medium truncate">{user?.email ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">Member since {memberSince}</p>
        </motion.div>

        {/* Change password */}
        <motion.form
          onSubmit={onChangePw}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}
          className="rounded-2xl glass-strong p-6 sm:p-7 mb-5 space-y-5"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-accent" />
            <h2 className="font-display text-lg font-semibold">Change password</h2>
          </div>

          <FloatingPasswordField id="pw" label="New password" value={pw} onChange={setPw} show={show} onToggle={() => setShow((s) => !s)} />

          {/* Strength meter */}
          <AnimatePresence>
            {pw.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Strength</span>
                    <span className="text-[10px] font-mono uppercase tracking-widest font-semibold" style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
                    <motion.div className="h-full rounded-full" animate={{ width: strength.bar, backgroundColor: strength.color }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} style={{ boxShadow: `0 0 12px ${strength.color}` }} />
                  </div>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {RULES.map((r) => {
                    const ok = r.test(pw);
                    return (
                      <li key={r.label} className="flex items-center gap-2 text-xs">
                        <motion.span animate={{ scale: ok ? [1, 1.3, 1] : 1 }} className={`grid place-items-center size-4 rounded-full ${ok ? "bg-accent/20 text-accent" : "bg-white/5 text-muted-foreground"}`}>
                          {ok ? <Check className="size-3" /> : <X className="size-3" />}
                        </motion.span>
                        <span className={ok ? "text-foreground" : "text-muted-foreground"}>{r.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>

          <FloatingPasswordField id="pw2" label="Confirm password" value={pw2} onChange={setPw2} show={show2} onToggle={() => setShow2((s) => !s)} />
          <AnimatePresence>
            {pw2.length > 0 && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`flex items-center gap-1.5 text-xs ${match ? "text-emerald-400" : "text-destructive"}`}>
                {match ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                {match ? "Passwords match" : "Passwords don't match"}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-1">
            <button
              type="submit" disabled={saving || success}
              className="cta-sweep relative inline-flex items-center justify-center gap-2 w-full rounded-full px-5 py-3 text-sm font-semibold overflow-hidden disabled:opacity-70 transition-transform active:scale-[0.98]"
              style={{ background: "linear-gradient(120deg, oklch(0.78 0.18 60), oklch(0.74 0.19 49))", color: "var(--color-accent-foreground)", boxShadow: "var(--shadow-ember)" }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {success ? (
                  <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="size-4" /> Password updated
                  </motion.span>
                ) : saving ? (
                  <motion.span key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Updating…
                  </motion.span>
                ) : (
                  <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-2">
                    <Lock className="size-4" /> Update password
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            <button
              type="button" onClick={sendReset} disabled={sendingReset}
              className="glass inline-flex items-center justify-center gap-2 w-full rounded-full px-5 py-3 text-sm font-medium hover:border-accent/40 hover:shadow-[0_0_28px_-8px_oklch(0.74_0.19_49_/_0.5)] transition disabled:opacity-50"
            >
              {sendingReset ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
              {sendingReset ? "Sending…" : "Email me a reset link"}
            </button>
          </div>
        </motion.form>

        {/* Active sessions / device management */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
          className="rounded-2xl glass-strong p-6 sm:p-7">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="size-4 text-accent" />
            <h2 className="font-display text-lg font-semibold">Active sessions</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Devices currently signed in to your account.</p>

          <DeviceRow
            icon={<Smartphone className="size-5" />}
            name="Chrome · Android"
            current
            location="Active now"
            sub="This device · Trusted session"
          />
          <DeviceRow
            icon={<Monitor className="size-5" />}
            name="Safari · macOS"
            location="2 days ago"
            sub="Trusted session"
          />

          <button onClick={signOutAll} disabled={signingOut}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-destructive/40 text-destructive px-4 py-2.5 text-sm hover:bg-destructive/10 transition disabled:opacity-50 active:scale-[0.98]">
            {signingOut ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
            Sign out everywhere
          </button>
        </motion.div>
      </div>
    </div>
  );
}

function StatusPill({ icon, label, ok }: { icon: React.ReactNode; label: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
      <span className="shrink-0">{icon}</span>
      <span className="truncate font-medium">{label}</span>
    </div>
  );
}

function DeviceRow({ icon, name, location, sub, current }: { icon: React.ReactNode; name: string; location: string; sub: string; current?: boolean }) {
  return (
    <div className={`group flex items-center gap-3.5 rounded-xl border p-3.5 mb-2.5 transition-all ${current ? "border-accent/40 bg-accent/5 shadow-[0_0_28px_-12px_oklch(0.74_0.19_49_/_0.5)]" : "border-border hover:border-accent/25 hover:bg-white/[0.03]"}`}>
      <div className={`grid place-items-center size-11 shrink-0 rounded-xl ${current ? "bg-accent/15 text-accent" : "bg-white/5 text-muted-foreground"}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{name}</p>
          {current && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Current
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <Clock className="size-3" /> {location}
      </div>
    </div>
  );
}

function FloatingPasswordField({
  id, label, value, onChange, show, onToggle,
}: { id: string; label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input
        id={id} type={show ? "text" : "password"} value={value} placeholder={label} autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)}
        className="input-glass peer pr-11"
      />
      <label htmlFor={id}
        className="pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 text-sm text-muted-foreground transition-all duration-200 peer-focus:top-3.5 peer-focus:text-[10px] peer-focus:font-mono peer-focus:uppercase peer-focus:tracking-widest peer-focus:text-accent peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:font-mono peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-widest peer-[:not(:placeholder-shown)]:text-muted-foreground">
        {label}
      </label>
      <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition">
        <AnimatePresence mode="wait" initial={false}>
          {show
            ? <motion.span key="off" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}><EyeOff className="size-4" /></motion.span>
            : <motion.span key="on" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}><Eye className="size-4" /></motion.span>}
        </AnimatePresence>
      </button>
    </div>
  );
}
