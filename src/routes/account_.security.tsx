import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Lock, LogOut, Shield, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/account_/security")({
  head: () => ({ meta: [{ title: "Security — FoundOurMarket™" }] }),
  component: SecurityPage,
});

function SecurityPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  if (!loading && !user) {
    nav({ to: "/auth" });
    return null;
  }

  const onChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
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

  return (
    <div className="container-page py-10 sm:py-16 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">
        <Link to="/account" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-3" /> Back to account
        </Link>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Account</p>
        <h1 className="text-fluid-2xl font-display font-semibold mt-2">Security</h1>
        <p className="text-sm text-muted-foreground mt-2">Manage your password and active sessions.</p>
      </motion.div>

      <div className="rounded-2xl border border-border bg-card p-6 sm:p-7 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="size-4 text-muted-foreground" />
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Account email</p>
        </div>
        <p className="font-medium">{user?.email ?? "—"}</p>
      </div>

      <form onSubmit={onChangePw} className="rounded-2xl border border-border bg-card p-6 sm:p-7 mb-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-accent" />
          <h2 className="font-display text-lg font-semibold">Change password</h2>
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">New password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password"
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Confirm password</label>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password"
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving} className="cta-primary disabled:opacity-50">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Update password
          </button>
          <button type="button" onClick={sendReset} disabled={sendingReset} className="text-xs font-mono uppercase tracking-widest text-accent hover:underline disabled:opacity-50">
            {sendingReset ? "Sending…" : "Email me a reset link"}
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-border bg-card p-6 sm:p-7">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="size-4 text-accent" />
          <h2 className="font-display text-lg font-semibold">Active sessions</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Sign out from all devices including this one.</p>
        <button onClick={signOutAll} disabled={signingOut} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50">
          {signingOut ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
          Sign out everywhere
        </button>
      </div>
    </div>
  );
}
