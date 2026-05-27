import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, User as UserIcon, Loader2, ShieldCheck, Sparkles, Truck, Headphones, ArrowRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign In — FoundOurMarket™" }] }),
  component: AuthPage,
});

const ease = [0.16, 1, 0.3, 1] as const;

const BENEFITS = [
  { icon: Sparkles, label: "Personalized shopping experience" },
  { icon: Truck, label: "Faster order tracking & refunds" },
  { icon: Headphones, label: "Secure customer support access" },
  { icon: ShieldCheck, label: "Safer account recovery" },
];

function AuthPage() {
  const [mode, setMode] = useState<"oauth" | "email">("oauth");
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) nav({ to: "/account" });
  }, [user, nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        nav({ to: "/account" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: "/account" });
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setGoogleBusy(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
      extraParams: { prompt: "select_account" },
    });
    if (result.error) {
      setError("Couldn't connect to Google. Please try again.");
      setGoogleBusy(false);
      return;
    }
    if (result.redirected) return;
    nav({ to: "/auth/callback" });
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-5 py-10 overflow-hidden" style={{ background: "#050816" }}>
      {/* Ambient orbs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-[8%] left-1/2 -translate-x-1/2 w-[90vw] max-w-[700px] h-[55vh] rounded-full opacity-[0.22]"
          style={{ background: "radial-gradient(circle, #FF7A00 0%, transparent 70%)", filter: "blur(110px)" }} />
        <div className="absolute bottom-[2%] right-[-10%] w-[55vw] max-w-[480px] h-[40vh] rounded-full opacity-[0.15]"
          style={{ background: "radial-gradient(circle, #FF9F43 0%, transparent 70%)", filter: "blur(90px)" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
        className="relative w-full max-w-md mx-auto"
      >
        {/* Brand */}
        <div className="flex flex-col items-center mb-7">
          <div className="relative mb-4">
            <div className="size-[72px] rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_20px_60px_-12px_rgba(255,122,0,0.35)] bg-white/[0.04] grid place-items-center">
              <img src="/logo.jpeg" alt="FoundOurMarket" className="w-full h-full object-cover" />
            </div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.35, type: "spring", stiffness: 320, damping: 18 }}
              className="absolute -bottom-1 -right-1 size-6 rounded-full grid place-items-center shadow-[0_0_14px_rgba(255,122,0,0.55)]"
              style={{ background: "#FF7A00" }}
            >
              <Check className="size-3.5 text-black" strokeWidth={3} />
            </motion.div>
          </div>
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] mb-1" style={{ color: "#FF9F43" }}>
            FoundOurMarket™
          </p>
          <p className="text-[10px] text-white/50 tracking-wide">Find It. Shop It. Love It.</p>
        </div>

        {/* Headline */}
        <div className="text-center mb-6">
          <h1 className="text-[26px] sm:text-[30px] font-display font-semibold tracking-tight text-white mb-2">
            Connect Your Account
          </h1>
          <p className="text-sm text-white/60 leading-relaxed max-w-xs mx-auto">
            Securely sign in to personalize shopping, track orders, manage refunds, and access premium support.
          </p>
        </div>

        {/* Benefits */}
        {mode === "oauth" && (
          <div className="mb-6 rounded-2xl p-4 ring-1 ring-white/[0.06]" style={{ background: "rgba(255,255,255,0.03)" }}>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 mb-3 text-center">
              FoundOurMarket uses your account to
            </p>
            <ul className="space-y-2.5">
              {BENEFITS.map(({ icon: Icon, label }, i) => (
                <motion.li
                  key={label}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.07, duration: 0.4, ease }}
                  className="flex items-center gap-3 text-sm text-white/85"
                >
                  <span className="shrink-0 size-7 rounded-lg grid place-items-center" style={{ background: "rgba(255,122,0,0.12)", color: "#FF9F43" }}>
                    <Icon className="size-3.5" />
                  </span>
                  <span className="leading-snug">{label}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 rounded-xl px-3.5 py-2.5 text-xs text-red-300 ring-1 ring-red-500/20"
            style={{ background: "rgba(239,68,68,0.08)" }}
          >
            {error}
          </motion.div>
        )}

        {/* Email form */}
        {mode === "email" && (
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease }}
            onSubmit={onSubmit}
            className="space-y-3 mb-4"
          >
            {isSignup && (
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name"
                  className="w-full bg-white/[0.04] border border-white/10 text-white placeholder:text-white/40 rounded-full pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#FF7A00]" />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address"
                className="w-full bg-white/[0.04] border border-white/10 text-white placeholder:text-white/40 rounded-full pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#FF7A00]" />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
              <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
                className="w-full bg-white/[0.04] border border-white/10 text-white placeholder:text-white/40 rounded-full pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#FF7A00]" />
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={busy}
              className="w-full py-3.5 rounded-full text-sm font-semibold text-black inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(255,122,0,0.6)] hover:brightness-110 transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #FF7A00, #FF9F43)" }}
            >
              {busy ? <><Loader2 className="size-4 animate-spin" /> Signing in…</> : <>{isSignup ? "Create Account" : "Sign In"} <ArrowRight className="size-4" /></>}
            </motion.button>
          </motion.form>
        )}

        {/* OAuth CTAs */}
        {mode === "oauth" && (
          <div className="space-y-3 mb-4">
            <motion.button
              onClick={onGoogle}
              whileTap={{ scale: 0.97 }}
              disabled={googleBusy}
              className="w-full py-3.5 rounded-full text-sm font-semibold text-black inline-flex items-center justify-center gap-2.5 shadow-[0_12px_36px_-10px_rgba(255,122,0,0.65)] hover:brightness-110 transition-all disabled:opacity-70"
              style={{ background: "linear-gradient(135deg, #FF7A00, #FF9F43)" }}
            >
              {googleBusy ? (
                <><Loader2 className="size-4 animate-spin" /> Connecting account…</>
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </motion.button>
            <button
              onClick={() => setMode("email")}
              className="w-full py-3.5 rounded-full text-sm font-medium text-white/90 border border-white/10 hover:bg-white/[0.04] transition-all"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              Continue with Email
            </button>
          </div>
        )}

        {mode === "email" && (
          <button
            onClick={() => { setMode("oauth"); setError(null); }}
            className="w-full text-center text-xs text-white/50 hover:text-white/80 transition-colors mb-4"
          >
            ← Back to all sign-in options
          </button>
        )}

        {/* Trust microcopy */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          <ShieldCheck className="size-3 text-white/40" />
          <p className="text-[10px] text-white/45 tracking-wide">
            Protected account · Secure sign in · Trusted support
          </p>
        </div>

        {/* Mode toggle for email */}
        {mode === "email" && (
          <p className="text-center text-xs text-white/55">
            {isSignup ? "Already have an account?" : "New to FoundOurMarket?"}{" "}
            <button onClick={() => setIsSignup(!isSignup)} className="font-medium hover:underline" style={{ color: "#FF9F43" }}>
              {isSignup ? "Sign in" : "Create account"}
            </button>
          </p>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-white/35 mt-6 px-4 leading-relaxed">
          By continuing, you agree to our{" "}
          <Link to="/pages/$slug" params={{ slug: "terms" }} className="underline hover:text-white/60">Terms</Link>{" "}
          &{" "}
          <Link to="/pages/$slug" params={{ slug: "privacy" }} className="underline hover:text-white/60">Privacy Policy</Link>
        </p>
        <p className="text-center mt-4">
          <Link to="/" className="text-[11px] text-white/40 hover:text-white/70">← Back to shop</Link>
        </p>
      </motion.div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-[18px]" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}
