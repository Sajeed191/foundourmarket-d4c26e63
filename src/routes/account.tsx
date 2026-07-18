import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { openCrispChat, loadCrisp } from "@/lib/crisp";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, useMotionValue, useTransform, animate, useScroll, AnimatePresence, useMotionValueEvent } from "framer-motion";
import {
  LogOut, Package, Loader2, RotateCcw, MapPin, Heart, Clock, Sparkles,
  ShoppingBag, Wallet, ChevronRight, Shield, Settings, Eye, User as UserIcon,
  HelpCircle, LifeBuoy, MessageCircle, TrendingUp, ArrowRight, Star,
  Search, Zap, Gift, Tag, Flame, Truck, Lock, Globe, Crown,
  CheckCircle2, Box, Home, X, Plus, Minus, CreditCard, UserCog,
  Mail, Phone, PhoneCall, Smartphone, Copy, Check, ArrowLeftRight, ShieldCheck,
  BookOpen, Bell,

} from "lucide-react";
import { useSupportSettings, resolveSupportStatus } from "@/lib/use-support-settings";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { useWishlist } from "@/lib/wishlist";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

import { useProducts } from "@/lib/use-products";
import { useCart } from "@/lib/cart";
import { ProductCard } from "@/components/site/ProductCard";
import { CarouselViewAllCard } from "@/components/site/CarouselViewAllCard";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { type Product, discountPercent } from "@/lib/products";
import { isProductVisible } from "@/lib/product-availability";
import { PolicyCrossLinks } from "@/components/site/PolicyLinks";
import { useIsLowMotion } from "@/lib/motion-tier";
const logoSrc = "/logo.webp";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account — FoundOurMarket™" }] }),
  component: AccountPage,
});

type Order = {
  id: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  total: number;
  discount: number | null;
  currency: string;
  created_at: string;
  order_items: { name: string; quantity: number; image: string | null }[];
};

type Return = {
  id: string;
  order_id: string;
  status: string;
  refund_status: string;
  refund_amount: number | null;
  resolution_type: string;
  replacement_status: string;
  created_at: string;
};

type Profile = {
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  account_status?: string | null;
  ordering_blocked?: boolean | null;
  reviews_disabled?: boolean | null;
  ban_reason?: string | null;
};

const ease = [0.16, 1, 0.3, 1] as const;
const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return { text: "Still up", emoji: "🌙" };
  if (h < 12) return { text: "Good morning", emoji: "☀️" };
  if (h < 18) return { text: "Good afternoon", emoji: "🌤️" };
  return { text: "Good evening", emoji: "🌙" };
}

const SUPPORT_EMAIL = "support@foundourmarket.com";

function AccountStatusBanner({ profile }: { profile: Profile | null }) {
  if (!profile) return null;
  const status = profile.account_status ?? "active";
  const restrictions: { title: string; msg: string }[] = [];

  if (status === "suspended") {
    restrictions.push({
      title: "Account Temporarily Suspended",
      msg: `Your account is suspended and new orders are paused.${profile.ban_reason ? ` Reason: ${profile.ban_reason}` : ""}`,
    });
  } else if (status === "banned") {
    restrictions.push({
      title: "Account Restricted",
      msg: `Your account has been banned and access is revoked.${profile.ban_reason ? ` Reason: ${profile.ban_reason}` : ""}`,
    });
  } else if (status === "deleted") {
    restrictions.push({ title: "Account Closed", msg: "Your account has been closed. Contact support if this is a mistake." });
  } else {
    if (profile.ordering_blocked) restrictions.push({ title: "Ordering Disabled", msg: "Ordering is currently disabled on your account. You can still browse." });
    if (profile.reviews_disabled) restrictions.push({ title: "Reviews Restricted", msg: "Posting reviews has been restricted on your account." });
  }

  if (restrictions.length === 0) return null;

  return (
    <div className="space-y-2">
      {restrictions.map((r) => (
        <div key={r.title} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-amber-300">
            <Shield className="size-4 shrink-0" />
            <p className="text-sm font-semibold">{r.title}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{r.msg}</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1.5 inline-block text-xs font-medium text-amber-300 underline">
            Contact support
          </a>
        </div>
      ))}
    </div>
  );
}

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const lowMotion = useIsLowMotion();
  const { format, market } = useRegion();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [returns, setReturns] = useState<Return[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { slugs: wishSlugs } = useWishlist();
  const { products } = useProducts();
  const cart = useCart();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    const loadOrders = () =>
      supabase
        .from("orders")
        .select("id,status,payment_status,payment_method,total,discount,currency,created_at,order_items(name,quantity,image)")
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data }) => setOrders((data as Order[]) ?? []));

    loadOrders();
    const loadReturns = () =>
      supabase
        .from("returns")
        .select("id,order_id,status,refund_status,refund_amount,resolution_type,replacement_status,created_at")
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data }) => setReturns((data as Return[]) ?? []));
    loadReturns();
    supabase
      .from("profiles")
      .select("full_name,phone,avatar_url,account_status,ordering_blocked,reviews_disabled,ban_reason")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile((data as Profile | null) ?? null));

    const channel = supabase
      .channel(`account-orders:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },
        () => loadOrders(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "returns", filter: `user_id=eq.${user.id}` },
        () => loadReturns(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const firstName = useMemo(() => {
    const full = profile?.full_name ?? (user?.user_metadata?.full_name as string | undefined) ?? "";
    return full.split(" ")[0] || user?.email?.split("@")[0] || "there";
  }, [profile, user]);

  const avatarUrl = profile?.avatar_url ?? (user?.user_metadata?.avatar_url as string | undefined) ?? "";

  const stats = useMemo(() => {
    const list = orders ?? [];
    const spent = list.reduce((s, o) => s + Number(o.total || 0), 0);
    const isPaid = (o: Order) => {
      const pm = String(o.payment_method ?? "").toLowerCase();
      const ps = String(o.payment_status ?? "").toLowerCase();
      const st = String(o.status).toLowerCase();
      if (st === "payment_failed" || ps === "failed") return false;
      if (pm === "cod") return true; // COD orders track without prepayment
      return ps === "succeeded" || ps === "paid"; // prepaid must be successfully captured
    };
    // Successful orders only: paid and not cancelled/refunded/failed.
    const successful = list.filter(
      (o) => isPaid(o) && !["cancelled", "refunded", "payment_failed"].includes(String(o.status).toLowerCase()),
    );
    // In-progress orders that haven't reached a completed/terminal state.
    const active = successful.filter(
      (o) => !["delivered", "completed"].includes(String(o.status).toLowerCase()),
    ).length;
    const saved = Math.round(list.reduce((s, o) => s + Number(o.discount || 0), 0));
    const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";
    const categoryCount = new Map<string, number>();
    for (const o of list) for (const it of o.order_items) categoryCount.set(it.name, (categoryCount.get(it.name) ?? 0) + it.quantity);
    const topCategory = [...categoryCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    const latestActive = successful.find((o) => !["delivered", "completed"].includes(String(o.status).toLowerCase())) ?? null;
    return { count: successful.length, spent, active, saved, memberSince, topCategory, latestActive };
  }, [orders, user]);

  const latestReturn = useMemo(() => {
    const list = returns ?? [];
    const isCompleted = (r: Return) => {
      const status = String(r.status).toLowerCase();
      const refund = String(r.refund_status).toLowerCase();
      const replacement = String(r.replacement_status ?? "").toLowerCase();
      const resolution = String(r.resolution_type ?? "").toLowerCase();
      if (status === "rejected" || status === "completed") return true;
      if (resolution === "refund") return refund === "issued";
      if (resolution === "replacement") return replacement === "delivered";
      return refund === "issued" || replacement === "delivered";
    };
    return { latest: list.find((r) => !isCompleted(r)) ?? null, activeCount: list.filter((r) => !isCompleted(r)).length };
  }, [returns]);
  const activeReturns = latestReturn.activeCount;

  /**
   * Single active customer journey for the "Tracking" widget.
   * Priority: Replacement → Refund → Active Order. Only ONE card is ever shown,
   * and it disappears automatically once the journey reaches a terminal state.
   */
  const activeJourney = useMemo<
    | { type: "replacement"; ret: Return; order: Order | null }
    | { type: "refund"; ret: Return; order: Order | null }
    | { type: "order"; order: Order }
    | null
  >(() => {
    const retList = returns ?? [];
    const orderList = orders ?? [];
    const orderFor = (id: string) => orderList.find((o) => o.id === id) ?? null;

    const isRejected = (r: Return) => /rejected|denied|cancel/.test(String(r.status).toLowerCase());

    // Replacement (highest priority)
    const replacement = retList.find((r) => {
      if (String(r.resolution_type ?? "").toLowerCase() === "refund") return false;
      if (isRejected(r)) return false;
      const rep = String(r.replacement_status ?? "").toLowerCase();
      return !/delivered|completed|fulfilled|cancel/.test(rep);
    });
    if (replacement) return { type: "replacement", ret: replacement, order: orderFor(replacement.order_id) };

    // Refund (second priority)
    const refund = retList.find((r) => {
      if (String(r.resolution_type ?? "").toLowerCase() !== "refund") return false;
      if (isRejected(r)) return false;
      const ref = String(r.refund_status ?? "").toLowerCase();
      return !/refunded|issued|paid|completed|succeeded|cancel/.test(ref);
    });
    if (refund) return { type: "refund", ret: refund, order: orderFor(refund.order_id) };

    // Active order (lowest priority)
    if (stats.latestActive) return { type: "order", order: stats.latestActive };
    return null;
  }, [returns, orders, stats.latestActive]);



  const cartCount = cart.items.reduce((s, i) => s + i.qty, 0);
  const { slugs: recentSlugs, refresh: refreshRecent } = useRecentlyViewed();

  // Requirement: whenever the Account page becomes visible again, revalidate
  // Continue Shopping against the shared history store so nothing renders stale.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refreshRecent(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshRecent);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshRecent);
    };
  }, [refreshRecent]);

  const { scrollY } = useScroll();
  const [scrollDirection, setScrollDirection] = useState<"up" | "down" | null>(null);
  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    // Hide the profile card when scrolling upward (toward the top of the page).
    if (latest < previous && latest > 60) setScrollDirection("up");
    else if (latest > previous) setScrollDirection("down");
  });


  const wishlistProducts = useMemo(
    () => products.filter((p) => wishSlugs.has(p.slug)).slice(0, 8),
    [products, wishSlugs],
  );
  const recommended = useMemo(
    () => products
      .filter((p) => !wishSlugs.has(p.slug))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 8),
    [products, wishSlugs],
  );
  // Product names the user has already purchased — never resurface these.
  const purchasedNames = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders ?? []) for (const it of o.order_items ?? []) if (it.name) s.add(it.name);
    return s;
  }, [orders]);

  /**
   * Account "Continue Shopping" is a live projection of the SAME shared stores
   * used everywhere else: viewed-history (useRecentlyViewed), cart (useCart)
   * and wishlist (useWishlist). It keeps no local/cached copy — every one of
   * those stores is a dependency, so any change (view, remove, clear, add/remove
   * from cart, wishlist toggle, product becoming inactive, login/logout, sync
   * completing) rebuilds the list instantly with no refresh. Invalid products
   * (deleted / hidden / unavailable / already purchased) are dropped so no empty
   * slots remain, and ordering is stable: cart → saved → viewed.
   */
  const cartSlugs = useMemo(() => cart.items.map((i) => i.slug), [cart.items]);
  const continueShopping = useMemo(() => {
    const map = new Map(products.map((p) => [p.slug, p] as const));
    const seen = new Set<string>();
    const out: { product: Product; badge: "cart" | "saved" | "viewed" }[] = [];
    const push = (slug: string, badge: "cart" | "saved" | "viewed") => {
      if (!slug || seen.has(slug)) return;
      const p = map.get(slug);
      if (!isProductVisible(p, market) || purchasedNames.has(p.name)) return;
      seen.add(slug);
      out.push({ product: p, badge });
    };
    // Stable priority ordering — cart identity wins, then saved, then viewed.
    for (const s of cartSlugs) push(s, "cart");
    for (const s of wishSlugs) push(s, "saved");
    for (const s of recentSlugs) push(s, "viewed");
    return out.slice(0, 10);
  }, [products, market, cartSlugs, wishSlugs, recentSlugs, purchasedNames]);

  if (loading || !user) {
    return <PremiumLoader />;
  }

  return (
    <div>
      {/* Cinematic ambient background system — layered orbs, bloom & grid */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* base navy depth wash */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% -10%, oklch(0.17 0.02 265 / 0.9), transparent 60%)" }} />
        {/* top ember bloom */}
        <div className="absolute top-[-22%] left-1/2 -translate-x-1/2 w-[120%] h-[60vh] opacity-50 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />
        {/* drifting warm orb */}
        <div className="absolute top-[30%] -right-[10%] size-[460px] rounded-full opacity-40 animate-orb" style={{ background: "var(--gradient-ember)", filter: "blur(110px)" }} />
        {/* drifting violet orb for depth */}
        <div className="absolute bottom-[-10%] -left-[8%] size-[420px] rounded-full opacity-35 animate-orb" style={{ background: "var(--gradient-violet)", filter: "blur(120px)", animationDelay: "-8s" }} />
        {/* ultra-subtle grid texture, vignetted */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 50% 30%, black 20%, transparent 80%)",
          }}
        />
      </div>


      <div className="container-page py-3 sm:py-6 lg:py-8 space-y-3 sm:space-y-5">

        <AccountStatusBanner profile={profile} />




        {/* 1 — HEADER */}
        <div className="relative z-30">

          <motion.header
            initial={false}
            className="noise-layer glass-reflect relative overflow-hidden rounded-[28px] sm:rounded-3xl glass-strong"
          >
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="absolute -top-32 -right-20 size-[420px] rounded-full opacity-70" style={{ background: "var(--gradient-ember)", filter: "blur(80px)" }} />
            <div className="absolute -bottom-32 -left-24 size-[360px] rounded-full opacity-60" style={{ background: "var(--gradient-violet)", filter: "blur(90px)" }} />
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
                maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
              }}
            />
          </div>
          <div className="relative p-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Avatar with online status */}
              <div className="relative shrink-0">
                <motion.div
                  initial={false}
                  className="size-12 sm:size-14 rounded-2xl border border-white/10 bg-secondary overflow-hidden grid place-items-center shadow-[var(--shadow-float)] ring-1 ring-accent/30"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <img src={logoSrc} alt="FoundOurMarket logo" className="w-full h-full object-cover" />
                  )}
                </motion.div>
                <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-2xl blur-xl opacity-60" style={{ background: "var(--gradient-ember)" }} />
                <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 border-2 border-card shadow-[0_0_10px_oklch(0.7_0.18_150)]" />
              </div>

              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {greeting().text} {greeting().emoji}
                </p>
                <h1 className="mt-0.5 text-2xl leading-tight sm:text-3xl font-display font-semibold tracking-tight truncate">
                  Welcome back, <span className="text-gradient-ember">{firstName}</span>
                </h1>
                <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground truncate">{user?.email}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-center">
                <Link
                  to="/account/profile"
                  aria-label="Settings"
                  className="size-9 sm:size-10 grid place-items-center rounded-xl glass hover:bg-white/10 hover:text-accent transition-all"
                >
                  <Settings className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </motion.header>
        </div>

        {/* 2 — OVERVIEW */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.05 }}>
          <SectionHeader title="Overview" eyebrow="Your account at a glance" />
          <div className="grid grid-cols-2 gap-4 sm:gap-4">
            <OverviewCard icon={Package} label="Total Orders" value={stats.count} loading={!orders} to="/account/orders" tone="amber" />
            <OverviewCard icon={Heart} label="Wishlist" value={wishSlugs.size} to="/wishlist" tone="rose" />
            <OverviewCard icon={ShoppingBag} label="Cart Items" value={cartCount} to="/cart" tone="blue" />
            <OverviewCard icon={Wallet} label="Total Saved" value={stats.saved} loading={!orders} formatter={format} tone="emerald" />
          </div>
        </motion.section>

        {/* 2.5 — ACTIVE JOURNEY TRACKING (single card, auto-hides when complete) */}
        <AnimatePresence>
          {activeJourney && (
            <TrackingWidget key={activeJourney.type} journey={activeJourney} format={format} />
          )}
        </AnimatePresence>

        {/* 3 — QUICK ACTIONS */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
          <SectionHeader title="Quick actions" eyebrow="Jump to" />
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <ActionCard to="/account/orders" icon={Package} title="Orders" subtitle="Track & invoices" badge={stats.active} />
            <ActionCard to="/wishlist" icon={Heart} title="Wishlist" subtitle="Saved items" badge={wishSlugs.size} />
            <ActionCard to="/account/addresses" icon={MapPin} title="Addresses" subtitle="Shipping & billing" />
            <ActionCard to="/account/payments" icon={CreditCard} title="Payments" subtitle="Saved methods" />
            <ActionCard to="/account/profile" icon={UserIcon} title="Profile" subtitle="Your details" />
            <ActionCard to="/account/security" icon={Shield} title="Security" subtitle="Account safety" />
            <ActionCard to="/account/returns" icon={RotateCcw} title="Returns" subtitle="Requests & status" badge={activeReturns} />
            <ActionCard to="/deals" icon={Gift} title="Offers" subtitle="Deals & promos" />
            <ActionCard to="/search" icon={Tag} title="Categories" subtitle="Browse all" />
          </div>
        </motion.section>

        {/* 4 — CONTINUE SHOPPING (personalized; hidden for brand-new visitors) */}
        {continueShopping.length > 0 && (
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
            <SectionHeader title="Continue Shopping" eyebrow="Pick up where you left off" />
            <ContinueShopping items={continueShopping} />
          </motion.section>
        )}

        {/* 5 — SUPPORT & ACCOUNT (premium hub) */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.12 }} className="pt-1">
          <AccountUtilities user={user} avatarUrl={avatarUrl} firstName={firstName} signOut={signOut} />
        </motion.section>

      </div>
    </div>
  );
}






/* ---------- helpers ---------- */

function SectionHeader({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <div className="mb-3 sm:mb-4">
      {eyebrow && <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-1">{eyebrow}</p>}
      <h2 className="text-base sm:text-lg font-display font-semibold">{title}</h2>
    </div>
  );
}

function SectionBlock({
  title, icon: Icon, action, children,
}: { title: string; icon: typeof Package; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.section {...fadeUp}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm sm:text-base font-medium flex items-center gap-2">
          <span className="size-7 rounded-lg bg-accent/10 text-accent grid place-items-center">
            <Icon className="size-3.5" />
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

const TONES = {
  amber: { icon: "bg-amber-500/10 text-amber-400", glow: "oklch(0.74 0.19 49)", tint: "linear-gradient(135deg, oklch(0.74 0.19 49 / 0.16), transparent 62%)", hover: "0 8px 24px -6px oklch(0.74 0.19 49 / 0.35)" },
  rose: { icon: "bg-rose-500/10 text-rose-400", glow: "oklch(0.7 0.2 18)", tint: "linear-gradient(135deg, oklch(0.7 0.2 18 / 0.16), transparent 62%)", hover: "0 8px 24px -6px oklch(0.7 0.2 18 / 0.35)" },
  blue: { icon: "bg-sky-500/10 text-sky-400", glow: "oklch(0.7 0.16 240)", tint: "linear-gradient(135deg, oklch(0.7 0.16 240 / 0.16), transparent 62%)", hover: "0 8px 24px -6px oklch(0.7 0.16 240 / 0.35)" },
  emerald: { icon: "bg-emerald-500/10 text-emerald-400", glow: "oklch(0.72 0.16 160)", tint: "linear-gradient(135deg, oklch(0.72 0.16 160 / 0.16), transparent 62%)", hover: "0 8px 24px -6px oklch(0.72 0.16 160 / 0.35)" },
} as const;

function OverviewCard({
  icon: Icon, label, value, accent, loading, to, formatter, tone = "amber",
}: { icon: typeof Package; label: string; value: number; accent?: boolean; loading?: boolean; to?: string; formatter?: (n: number) => string; tone?: keyof typeof TONES }) {
  const t = TONES[tone];
  const inner = (
    <motion.div
      data-uniform-card
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.25, ease }}
      style={{ ["--tone-hover" as string]: t.hover }}
      className="group h-full w-full min-h-[150px] sm:min-h-[164px] relative flex flex-col overflow-hidden rounded-[20px] p-5 card-premium transition-shadow duration-300 hover:shadow-[var(--tone-hover)]"
    >
      {/* Static tinted wash — cheap, no blur, survives low-end / degrade modes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[20px] opacity-90"
        style={{ background: t.tint }}
      />

      {/* Icon badge (circular, top-left) — fixed size & position */}
      <span className={`relative flex size-10 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-105 ${t.icon}`}>
        <Icon className="size-5" strokeWidth={2} />
      </span>
      {/* Metric + label (bottom) — fixed content structure so every card aligns */}
      <div className="relative mt-auto pt-4">
        <div className="flex h-9 items-end overflow-hidden">
          {loading ? (
            <div className="h-8 w-16 rounded-md bg-foreground/5 animate-pulse" />
          ) : (
            <AnimatedNumber
              value={value}
              formatter={formatter}
              className="block text-3xl leading-9 font-display font-bold tracking-tight tabular-nums text-foreground [font-variant-numeric:tabular-nums]"
            />
          )}
        </div>
        <p className="h-4 text-[10px] font-mono font-bold uppercase tracking-widest leading-4 text-muted-foreground mt-1.5 truncate">{label}</p>
      </div>

    </motion.div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

function ActionCard({
  to, icon: Icon, title, subtitle, badge,
}: { to: string; icon: typeof Package; title: string; subtitle: string; badge?: number }) {
  return (
    <Link to={to} className="group block h-full">
      <motion.div
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.2, ease }}
        className="h-full min-h-[92px] sm:min-h-[104px] flex flex-col items-center justify-center text-center gap-2 card-premium px-2.5 py-3 sm:py-4 hover:shadow-[var(--shadow-soft)]"
      >
        <span className="relative size-10 rounded-xl bg-accent/10 text-accent grid place-items-center group-hover:bg-accent/25 group-hover:shadow-[0_0_20px_oklch(0.74_0.19_49/0.4)] transition-all">
          <Icon className="size-[18px]" />
          {typeof badge === "number" && badge > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold grid place-items-center shadow-[var(--shadow-ember)]">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        <div className="min-w-0 w-full">
          <p className="text-[13px] font-medium leading-tight truncate group-hover:text-accent transition-colors">{title}</p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{subtitle}</p>
        </div>
      </motion.div>
    </Link>
  );
}


function OrderRow({ o, format }: { o: Order; format: (n: number) => string }) {
  const status = String(o.status).toLowerCase();
  const stepMap: Record<string, number> = { pending: 25, processing: 50, shipped: 75, in_transit: 75, delivered: 100, cancelled: 0, refunded: 0 };
  const progress = stepMap[status] ?? 50;
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2, ease }}>
      <Link
        to="/orders/$id"
        params={{ id: o.id }}
        className="group relative block card-premium rounded-2xl p-4 sm:p-5 overflow-hidden"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 group-hover:opacity-60 transition-opacity duration-500"
          style={{ background: "var(--gradient-ember-soft)", filter: "blur(24px)" }}
        />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex -space-x-2 shrink-0">
              {o.order_items.slice(0, 3).map((it, i) => (
                <div key={i} className="size-10 sm:size-11 rounded-xl ring-1 ring-white/10 bg-black/40 overflow-hidden">
                  {it.image && <img src={it.image} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
              ))}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                #{o.id.slice(0, 8)} · {new Date(o.created_at).toLocaleDateString()}
              </p>
              <p className="text-sm font-medium mt-1 truncate">
                {o.order_items.length} item{o.order_items.length === 1 ? "" : "s"}
              </p>
              <StatusBadge status={o.status} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="font-mono text-sm text-accent tabular-nums">{format(Number(o.total))}</span>
            <ChevronRight className="size-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
        <div className="relative mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease }}
            className="h-full bg-gradient-to-r from-accent to-primary shadow-[0_0_12px_var(--color-accent)]"
          />
        </div>
      </Link>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone = s === "delivered" ? "bg-emerald-500/15 text-emerald-400"
    : s === "cancelled" || s === "refunded" ? "bg-destructive/15 text-destructive"
    : "bg-accent/15 text-accent";
  return (
    <span className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${tone}`}>
      <span className="size-1.5 rounded-full bg-current" /> {status}
    </span>
  );
}

function ProductScroller({ items }: { items: Array<{ slug: string }> }) {
  return (
    <div className="-mx-4 sm:mx-0">
      <div data-product-grid className="flex gap-2 sm:gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-px-4 px-4 sm:px-0 pb-2 [-webkit-overflow-scrolling:touch]">
        {items.map((p) => (
          <div
            key={p.slug}
            data-product-card-frame
            className="snap-center shrink-0 w-[44%] xs:w-[40%] sm:w-[22%] lg:w-[20%] max-w-[150px] rounded-2xl transition-shadow duration-500 hover:shadow-[0_22px_60px_-22px_oklch(0.74_0.19_49/0.55)]"
          >
            <ProductCard product={p as never} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
function InsightStat({ label, value, accent, small, truncate }: { label: string; value: string; accent?: boolean; small?: boolean; truncate?: boolean }) {
  return (
    <div className={`rounded-xl glass p-3.5 transition-colors hover:border-accent/30 ${accent ? "border-accent/30 bg-accent/5" : ""}`}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/90">{label}</p>
      <p className={`mt-1 font-display font-semibold tabular-nums ${small ? "text-sm" : "text-lg"} ${accent ? "text-gradient-ember" : ""} ${truncate ? "truncate" : ""}`}>{value}</p>
    </div>
  );
}


const HELP_ARTICLE_COUNT = 14;

/* ---------- account utilities (support + session) ---------- */
function UtilityCard({
  icon: Icon, title, desc, badge, badgeTone = "neutral", glow, accent, hint, chips, onClick, lowMotion,
}: {
  icon: typeof Package; title: string; desc: string;
  badge?: string; badgeTone?: "online" | "offline" | "neutral" | "accent";
  glow: string; accent: string; hint: string; chips?: string[];
  onClick: () => void; lowMotion: boolean;
}) {
  const dot = badgeTone === "online" ? "bg-emerald-500" : badgeTone === "offline" ? "bg-amber-500" : badgeTone === "accent" ? "bg-accent" : "bg-muted-foreground";
  const [ripple, setRipple] = useState<{ x: number; y: number; k: number } | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!lowMotion) {
      const r = e.currentTarget.getBoundingClientRect();
      setRipple({ x: e.clientX - r.left, y: e.clientY - r.top, k: Date.now() });
    }
    onClick();
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileHover={lowMotion ? undefined : { y: -2 }}
      whileTap={lowMotion ? undefined : { scale: 0.985 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="group relative h-full min-h-[150px] flex flex-col text-left rounded-[20px] p-4 sm:p-[18px] overflow-hidden bg-white/[0.03] border border-accent/15 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)] transition-colors duration-200 hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >

      {/* ripple */}
      {ripple && (
        <motion.span
          key={ripple.k} aria-hidden
          initial={{ scale: 0, opacity: 0.35 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          onAnimationComplete={() => setRipple(null)}
          className="pointer-events-none absolute size-16 rounded-full -ml-8 -mt-8"
          style={{ left: ripple.x, top: ripple.y, background: accent }}
        />
      )}

      {/* top */}
      <div className="relative flex items-start justify-between gap-2">
        <span className="size-12 rounded-2xl grid place-items-center bg-accent/10 text-accent ring-1 ring-accent/25 shadow-[0_0_22px_-8px_var(--color-accent)]">
          <Icon className="size-[22px]" />
        </span>
        {badge && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-white/10 whitespace-nowrap">
            <span className={`size-1.5 rounded-full ${dot} ${badgeTone === "online" ? "animate-pulse" : ""}`} />
            {badge}
          </span>
        )}
      </div>

      {/* middle */}
      <div className="relative mt-3">
        <p className="text-sm font-semibold leading-tight truncate">{title}</p>
        <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug line-clamp-2">{desc}</p>
        {chips && (
          <div className="mt-2 flex flex-wrap gap-1">
            {chips.map((c) => (
              <span key={c} className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground ring-1 ring-white/10">{c}</span>
            ))}
          </div>
        )}
      </div>

      {/* bottom action hint */}
      <div className="relative mt-auto pt-3 flex items-center gap-1 text-[11px] font-medium text-accent">
        <span>{hint}</span>
        <ChevronRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>
    </motion.button>
  );
}


function Sheet({ open, onClose, children, lowMotion }: { open: boolean; onClose: () => void; children: ReactNode; lowMotion: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[95] grid place-items-end sm:place-items-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={lowMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={lowMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={lowMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true"
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-card/95 backdrop-blur-xl p-5 shadow-2xl"
            style={{ paddingBottom: "calc(var(--mobile-nav-clearance, 0px) + 1.25rem)" }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SheetOption({ icon: Icon, label, desc, tone = "default", onClick }: { icon: typeof Package; label: string; desc?: string; tone?: "default" | "danger"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        tone === "danger"
          ? "border-red-500/20 bg-red-500/[0.04] hover:bg-red-500/10"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      }`}
    >
      <span className={`size-10 rounded-xl grid place-items-center shrink-0 ${tone === "danger" ? "bg-red-500/10 text-red-400" : "bg-accent/10 text-accent"}`}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium leading-tight ${tone === "danger" ? "text-red-400" : ""}`}>{label}</span>
        {desc && <span className="block text-[11px] text-muted-foreground mt-0.5 truncate">{desc}</span>}
      </span>
      <ChevronRight className={`size-4 shrink-0 ${tone === "danger" ? "text-red-400/60" : "text-muted-foreground"}`} />
    </button>
  );
}

function AccountUtilities({ user, avatarUrl, firstName, signOut }: { user: any; avatarUrl: string; firstName: string; signOut: () => void | Promise<void> }) {
  const nav = useNavigate();
  const lowMotion = useIsLowMotion();
  const { settings } = useSupportSettings();
  const { online, minutes } = resolveSupportStatus(settings);
  const hasWhatsApp = settings.whatsappNumbers.length > 0;

  const [supportOpen, setSupportOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const openLiveChat = () => { loadCrisp().then(() => openCrispChat()).catch(() => openCrispChat()); };
  const emailSupport = () => { window.location.href = "mailto:support@foundourmarket.com"; };
  const callSupport = () => { setSupportOpen(false); nav({ to: "/contact" }); };
  const openWhatsApp = () => {
    if (!hasWhatsApp) { toast.info("WhatsApp support coming soon"); return; }
    const num = settings.whatsappNumbers[0].replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${num}`, "_blank", "noopener,noreferrer");
  };
  const copyEmail = async () => {
    try { await navigator.clipboard.writeText("support@foundourmarket.com"); setCopied("email"); toast.success("Email copied"); setTimeout(() => setCopied(null), 1600); }
    catch { toast.error("Couldn't copy"); }
  };

  const doSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); } finally { setSigningOut(false); setConfirmOpen(false); setAccountOpen(false); }
  };

  return (
    <>
      {/* Premium section header — live status + response time */}
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-1">Support &amp; Account</p>
          <h2 className="text-base sm:text-lg font-display font-semibold leading-tight">Need help? We're here 24/7.</h2>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
            online ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/25" : "bg-amber-500/10 text-amber-400 ring-amber-500/25"
          }`}>
            <span className={`relative flex size-1.5`}>
              {online && <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
              <span className={`relative inline-flex size-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`} />
            </span>
            {online ? "Online now" : "Away"}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">Avg reply · &lt; {minutes} min</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <PremiumSupportCard
          icon={LifeBuoy} title="Help & Support" accent="var(--color-accent)"
          statusDot={online ? "emerald" : "amber"} statusText={online ? "Online" : "Away"}
          rows={[
            { label: "Queue", value: online ? "0 waiting" : "—" },
            { label: "Avg wait", value: `< ${minutes} min` },
            { label: "Hours", value: "24/7" },
          ]}
          cta="Start Conversation"
          lowMotion={lowMotion} onClick={() => setSupportOpen(true)}
        />
        <PremiumSupportCard
          icon={BookOpen} title="Knowledge Base" accent="oklch(0.72 0.16 240)"
          rows={[
            { label: "Articles", value: `${HELP_ARTICLE_COUNT}` },
            { label: "Guides", value: "3" },
            { label: "Updated", value: "This week" },
          ]}
          chips={["Shipping", "Payments", "Returns", "Security"]}
          cta="Browse Knowledge Base"
          lowMotion={lowMotion} onClick={() => nav({ to: "/help", hash: "faqs" })}
        />
        <PremiumSupportCard
          icon={MessageCircle} title="Contact Options" accent="oklch(0.72 0.16 160)"
          pills={[
            { icon: Smartphone, label: "WhatsApp" },
            { icon: Mail, label: "Email" },
            { icon: MessageCircle, label: "Live Chat" },
            { icon: PhoneCall, label: "Callback" },
          ]}
          cta="Choose Contact Method"
          lowMotion={lowMotion} onClick={() => setContactOpen(true)}
        />
        <PremiumSupportCard
          icon={ShieldCheck} title="Account Security" accent="oklch(0.7 0.2 18)"
          score={4}
          rows={[
            { label: "Verified", value: "100%" },
            { label: "2FA", value: "Enabled", tone: "good" },
            { label: "Device", value: "Trusted", tone: "good" },
          ]}
          cta="Manage Security"
          lowMotion={lowMotion} onClick={() => setAccountOpen(true)}
        />
      </div>

      {/* Support hub sheet */}
      <Sheet open={supportOpen} onClose={() => setSupportOpen(false)} lowMotion={lowMotion}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display font-semibold text-base leading-tight">Help &amp; Support</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{online ? "We're online now" : "Support hours: 9 AM–9 PM"}</p>
          </div>
          <button onClick={() => setSupportOpen(false)} aria-label="Close" className="size-8 grid place-items-center rounded-full hover:bg-white/10 text-muted-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 space-y-2">
          <SheetOption icon={MessageCircle} label="Live Chat" desc={online ? `Usually replies in under ${minutes} min` : "Leave us a message"} onClick={() => { setSupportOpen(false); openLiveChat(); }} />
          <SheetOption icon={Plus} label="Create Ticket" desc="Report an issue or request" onClick={() => { setSupportOpen(false); nav({ to: "/account/support/new" }); }} />
          <SheetOption icon={Search} label="Track Ticket" desc="View your open tickets" onClick={() => { setSupportOpen(false); nav({ to: "/account/support" }); }} />
          <SheetOption icon={PhoneCall} label="Call Support" desc="Request a callback" onClick={callSupport} />
        </div>
      </Sheet>

      {/* Contact hub sheet */}

      <Sheet open={contactOpen} onClose={() => setContactOpen(false)} lowMotion={lowMotion}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display font-semibold text-base leading-tight">Contact us</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Support hours: Mon–Sun · 9 AM–9 PM</p>
          </div>
          <button onClick={() => setContactOpen(false)} aria-label="Close" className="size-8 grid place-items-center rounded-full hover:bg-white/10 text-muted-foreground">
            <X className="size-4" />
          </button>
        </div>
        {online && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-400 ring-1 ring-emerald-500/20">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online now
          </span>
        )}
        <div className="mt-4 space-y-2">
          <SheetOption icon={MessageCircle} label="Live Chat" desc={online ? `Usually replies in under ${minutes} min` : "Leave us a message"} onClick={() => { setContactOpen(false); openLiveChat(); }} />
          <SheetOption icon={Mail} label="Email" desc="support@foundourmarket.com" onClick={emailSupport} />
          <SheetOption icon={Smartphone} label="WhatsApp" desc={hasWhatsApp ? "Replies in 5–30 min" : "Coming soon"} onClick={openWhatsApp} />
          <SheetOption icon={PhoneCall} label="Request a Callback" desc="We'll call you back" onClick={() => { setContactOpen(false); nav({ to: "/contact" }); }} />
        </div>
        <button onClick={copyEmail} className="mt-3 w-full inline-flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition">
          {copied === "email" ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />} Copy support email
        </button>
      </Sheet>

      {/* Account / session sheet */}
      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} lowMotion={lowMotion}>
        <div className="flex items-center justify-between">
          <p className="font-display font-semibold text-base">Profile &amp; Security</p>
          <button onClick={() => setAccountOpen(false)} aria-label="Close" className="size-8 grid place-items-center rounded-full hover:bg-white/10 text-muted-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="size-11 rounded-2xl overflow-hidden grid place-items-center bg-secondary ring-1 ring-accent/30 shrink-0">
            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <img src={logoSrc} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate capitalize">{firstName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>

        <div className="mt-3 space-y-2 max-h-[52vh] overflow-y-auto pr-1 -mr-1 scrollbar-hide">
          <SheetOption icon={UserIcon} label="Profile" desc="Name, avatar & details" onClick={() => { setAccountOpen(false); nav({ to: "/account/profile" }); }} />
          <SheetOption icon={ShieldCheck} label="Security" desc="Password & sign-in" onClick={() => { setAccountOpen(false); nav({ to: "/account/security" }); }} />
          <SheetOption icon={MapPin} label="Addresses" desc="Shipping & billing" onClick={() => { setAccountOpen(false); nav({ to: "/account/addresses" }); }} />
          <SheetOption icon={CreditCard} label="Saved Payments" desc="Cards & methods" onClick={() => { setAccountOpen(false); nav({ to: "/account/payments" }); }} />
          <SheetOption icon={Smartphone} label="Connected Devices" desc="Where you're signed in" onClick={() => { setAccountOpen(false); nav({ to: "/account/security" }); }} />
          <SheetOption icon={Globe} label="Language" desc="Region & language" onClick={() => { setAccountOpen(false); nav({ to: "/account/preferences" }); }} />
          <SheetOption icon={Bell} label="Notifications" desc="Alerts & emails" onClick={() => { setAccountOpen(false); nav({ to: "/account/notifications" }); }} />
          <SheetOption icon={Lock} label="Privacy" desc="Data & privacy controls" onClick={() => { setAccountOpen(false); nav({ to: "/privacy" }); }} />
          <SheetOption icon={ArrowLeftRight} label="Switch Account" desc="Use a different account" onClick={() => { setAccountOpen(false); nav({ to: "/auth" }); }} />
          <SheetOption icon={LogOut} label="Sign Out" tone="danger" onClick={() => setConfirmOpen(true)} />
        </div>

      </Sheet>

      {/* Sign-out confirmation */}
      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} lowMotion={lowMotion}>
        <div className="text-center">
          <span className="mx-auto inline-flex size-12 rounded-2xl items-center justify-center bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
            <LogOut className="size-6" />
          </span>
          <p className="mt-4 font-display font-semibold text-lg">Sign out?</p>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-xs mx-auto">You will need to sign in again to access your account.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button onClick={() => setConfirmOpen(false)} className="h-11 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-medium hover:bg-white/[0.07] transition">
              Cancel
            </button>
            <button onClick={doSignOut} disabled={signingOut}
              className="h-11 rounded-2xl grid place-items-center bg-red-500/90 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-60 transition">
              {signingOut ? <Loader2 className="size-4 animate-spin" /> : "Sign Out"}
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function FooterAction({ icon: Icon, label, to, onClick }: { icon: typeof Package; label: string; to?: string; onClick?: () => void }) {

  const inner = (
    <>
      <span className="size-9 rounded-xl bg-accent/10 text-accent grid place-items-center group-hover:bg-accent/20 transition-colors">
        <Icon className="size-4" />
      </span>
      <span className="text-[11px] uppercase tracking-widest">{label}</span>
    </>
  );
  const cls = "group flex flex-col items-center justify-center gap-2 rounded-2xl glass p-4 hover:border-accent/40 hover:text-accent hover:-translate-y-0.5 transition-all";
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <Link to={to!} className={cls}>{inner}</Link>;
}

function EmptyState({ icon: Icon = Star, title, body, cta, extra }: { icon?: typeof Package; title: string; body: string; cta?: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="card-premium rounded-2xl border-dashed p-5 sm:p-6 flex flex-col items-center text-center relative overflow-hidden">
      
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        className="relative size-12 rounded-2xl bg-accent/10 text-accent grid place-items-center mb-3 ring-1 ring-accent/30 shadow-[0_0_20px_-6px_var(--color-accent)]"
      >
        <Icon className="size-5" />
      </motion.div>
      <p className="relative text-sm font-medium">{title}</p>
      <p className="relative text-xs text-muted-foreground mt-1 max-w-xs">{body}</p>
      {cta && <div className="relative mt-4">{cta}</div>}
      {extra}
    </div>
  );
}

function MiniProductRow({ items, format }: { items: Array<{ slug: string; name: string; image: string; price: number; tagline?: string }>; format: (n: number) => string }) {
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  return (
    <div data-product-grid className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
      {items.map((p) => {
        const saved = has(p.slug);
        return (
          <div
            key={p.slug}
            data-product-card
            data-android-static-card
            className="snap-start shrink-0 w-[150px] sm:w-[160px] group bg-card border border-border rounded-xl p-2 hover:border-accent/40 transition-colors"
          >
            <Link to="/products/$slug" params={{ slug: p.slug }} className="block relative">
              <div data-product-media className="aspect-square rounded-lg overflow-hidden bg-black/40">
                <img data-product-image src={p.image} alt={p.name} loading="lazy" decoding="sync" className="w-full h-full object-cover transition-opacity duration-500" />
              </div>
              <button
                onClick={(e) => { e.preventDefault(); toggle(p.slug); }}
                aria-label={saved ? "Remove from wishlist" : "Save"}
                className={`absolute top-1.5 right-1.5 size-6 grid place-items-center rounded-full bg-black/50 backdrop-blur-md ${saved ? "text-accent" : "text-white/70 hover:text-accent"}`}
              >
                <Heart className={`size-3 ${saved ? "fill-accent" : ""}`} />
              </button>
            </Link>
            <div className="px-0.5 pt-2 pb-1">
              <p data-product-text className="product-typography product-title-text text-[11.5px] font-medium truncate">{p.name}</p>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="product-typography product-price-text font-mono text-[11px] text-accent truncate">{format(p.price)}</span>
                <button
                  onClick={() => add(p.slug)}
                  aria-label="Add to cart"
                  className="size-6 grid place-items-center rounded-full bg-accent/10 text-accent hover:bg-accent hover:text-accent-foreground transition-colors text-[10px] font-bold"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card-premium rounded-2xl p-5 h-24 animate-pulse" />
      ))}
    </div>
  );
}

function AnimatedNumber({
  value, className, formatter,
}: { value: number; className?: string; formatter?: (n: number) => string }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => (formatter ? formatter(Math.round(v)) : Math.round(v).toLocaleString()));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.9, ease });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span className={className}>{display}</motion.span>;
}

type FlashSale = {
  id: string;
  name: string;
  discount_percent: number;
  ends_at: string | null;
};

function FlashSaleStrip() {
  const [sale, setSale] = useState<FlashSale | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("flash_sales")
      .select("id,name,discount_percent,ends_at")
      .eq("active", true)
      .lte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const s = data as FlashSale | null;
        if (!s) return setSale(null);
        if (s.ends_at && new Date(s.ends_at).getTime() < Date.now()) return setSale(null);
        setSale(s);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sale?.ends_at) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sale?.ends_at]);

  if (!sale) return null;

  const endTime = sale.ends_at ? new Date(sale.ends_at).getTime() : 0;
  const diff = Math.max(0, endTime - now);
  if (sale.ends_at && diff === 0) return null;

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.04 }}>
      <Link
        to="/search"
        className="relative block overflow-hidden rounded-3xl glass-strong p-4 sm:p-5 group hover:border-accent/50 transition-colors"
      >
        <div aria-hidden className="absolute inset-0 -z-10 opacity-70" style={{ background: "var(--gradient-ember-soft)" }} />
        
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <motion.span
              animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="size-11 sm:size-12 rounded-2xl bg-accent text-accent-foreground grid place-items-center shadow-[0_0_24px_var(--color-accent)] shrink-0"
            >
              <Zap className="size-5" fill="currentColor" />
            </motion.span>
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Flash sale · Up to {sale.discount_percent}% off</p>
              <p className="text-sm sm:text-base font-display font-semibold truncate">{sale.name}</p>
            </div>
          </div>
          {sale.ends_at && (
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {[pad(h), pad(m), pad(sec)].map((v, i) => (
                <div key={i} className="flex items-center gap-1 sm:gap-1.5">
                  <span className="min-w-[34px] sm:min-w-[40px] px-1.5 py-1.5 rounded-lg bg-background/60 backdrop-blur text-center font-mono text-sm sm:text-base font-semibold text-accent tabular-nums ring-1 ring-accent/30">
                    {v}
                  </span>
                  {i < 2 && <span className="text-accent font-bold">:</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

function AnnouncementStrip() {
  const messages = [
    { icon: Globe, text: "Worldwide Shipping" },
    { icon: Lock, text: "Secure Payments" },
    { icon: Sparkles, text: "New Arrivals Just In" },
    { icon: Flame, text: "Flash Sale Live Now" },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % messages.length), 3000);
    return () => clearInterval(t);
  }, []);
  const M = messages[i];
  const Icon = M.icon;
  return (
    <div className="relative overflow-hidden rounded-full glass border border-accent/20 px-4 py-2 h-9 flex items-center justify-center">
      <div aria-hidden className="absolute inset-0 opacity-30" style={{ background: "var(--gradient-ember-soft)" }} />
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease }}
          className="relative flex items-center gap-2 text-[11px] sm:text-xs font-mono uppercase tracking-[0.2em] text-foreground"
        >
          <Icon className="size-3.5 text-accent" />
          <span>{M.text}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}



function ProfileCompletion({ user, profile }: { user: { email?: string | null; user_metadata?: Record<string, unknown> }; profile: Profile | null }) {
  const meta = user.user_metadata ?? {};
  const checks = [
    !!user.email,
    !!(profile?.full_name ?? meta.full_name),
    !!(profile?.avatar_url ?? meta.avatar_url),
    !!profile?.phone,
  ];
  const done = checks.filter(Boolean).length;
  const pct = Math.round((done / checks.length) * 100);
  if (pct === 100) return null;
  return (
    <div className="mt-2.5 block">
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
        <span>Profile {pct}%</span>
        <Link to="/account/profile" className="text-accent hover:underline">Complete</Link>
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease }}
          className="h-full bg-gradient-to-r from-accent to-primary shadow-[0_0_10px_var(--color-accent)]"
        />
      </div>
    </div>
  );
}

function PremiumLoader() {
  return (
    <div className="min-h-[80vh] grid place-items-center relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)", opacity: 0.6 }} />
      <div className="flex flex-col items-center gap-4">
        <motion.div
          animate={{ scale: [1, 1.08, 1], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="size-16 rounded-2xl overflow-hidden bg-white grid place-items-center shadow-[0_0_40px_var(--color-accent)] border border-accent/20"
        >
          <img src={logoSrc} alt="FoundOurMarket" className="w-full h-full object-cover" />
        </motion.div>

        <p className="text-sm font-display font-semibold tracking-wide text-gradient-ember">FoundOurMarket™</p>
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
          <Loader2 className="size-3 animate-spin text-accent" /> Loading your store
        </div>
      </div>
    </div>
  );
}

type Journey =
  | { type: "replacement"; ret: Return; order: Order | null }
  | { type: "refund"; ret: Return; order: Order | null }
  | { type: "order"; order: Order };

function orderStepIndex(status: string): number {
  const s = status.toLowerCase();
  const steps = [
    ["pending", "confirmed", "processing", "packed", "shipped", "in_transit", "out_for_delivery", "delivered", "completed"],
    ["packed", "shipped", "in_transit", "out_for_delivery", "delivered", "completed"],
    ["shipped", "in_transit", "out_for_delivery", "delivered", "completed"],
    ["out_for_delivery", "delivered", "completed"],
    ["delivered", "completed"],
  ];
  return steps.reduce((acc, m, i) => (m.includes(s) ? i : acc), 0);
}

function refundStepIndex(ret: Return): number {
  const s = String(ret.status ?? "").toLowerCase();
  const ref = String(ret.refund_status ?? "").toLowerCase();
  if (/refunded|issued|paid|completed|succeeded/.test(ref)) return 3;
  if (/processing|pending_payout|payout|approved/.test(ref) || /approved/.test(s)) return 2;
  if (/review|pending/.test(s)) return 1;
  return 0;
}

function replacementStepIndex(ret: Return): number {
  const s = String(ret.status ?? "").toLowerCase();
  const rep = String(ret.replacement_status ?? "").toLowerCase();
  if (/delivered|completed|fulfilled/.test(rep)) return 3;
  if (/shipped|transit|dispatch/.test(rep)) return 2;
  if (/processing|preparing|packed|approved/.test(rep) || /approved/.test(s)) return 1;
  return 0;
}

function TrackingWidget({ journey, format }: { journey: Journey; format: (n: number) => string }) {
  const sourceOrder = journey.type === "order" ? journey.order : journey.order;
  const item = sourceOrder?.order_items?.[0] ?? null;
  const productName = item?.name ?? "Your item";
  const productImage = item?.image ?? logoSrc;

  let title: string;
  let steps: { label: string; icon: typeof Truck }[];
  let activeIdx: number;
  let idLabel: string;
  let metaRight: { label: string; value: string } | null = null;
  let statusLabel: string;
  let detailsLink: ReactNode;

  if (journey.type === "order") {
    const o = journey.order;
    title = "Tracking Your Order";
    steps = [
      { label: "Ordered", icon: CheckCircle2 },
      { label: "Packed", icon: Box },
      { label: "Shipped", icon: Truck },
      { label: "Out for Delivery", icon: MapPin },
      { label: "Delivered", icon: Home },
    ];
    activeIdx = orderStepIndex(o.status);
    idLabel = `Order #${o.id.slice(0, 8)}`;
    statusLabel = steps[activeIdx].label;
    metaRight = {
      label: "Est. delivery",
      value: new Date(new Date(o.created_at).getTime() + 7 * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };
    detailsLink = (
      <Link to="/orders/$id" params={{ id: o.id }} className="action-link">
        View Details <ArrowRight className="size-3" />
      </Link>
    );
  } else if (journey.type === "refund") {
    const r = journey.ret;
    title = "Tracking Your Refund";
    steps = [
      { label: "Requested", icon: CheckCircle2 },
      { label: "Under Review", icon: Eye },
      { label: "Approved", icon: Shield },
      { label: "Refunded", icon: Wallet },
    ];
    activeIdx = refundStepIndex(r);
    idLabel = `Refund #${r.id.slice(0, 8)}`;
    statusLabel = steps[activeIdx].label;
    metaRight = r.refund_amount != null ? { label: "Refund amount", value: format(Number(r.refund_amount)) } : null;
    detailsLink = (
      <Link to="/account/returns" className="action-link">
        View Details <ArrowRight className="size-3" />
      </Link>
    );
  } else {
    const r = journey.ret;
    title = "Tracking Your Replacement";
    steps = [
      { label: "Requested", icon: CheckCircle2 },
      { label: "Approved", icon: Shield },
      { label: "Shipped", icon: Truck },
      { label: "Delivered", icon: Home },
    ];
    activeIdx = replacementStepIndex(r);
    idLabel = `Replacement #${r.id.slice(0, 8)}`;
    statusLabel = steps[activeIdx].label;
    detailsLink = (
      <Link to="/account/returns" className="action-link">
        View Details <ArrowRight className="size-3" />
      </Link>
    );
  }

  return (
    <motion.section {...fadeUp} exit={{ opacity: 0, y: -10 }} className="relative z-20">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm sm:text-base font-medium flex items-center gap-2">
          <span className="size-7 rounded-lg bg-accent/10 text-accent grid place-items-center">
            <Truck className="size-3.5" />
          </span>
          {title}
        </h2>
        {detailsLink}
      </div>
      <div className="card-premium rounded-2xl p-4 sm:p-5 relative overflow-hidden">

        {/* Product row */}
        <div className="relative flex items-start gap-3 mb-4">
          <div className="size-16 shrink-0 rounded-xl overflow-hidden bg-secondary border border-white/10 grid place-items-center">
            <img src={productImage} alt={productName} className="w-full h-full object-cover" loading="lazy" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug line-clamp-2">{productName}</p>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{idLabel}</p>
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-semibold">
              <span className="size-1.5 rounded-full bg-accent animate-pulse" /> {statusLabel}
            </span>
          </div>
          {metaRight && (
            <div className="text-right shrink-0">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{metaRight.label}</p>
              <p className="text-sm font-display font-semibold text-accent">{metaRight.value}</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="relative">
          <div className="absolute top-4 left-4 right-4 h-0.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(activeIdx / (steps.length - 1)) * 100}%` }}
              transition={{ duration: 0.9, ease }}
              className="h-full bg-gradient-to-r from-accent to-primary shadow-[0_0_10px_var(--color-accent)]"
            />
          </div>
          <div className="relative grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((s, i) => {
              const Icon = s.icon;
              const done = i <= activeIdx;
              const current = i === activeIdx;
              return (
                <div key={s.label} className="flex flex-col items-center gap-1.5 text-center">
                  <motion.span
                    initial={false}
                    animate={current ? { scale: [1, 1.15, 1] } : {}}
                    transition={{ duration: 0.5, ease }}
                    className={`size-8 rounded-full grid place-items-center ring-2 transition-all ${
                      done
                        ? "bg-accent text-accent-foreground ring-accent shadow-[0_0_14px_var(--color-accent)]"
                        : "bg-card text-muted-foreground ring-white/10"
                    }`}
                  >
                    <Icon className="size-3.5" />
                  </motion.span>
                  <span className={`text-[9px] font-mono uppercase tracking-wider leading-tight ${current ? "text-foreground font-semibold" : done ? "text-foreground/80" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.section>
  );
}


function ReturnTimeline({ ret, format }: { ret: Return; format: (n: number) => string }) {
  const status = String(ret.status).toLowerCase();
  const refund = String(ret.refund_status).toLowerCase();
  const replacement = String(ret.replacement_status).toLowerCase();
  const isReplacement = String(ret.resolution_type).toLowerCase() !== "refund";
  const rejected = status === "rejected";
  const steps = isReplacement
    ? [
        { key: "requested", label: "Requested", icon: RotateCcw },
        { key: "approved", label: "Approved", icon: CheckCircle2 },
        { key: "processing", label: "Processing", icon: Box },
        { key: "shipped", label: "Shipped", icon: Wallet },
        { key: "delivered", label: "Delivered", icon: Home },
      ]
    : [
        { key: "requested", label: "Requested", icon: RotateCcw },
        { key: "approved", label: "Approved", icon: CheckCircle2 },
        { key: "received", label: "Item Received", icon: Box },
        { key: "processing", label: "Refund Processing", icon: Wallet },
        { key: "completed", label: "Refund Completed", icon: Home },
      ];
  const activeIdx = (() => {
    if (isReplacement) {
      if (replacement === "delivered") return 4;
      if (replacement === "shipped") return 3;
      if (replacement === "processing") return 2;
      if (replacement === "approved" || status === "approved") return 1;
      return 0;
    }
    if (refund === "issued" || status === "completed") return 4;
    if (refund === "processing") return 3;
    if (status === "received") return 2;
    if (status === "approved") return 1;
    return 0;
  })();
  return (
    <motion.section {...fadeUp}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm sm:text-base font-medium flex items-center gap-2">
          <span className="size-7 rounded-lg bg-accent/10 text-accent grid place-items-center">
            <RotateCcw className="size-3.5" />
          </span>
          Return request
        </h2>
        <Link to="/account/returns" className="action-link">Details <ArrowRight className="size-3" /></Link>
      </div>
      <div className="card-premium rounded-2xl p-4 sm:p-5 relative overflow-hidden">
        
        <div className="relative flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Return #{ret.id.slice(0, 8)}</p>
            <p className="text-sm font-medium mt-0.5 truncate">Order #{ret.order_id.slice(0, 8)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{rejected ? "Status" : isReplacement ? "Replacement" : "Refund"}</p>
            <p className="text-sm font-display font-semibold text-accent capitalize">
              {rejected
                ? "Rejected"
                : isReplacement
                  ? (replacement || "pending")
                  : ret.refund_amount ? format(Number(ret.refund_amount)) : "—"}
            </p>
          </div>
        </div>
        {rejected ? (
          <p className="relative text-xs text-muted-foreground">This return request was not approved. Contact support for help.</p>
        ) : (
          <div className="relative">
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(activeIdx / (steps.length - 1)) * 100}%` }}
                transition={{ duration: 0.9, ease }}
                className="h-full bg-gradient-to-r from-accent to-primary shadow-[0_0_10px_var(--color-accent)]"
              />
            </div>
            <div className="relative grid grid-cols-5 gap-1">
              {steps.map((s, i) => {
                const Icon = s.icon;
                const done = i <= activeIdx;
                return (
                  <div key={s.key} className="flex flex-col items-center gap-1.5 text-center">
                    <motion.span
                      initial={false}
                      animate={done ? { scale: [1, 1.15, 1] } : {}}
                      transition={{ duration: 0.5, ease }}
                      className={`size-8 rounded-full grid place-items-center ring-2 transition-all ${
                        done
                          ? "bg-accent text-accent-foreground ring-accent shadow-[0_0_14px_var(--color-accent)]"
                          : "bg-card text-muted-foreground ring-white/10"
                      }`}
                    >
                      <Icon className="size-3.5" />
                    </motion.span>
                    <span className={`text-[9px] font-mono uppercase tracking-wider leading-tight ${done ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}






/* ---------- premium hub / support / continue-shopping ---------- */

function HubCard({
  icon: Icon, title, desc, count, loading, to, tone = "amber",
}: { icon: typeof Package; title: string; desc: string; count?: number; loading?: boolean; to: string; tone?: keyof typeof TONES }) {
  const t = TONES[tone];
  return (
    <Link to={to} className="group block h-full">
      <motion.div
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.25, ease }}
        className="relative h-full min-h-[112px] overflow-hidden rounded-2xl p-4 sm:p-5 card-premium hover:shadow-[var(--shadow-soft)]"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50 bg-gradient-to-br from-white/[0.04] to-transparent" />
        <div className="relative flex items-start justify-between">
          <span className={`size-11 rounded-2xl grid place-items-center transition-transform group-hover:scale-105 ${t.icon}`}>
            <Icon className="size-5" />
          </span>
          <ChevronRight className="size-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
        </div>
        <div className="relative mt-3 flex items-baseline gap-2">
          <p className="text-sm sm:text-base font-display font-semibold group-hover:text-accent transition-colors">{title}</p>
          {typeof count === "number" && (
            loading
              ? <span className="h-4 w-6 rounded bg-foreground/5 animate-pulse" />
              : count > 0 && <span className="text-xs font-mono tabular-nums text-accent">{count}</span>
          )}
        </div>
        <p className="relative text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">{desc}</p>
      </motion.div>
    </Link>
  );
}

function SupportCard({
  icon: Icon, title, desc, to, onClick, tone = "amber",
}: { icon: typeof Package; title: string; desc: string; to?: string; onClick?: () => void; tone?: keyof typeof TONES }) {
  const t = TONES[tone];
  const inner = (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.25, ease }}
      className="relative h-full min-h-[100px] overflow-hidden rounded-2xl p-4 sm:p-5 card-premium hover:shadow-[var(--shadow-soft)] text-left"
    >
      <span className={`relative size-10 rounded-xl grid place-items-center transition-transform group-hover:scale-105 ${t.icon}`}>
        <Icon className="size-[18px]" />
      </span>
      <p className="relative text-sm font-display font-semibold mt-3 group-hover:text-accent transition-colors leading-tight">{title}</p>
      <p className="relative text-[11px] sm:text-xs text-muted-foreground mt-0.5">{desc}</p>
    </motion.div>
  );
  const cls = "group block h-full w-full";
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <Link to={to!} className={cls}>{inner}</Link>;
}

function AccountActionRow({
  to, icon: Icon, label, sublabel,
}: { to: string; icon: typeof Package; label: string; sublabel: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 px-4 py-3.5 sm:px-5 min-h-[56px] hover:bg-accent/5 active:bg-accent/10 transition-colors">
      <span className="size-10 rounded-xl bg-accent/10 text-accent grid place-items-center shrink-0 group-hover:bg-accent/20 group-hover:scale-105 transition-all">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium group-hover:text-accent transition-colors">{label}</p>
        <p className="text-[11px] text-muted-foreground">{sublabel}</p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

function CompactSupportCard({
  icon: Icon, title, desc, to, onClick, tone = "amber",
}: { icon: typeof Package; title: string; desc: string; to?: string; onClick?: () => void; tone?: keyof typeof TONES }) {
  const t = TONES[tone];
  const inner = (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.2, ease }}
      className="relative h-full min-h-[80px] overflow-hidden rounded-xl p-3 sm:p-3.5 card-premium hover:shadow-[var(--shadow-soft)] text-left"
    >
      <span className={`relative size-8 rounded-lg grid place-items-center transition-transform group-hover:scale-105 ${t.icon}`}>
        <Icon className="size-4" />
      </span>
      <p className="relative text-[13px] font-medium mt-2 group-hover:text-accent transition-colors leading-tight">{title}</p>
      <p className="relative text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">{desc}</p>
    </motion.div>
  );
  const cls = "group block h-full w-full";
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <Link to={to!} className={cls}>{inner}</Link>;
}

type ContinueItem = { product: Product; badge: "cart" | "saved" | "viewed" };


function ContinueShopping({ items }: { items: ContinueItem[] }) {
  const shown = items.slice(0, 9);
  const hasMore = items.length > 9;
  return (
    <div className="-mx-4 sm:mx-0">
      <div
        data-product-grid
        className="flex items-start gap-3 overflow-x-auto snap-x snap-mandatory px-4 sm:px-0 pb-3 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollPaddingLeft: "1rem",
          scrollPaddingRight: "1rem",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
        }}
      >
        {shown.map(({ product }) => (
          <div
            key={product.id ?? product.slug}
            data-product-card-frame
            className="cs-compact relative snap-start shrink-0 w-[44%] min-[420px]:w-[40%] sm:w-[240px]"
          >
            <ProductCard product={product} />
          </div>
        ))}
        {hasMore && (
          <CarouselViewAllCard
            to="/continue-shopping"
            remaining={items.length - shown.length}
            className="w-[44%] min-[420px]:w-[40%] sm:w-[240px]"
          />
        )}
        <div aria-hidden className="shrink-0 w-1" />
      </div>
    </div>
  );
}


