import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Ctx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

const REVOKED_STATUSES = new Set(["deleted", "banned"]);
const REVOKED_MESSAGE =
  "Your account is no longer available. Please contact support@foundourmarket.com if you believe this is an error.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const enforcedRef = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Enforce account-status revocation: a customer who is deleted/banned while
  // browsing is immediately signed out across devices and redirected to login.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      enforcedRef.current = false;
      return;
    }

    let cancelled = false;

    const enforce = async (status: string | null | undefined) => {
      if (cancelled || enforcedRef.current) return;
      if (status && REVOKED_STATUSES.has(status)) {
        enforcedRef.current = true;
        try {
          await supabase.auth.signOut();
        } catch {
          /* ignore */
        }
        toast.error(REVOKED_MESSAGE, { duration: 10000 });
        if (typeof window !== "undefined") {
          window.location.replace("/auth");
        }
      }
    };

    // Initial check on (re)authentication.
    void supabase
      .from("profiles")
      .select("account_status")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => enforce(data?.account_status as string | null));

    // Realtime: react the instant an admin flips the customer's status.
    const channel = supabase
      .channel(`account-status-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          const next = (payload.new as { account_status?: string | null })?.account_status;
          void enforce(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
