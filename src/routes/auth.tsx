import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, User as UserIcon, Loader2, ShieldCheck, Sparkles, Truck, Headphones, ArrowRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { safeInternalPath } from "@/lib/safe-redirect";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign In — FoundOurMarket™" },
      { name: "description", content: "Sign in or create your FoundOurMarket account to track orders, save wishlists, and enjoy a faster, personalized checkout." },
      { property: "og:title", content: "Sign In — FoundOurMarket™" },
      { property: "og:description", content: "Access your FoundOurMarket account to track orders and check out faster." },
      { property: "og:url", content: "https://foundourmarket.com/auth" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/auth" }],
  }),
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
  const { redirect } = Route.useSearch();
  const { user } = useAuth();

  // Resolve the post-login destination (search param wins, else stored path, else account).
  const resolveDest = (): string => {
    const fromParam = safeInternalPath(redirect);
    if (fromParam) return fromParam;
    if (typeof window !== "undefined") {
      const stored = safeInternalPath(localStorage.getItem("post_auth_redirect"));
      if (stored) {
        localStorage.removeItem("post_auth_redirect");
        return stored;
      }
    }
    return "/account";
  };

  useEffect(() => {
    if (user) nav({ to: resolveDest() as any });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        nav({ to: resolveDest() as any });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: resolveDest() as any });
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
    <div className="relative min-h-screen flex items-center justify-center px-5 py-6 sm:py-10 overflow-hidden" style={{ background: "#050816" }}>
      {/* Ambient orbs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.22 }}
          transition={{ duration: 1.4, ease }}
          className="absolute top-[6%] left-1/2 -translate-x-1/2 w-[95vw] max-w-[720px] h-[58vh] rounded-full"
          style={{ background: "radial-gradient(circle, #FF7A00 0%, transparent 70%)", filter: "blur(120px)" }}
        />
        <div className="absolute bottom-[2%] right-[-10%] w-[55vw] max-w-[480px] h-[40vh] rounded-full opacity-[0.14]"
          style={{ background: "radial-gradient(circle, #FF9F43 0%, transparent 70%)", filter: "blur(90px)" }} />
        {/* subtle grain */}
        <div className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "3px 3px" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease }}
        className="relative w-full max-w-[400px] mx-auto"
      >
        {/* Brand */}
        <div className="flex flex-col items-center mb-5">
          <div className="relative mb-3.5">
            {/* radial halo */}
            <motion.div
              aria-hidden
              animate={{ opacity: [0.45, 0.8, 0.45], scale: [1, 1.08, 1] }}
              transition={{ duration: 3.6, ease: "easeInOut", repeat: Infinity }}
              className="absolute inset-0 -m-8 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(255,122,0,0.45) 0%, transparent 65%)", filter: "blur(22px)" }}
            />
            <div className="relative size-[76px] rounded-[20px] overflow-hidden ring-1 ring-white/15 shadow-[0_24px_70px_-14px_rgba(255,122,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] bg-white/[0.04] grid place-items-center">
              <img src="/logo.webp" alt="FoundOurMarket" className="w-full h-full object-cover" />
            </div>
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 340, damping: 18 }}
              className="absolute -bottom-1 -right-1 size-[22px] rounded-full grid place-items-center shadow-[0_0_16px_rgba(255,122,0,0.7),0_2px_6px_rgba(0,0,0,0.4)] ring-2 ring-[#050816]"
              style={{ background: "linear-gradient(135deg, #FF7A00, #FF9F43)" }}
            >
              <Check className="size-3 text-black" strokeWidth={3.2} />
            </motion.div>
          </div>
          <p className="text-[10px] font-mono uppercase tracking-[0.38em] mb-0.5" style={{ color: "#FF9F43" }}>
            FoundOurMarket™
          </p>
          <p className="text-[10px] text-white/45 tracking-wide">Find It. Shop It. Love It.</p>
        </div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5, ease }}
          className="text-center mb-5"
        >
          <h1 className="text-[30px] sm:text-[34px] font-display font-semibold tracking-[-0.02em] text-white mb-1.5 leading-[1.05]">
            Connect Your Account
          </h1>
          <p className="text-[13px] text-white/70 leading-[1.5] max-w-[300px] mx-auto">
            Sign in securely to personalize shopping, track orders, and access premium support.
          </p>
        </motion.div>

        {/* Benefits */}
        {mode === "oauth" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5, ease }}
            className="relative mb-5 rounded-2xl p-3.5 ring-1 ring-white/[0.08] backdrop-blur-xl overflow-hidden"
            style={{ background: "linear-gradient(160deg, rgba(255,159,67,0.06) 0%, rgba(255,255,255,0.025) 50%, rgba(255,122,0,0.04) 100%)" }}
          >
            {/* edge light */}
            <div aria-hidden className="absolute inset-x-6 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,159,67,0.5), transparent)" }} />
            <p className="text-[9.5px] font-mono uppercase tracking-[0.28em] text-white/45 mb-3 text-center">
              FoundOurMarket uses your account to
            </p>
            <ul className="space-y-2">
              {BENEFITS.map(({ icon: Icon, label }, i) => (
                <motion.li
                  key={label}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.06, duration: 0.4, ease }}
                  className="flex items-center gap-3 text-[13px] text-white/90"
                >
                  <span className="shrink-0 size-7 rounded-lg grid place-items-center ring-1 ring-[#FF7A00]/20 shadow-[0_0_12px_-4px_rgba(255,122,0,0.5)]"
                    style={{ background: "linear-gradient(135deg, rgba(255,122,0,0.18), rgba(255,159,67,0.08))", color: "#FFB369" }}>
                    <Icon className="size-[14px]" />
                  </span>
                  <span className="leading-snug">{label}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
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
            className="space-y-2.5 mb-4"
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
            {!isSignup && (
              <button type="button" onClick={onForgot} disabled={busy}
                className="block w-full text-right text-xs text-white/55 hover:text-white/80 transition-colors -mt-1">
                Forgot password?
              </button>
            )}
            <motion.button
              whileTap={{ scale: 0.975 }}
              disabled={busy}
              className="w-full py-3.5 rounded-full text-sm font-semibold text-black inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(255,122,0,0.35)] hover:brightness-110 transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #FF7A00 0%, #FF9F43 100%)" }}
            >
              {busy ? <><Loader2 className="size-4 animate-spin" /> Signing in…</> : <>{isSignup ? "Create Account" : "Sign In"} <ArrowRight className="size-4" /></>}
            </motion.button>
          </motion.form>
        )}

        {/* OAuth CTAs */}
        {mode === "oauth" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.45, ease }}
            className="space-y-2.5 mb-3.5"
          >
            <motion.button
              onClick={onGoogle}
              whileTap={{ scale: 0.975 }}
              whileHover={{ y: -1 }}
              disabled={googleBusy}
              className="relative group w-full py-[15px] rounded-full text-[14px] font-semibold text-black inline-flex items-center justify-center gap-2.5 shadow-[0_10px_30px_rgba(255,122,0,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_14px_38px_rgba(255,122,0,0.45),inset_0_1px_0_rgba(255,255,255,0.4)] transition-all disabled:opacity-70 overflow-hidden"
              style={{ background: "linear-gradient(135deg, #FF7A00 0%, #FF9F43 100%)" }}
            >
              {/* shine sweep */}
              <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] ease-out"
                style={{ background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)" }} />
              {googleBusy ? (
                <><Loader2 className="size-4 animate-spin" /> Connecting account…</>
              ) : (
                <>
                  <span className="size-6 rounded-full bg-white grid place-items-center shadow-sm">
                    <GoogleIcon />
                  </span>
                  Continue with Google
                </>
              )}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.985 }}
              onClick={() => setMode("email")}
              className="w-full py-[14px] rounded-full text-[13.5px] font-medium text-white/90 border border-white/[0.09] hover:bg-white/[0.05] hover:border-white/[0.14] transition-all backdrop-blur-xl"
              style={{ background: "rgba(255,255,255,0.025)" }}
            >
              Continue with Email
            </motion.button>
          </motion.div>
        )}

        {mode === "email" && (
          <button
            onClick={() => { setMode("oauth"); setError(null); }}
            className="w-full text-center text-xs text-white/50 hover:text-white/80 transition-colors mb-3"
          >
            ← Back to all sign-in options
          </button>
        )}

        {/* Trust pill */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="flex items-center justify-center gap-1.5 mb-3"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ring-white/[0.07] backdrop-blur-md"
            style={{ background: "rgba(255,255,255,0.025)" }}>
            <span className="size-1.5 rounded-full" style={{ background: "#FF9F43", boxShadow: "0 0 8px #FF9F43" }} />
            <ShieldCheck className="size-3 text-white/55" />
            <p className="text-[10px] text-white/55 tracking-wide">
              256-bit encrypted · Trusted account protection
            </p>
          </span>
        </motion.div>

        {/* Mode toggle for email */}
        {mode === "email" && (
          <p className="text-center text-xs text-white/55 mb-3">
            {isSignup ? "Already have an account?" : "New to FoundOurMarket?"}{" "}
            <button onClick={() => setIsSignup(!isSignup)} className="font-medium hover:underline" style={{ color: "#FF9F43" }}>
              {isSignup ? "Sign in" : "Create account"}
            </button>
          </p>
        )}

        {/* Minimal footer */}
        <div className="flex items-center justify-center gap-3 mt-5 text-[10.5px] text-white/35">
          <Link to="/pages/$slug" params={{ slug: "privacy" }} className="hover:text-white/70 transition-colors">Privacy</Link>
          <span className="size-0.5 rounded-full bg-white/20" />
          <Link to="/pages/$slug" params={{ slug: "terms" }} className="hover:text-white/70 transition-colors">Terms</Link>
          <span className="size-0.5 rounded-full bg-white/20" />
          <Link to="/pages/$slug" params={{ slug: "returns" }} className="hover:text-white/70 transition-colors">Refunds</Link>
        </div>
        <p className="text-center mt-3">
          <Link to="/" className="text-[11px] text-white/35 hover:text-white/65 transition-colors">← Back to shop</Link>
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
