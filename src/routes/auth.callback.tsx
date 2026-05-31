import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Signing you in… — FoundOurMarket™" }] }),
  component: AuthCallback,
});

function AuthCallback() {
  const nav = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  const dest = (): string => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("post_auth_redirect");
      if (stored && stored.startsWith("/")) {
        localStorage.removeItem("post_auth_redirect");
        return stored;
      }
    }
    return "/account";
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setStatus("error");
        return;
      }
      if (data.session) {
        setStatus("success");
        setTimeout(() => nav({ to: dest() }), 700);
      } else {
        // Wait briefly for OAuth token exchange listener to set session
        timer = setTimeout(check, 400);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) {
        setStatus("success");
        setTimeout(() => nav({ to: dest() }), 700);
      }
    });

    check();

    // Hard timeout after 8s
    const fail = setTimeout(() => {
      if (!cancelled) {
        supabase.auth.getSession().then(({ data }) => {
          if (!data.session) setStatus("error");
        });
      }
    }, 8000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(fail);
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden" style={{ background: "#050816" }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] max-w-[600px] h-[50vh] rounded-full opacity-25"
          style={{ background: "radial-gradient(circle, #FF7A00 0%, transparent 70%)", filter: "blur(110px)" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-sm"
      >
        <div className="relative mx-auto mb-6 size-20">
          <div className="size-20 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_20px_60px_-12px_rgba(255,122,0,0.4)] bg-white/[0.04] grid place-items-center">
            <img src="/logo.jpeg" alt="FoundOurMarket" className="w-full h-full object-cover" />
          </div>
          {status === "loading" && (
            <motion.span
              aria-hidden
              className="absolute -inset-1 rounded-3xl border-2 border-transparent"
              style={{ borderTopColor: "#FF7A00", borderRightColor: "#FF9F43" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
          )}
          {status === "success" && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className="absolute -bottom-1 -right-1 size-7 rounded-full grid place-items-center shadow-[0_0_18px_rgba(255,122,0,0.6)]"
              style={{ background: "#FF7A00" }}
            >
              <Check className="size-4 text-black" strokeWidth={3} />
            </motion.div>
          )}
        </div>

        <p className="text-[10px] font-mono uppercase tracking-[0.35em] mb-2" style={{ color: "#FF9F43" }}>
          FoundOurMarket™
        </p>

        {status === "loading" && (
          <>
            <h1 className="text-xl font-display font-semibold text-white mb-1.5">Signing you in…</h1>
            <p className="text-sm text-white/55">Securing your session</p>
            <ShimmerBar />
          </>
        )}
        {status === "success" && (
          <>
            <h1 className="text-xl font-display font-semibold text-white mb-1.5">You're in</h1>
            <p className="text-sm text-white/60">Redirecting to your account…</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-xl font-display font-semibold text-white mb-1.5">Something went wrong</h1>
            <p className="text-sm text-white/55 mb-6">Please try signing in again.</p>
            <button
              onClick={() => nav({ to: "/auth" })}
              className="px-6 py-3 rounded-full text-sm font-semibold text-black shadow-[0_10px_30px_-10px_rgba(255,122,0,0.6)] hover:brightness-110 transition-all"
              style={{ background: "linear-gradient(135deg, #FF7A00, #FF9F43)" }}
            >
              Try Again
            </button>
          </>
        )}

        <div className="mt-8 flex items-center justify-center gap-1.5">
          <ShieldCheck className="size-3 text-white/40" />
          <p className="text-[10px] text-white/40 tracking-wide">Protected · Secure · Encrypted</p>
        </div>
      </motion.div>
    </div>
  );
}

function ShimmerBar() {
  return (
    <div className="relative mt-6 mx-auto h-0.5 w-44 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
      <motion.div
        className="absolute inset-y-0 w-1/3 rounded-full"
        style={{ background: "linear-gradient(90deg, transparent, #FF7A00, transparent)" }}
        animate={{ x: ["-100%", "300%"] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
