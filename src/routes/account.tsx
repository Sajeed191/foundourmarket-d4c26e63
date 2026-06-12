import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { openCrispChat } from "@/lib/crisp";
import { useEffect, useMemo, useState } from "react";
import { motion, useMotionValue, useTransform, animate, useScroll, AnimatePresence, useMotionValueEvent } from "framer-motion";
import {
  LogOut, Package, Loader2, RotateCcw, MapPin, Bell, Heart, Clock, Sparkles,
  ShoppingBag, Wallet, ChevronRight, Shield, Settings, Eye, User as UserIcon,
  HelpCircle, LifeBuoy, MessageCircle, TrendingUp, ArrowRight, Star,
  Search, Zap, Gift, Tag, Flame, Truck, Lock, Globe, Crown,
  CheckCircle2, Box, Home, X, Plus, Minus, CreditCard, UserCog,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { useWishlist } from "@/lib/wishlist";
import { useNotifications } from "@/lib/notifications";

import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useIsAdmin } from "@/lib/use-admin";

import { useProducts } from "@/lib/use-products";
import { useCart } from "@/lib/cart";
import { ProductCard } from "@/components/site/ProductCard";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { type Product, discountPercent } from "@/lib/products";
import { PolicyCrossLinks } from "@/components/site/PolicyLinks";
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

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const { format } = useRegion();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [returns, setReturns] = useState<Return[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { slugs: wishSlugs } = useWishlist();
  const { unread } = useNotifications();
  const { isAdmin } = useIsAdmin();
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
      .select("full_name,phone,avatar_url")
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
    return list.find((r) => !isCompleted(r)) ?? null;
  }, [returns]);


  const cartCount = cart.items.reduce((s, i) => s + i.qty, 0);
  const { slugs: recentSlugs } = useRecentlyViewed();

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
  const recentlyViewed = useMemo(() => {
    const map = new Map(products.map((p) => [p.slug, p] as const));
    return recentSlugs.map((s) => map.get(s)).filter(Boolean).slice(0, 8) as Product[];
  }, [products, recentSlugs]);

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


        {/* 1 — HEADER */}
        <div className="relative z-30">

          <motion.header {...fadeUp} className="border-glow noise-layer glass-reflect relative overflow-hidden rounded-[28px] sm:rounded-3xl glass-strong">
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="absolute -top-32 -right-20 size-[420px] rounded-full opacity-70 animate-ambient" style={{ background: "var(--gradient-ember)", filter: "blur(80px)" }} />
            <div className="absolute -bottom-32 -left-24 size-[360px] rounded-full opacity-60 animate-glow" style={{ background: "var(--gradient-violet)", filter: "blur(90px)" }} />
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
          <div className="relative p-3.5 sm:p-4 lg:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Avatar with online status */}
              <div className="relative shrink-0 animate-float-soft">
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.5, ease }}
                  className="size-12 sm:size-14 rounded-2xl border border-white/10 bg-secondary overflow-hidden grid place-items-center shadow-[var(--shadow-float)] ring-1 ring-accent/30"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <img src={logoSrc} alt="FoundOurMarket logo" className="w-full h-full object-cover" />
                  )}
                </motion.div>
                <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-2xl blur-xl opacity-60 animate-glow" style={{ background: "var(--gradient-ember)" }} />
                <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 border-2 border-card shadow-[0_0_10px_oklch(0.7_0.18_150)]" />
              </div>

              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {greeting().text} {greeting().emoji}
                </p>
                <h1 className="mt-0.5 text-xl leading-tight sm:text-2xl lg:text-3xl font-display font-semibold tracking-tight truncate">
                  Welcome back, <span className="text-gradient-ember">{firstName}</span>
                </h1>
                <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground truncate">{user?.email}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-center">
                {isAdmin && (
                  <Link
                    to="/account/notifications"
                    aria-label="Notifications"
                    className="relative size-9 sm:size-10 grid place-items-center rounded-xl glass hover:bg-white/10 hover:text-accent transition-all"
                  >
                    <Bell className="size-4" />
                    {unread > 0 && (
                      <span className="absolute top-1 right-1 size-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_var(--color-accent)]" />
                    )}
                  </Link>
                )}
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
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <OverviewCard icon={Package} label="Total Orders" value={stats.count} loading={!orders} to="/account/orders" tone="amber" />
            <OverviewCard icon={Heart} label="Wishlist" value={wishSlugs.size} to="/wishlist" tone="rose" />
            <OverviewCard icon={ShoppingBag} label="Cart Items" value={cartCount} to="/cart" tone="blue" />
            <OverviewCard icon={Wallet} label="Total Saved" value={stats.saved} loading={!orders} formatter={format} tone="emerald" />
          </div>
        </motion.section>

        {/* 3 — QUICK ACTIONS */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
          <SectionHeader title="Quick actions" eyebrow="Jump to" />
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <ActionCard to="/account/orders" icon={Package} title="Orders" subtitle="Track & invoices" badge={stats.active} />
            <ActionCard to="/wishlist" icon={Heart} title="Wishlist" subtitle="Saved items" badge={wishSlugs.size} />
            <ActionCard to="/account/addresses" icon={MapPin} title="Addresses" subtitle="Shipping & billing" />
            <ActionCard to="/account/payments" icon={CreditCard} title="Payments" subtitle="Saved methods" />
            <ActionCard to="/account/profile" icon={UserIcon} title="Profile" subtitle="Your details" />
            <ActionCard to="/account/security" icon={Shield} title="Security" subtitle="Account safety" />
            <ActionCard to="/account/returns" icon={RotateCcw} title="Returns" subtitle="Requests & status" badge={returns?.length ?? 0} />
            <ActionCard to="/search" icon={Gift} title="Offers" subtitle="Deals & promos" />
            <ActionCard to="/search" icon={Tag} title="Categories" subtitle="Browse all" />
          </div>
        </motion.section>

        {/* 4 — RECENTLY VIEWED */}
        {recentlyViewed.length > 0 && (
          <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
            <SectionHeader title="Continue Shopping" eyebrow="Pick up where you left off" />
            <ContinueShopping items={recentlyViewed} />
          </motion.section>
        )}

        {/* 5 — FOOTER ACTIONS */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.12 }} className="pt-1">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <FooterAction icon={HelpCircle} label="Support" to="/account/support" />
            <FooterAction icon={LifeBuoy} label="FAQ" to="/help" />
            <FooterAction icon={MessageCircle} label="Contact" onClick={() => openCrispChat()} />
            <FooterAction icon={LogOut} label="Sign out" onClick={signOut} />
          </div>
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
  amber: { icon: "bg-amber-500/15 text-amber-500", glow: "oklch(0.74 0.19 49)" },
  rose: { icon: "bg-rose-500/15 text-rose-500", glow: "oklch(0.7 0.2 18)" },
  blue: { icon: "bg-sky-500/15 text-sky-500", glow: "oklch(0.7 0.16 240)" },
  emerald: { icon: "bg-emerald-500/15 text-emerald-500", glow: "oklch(0.72 0.16 160)" },
} as const;

function OverviewCard({
  icon: Icon, label, value, accent, loading, to, formatter, tone = "amber",
}: { icon: typeof Package; label: string; value: number; accent?: boolean; loading?: boolean; to?: string; formatter?: (n: number) => string; tone?: keyof typeof TONES }) {
  const t = TONES[tone];
  const inner = (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.25, ease }}
      className={`group h-full w-full relative overflow-hidden rounded-2xl p-3.5 sm:p-5 card-premium transition-all ${
        accent ? "shadow-[var(--shadow-glow)]" : "hover:shadow-[var(--shadow-soft)]"
      }`}
    >
      {/* Soft tinted corner glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full blur-3xl opacity-40 group-hover:opacity-60 transition-opacity duration-500"
        style={{ background: t.glow }}
      />
      <div className="relative flex items-center justify-between mb-3">
        <span className={`size-9 rounded-xl grid place-items-center transition-transform group-hover:scale-105 ${t.icon}`}>
          <Icon className="size-4" />
        </span>
      </div>
      {loading ? (
        <div className="h-7 w-12 rounded-md bg-foreground/5 animate-pulse" />
      ) : (
        <AnimatedNumber
          value={value}
          formatter={formatter}
          className="relative block text-xl sm:text-3xl font-display font-semibold tabular-nums text-foreground"
        />
      )}
      <p className="relative text-[10px] sm:text-xs font-mono uppercase tracking-widest text-muted-foreground mt-1.5 truncate">{label}</p>
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
      <div className="flex gap-2 sm:gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-px-4 px-4 sm:px-0 pb-2 [-webkit-overflow-scrolling:touch]">
        {items.map((p, i) => (
          <motion.div
            key={p.slug}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.4, ease, delay: Math.min(i * 0.05, 0.3) }}
            className="snap-center shrink-0 w-[44%] xs:w-[40%] sm:w-[22%] lg:w-[20%] max-w-[150px] rounded-2xl transition-shadow duration-500 hover:shadow-[0_22px_60px_-22px_oklch(0.74_0.19_49/0.55)]"
          >
            <ProductCard product={p as never} compact />
          </motion.div>
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
      <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 size-40 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />
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
    <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
      {items.map((p) => {
        const saved = has(p.slug);
        return (
          <div
            key={p.slug}
            className="snap-start shrink-0 w-[150px] sm:w-[160px] group bg-card border border-border rounded-xl p-2 hover:border-accent/40 transition-colors"
          >
            <Link to="/products/$slug" params={{ slug: p.slug }} className="block relative">
              <div className="aspect-square rounded-lg overflow-hidden bg-black/40">
                <img src={p.image} alt={p.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
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
              <p className="text-[11.5px] font-medium truncate">{p.name}</p>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="font-mono text-[11px] text-accent truncate">{format(p.price)}</span>
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
        <div aria-hidden className="absolute -top-16 -right-10 size-56 rounded-full blur-3xl opacity-60" style={{ background: "var(--gradient-ember)" }} />
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

function OrderTimeline({ order, format }: { order: Order; format: (n: number) => string }) {
  const status = String(order.status).toLowerCase();
  const steps = [
    { key: "ordered", label: "Ordered", icon: CheckCircle2, match: ["pending", "confirmed", "processing", "packed", "shipped", "in_transit", "out_for_delivery", "delivered", "completed"] },
    { key: "packed", label: "Packed", icon: Box, match: ["packed", "shipped", "in_transit", "out_for_delivery", "delivered", "completed"] },
    { key: "shipped", label: "Shipped", icon: Truck, match: ["shipped", "in_transit", "out_for_delivery", "delivered", "completed"] },
    { key: "out", label: "Out for Delivery", icon: MapPin, match: ["out_for_delivery", "delivered", "completed"] },
    { key: "delivered", label: "Delivered", icon: Home, match: ["delivered", "completed"] },
  ];
  const activeIdx = steps.reduce((acc, s, i) => (s.match.includes(status) ? i : acc), 0);
  const eta = new Date(new Date(order.created_at).getTime() + 7 * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <motion.section {...fadeUp}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm sm:text-base font-medium flex items-center gap-2">
          <span className="size-7 rounded-lg bg-accent/10 text-accent grid place-items-center">
            <Truck className="size-3.5" />
          </span>
          Tracking your order
        </h2>
        <Link to="/orders/$id" params={{ id: order.id }} className="action-link">Details <ArrowRight className="size-3" /></Link>
      </div>
      <div className="card-premium rounded-2xl p-4 sm:p-5 relative overflow-hidden">
        <div aria-hidden className="absolute -top-16 -right-10 size-48 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />
        <div className="relative flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Order #{order.id.slice(0, 8)}</p>
            <p className="text-sm font-medium mt-0.5 truncate">{order.order_items.length} item{order.order_items.length === 1 ? "" : "s"} · {format(Number(order.total))}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Est. delivery</p>
            <p className="text-sm font-display font-semibold text-accent">{eta}</p>
          </div>
        </div>
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
        <div aria-hidden className="absolute -top-16 -right-10 size-48 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />
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
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full blur-3xl opacity-40 group-hover:opacity-70 transition-opacity duration-500"
          style={{ background: t.glow }}
        />
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
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full blur-3xl opacity-40 group-hover:opacity-60 transition-opacity duration-500"
        style={{ background: t.glow }}
      />
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

function ContinueShopping({ items }: { items: Product[] }) {
  const shown = items.slice(0, 5);
  const hasMore = items.length > 5;
  return (
    <div className="-mx-4 sm:mx-0">
      <div
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 sm:px-0 pb-3 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollPaddingLeft: "1rem",
          scrollPaddingRight: "1rem",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
        }}
      >
        {shown.map((p) => (
          <div
            key={p.slug}
            className="snap-start shrink-0 w-[44%] min-[420px]:w-[40%] sm:w-[240px]"
          >
            <ProductCard product={p} />
          </div>
        ))}
        {hasMore && (
          <Link
            to="/search"
            className="snap-start shrink-0 w-[44%] min-[420px]:w-[40%] sm:w-[240px] grid place-items-center rounded-[22px] border border-accent/20 bg-card/40 backdrop-blur-xl text-center transition-colors hover:border-accent/40"
          >
            <span className="flex flex-col items-center gap-2 px-4 py-8">
              <span className="grid size-11 place-items-center rounded-full bg-accent/10 text-accent">
                <Plus className="size-5" />
              </span>
              <span className="text-sm font-semibold text-foreground">View all</span>
              <span className="text-[11px] text-muted-foreground">Browse more products</span>
            </span>
          </Link>
        )}
        <div aria-hidden className="shrink-0 w-1" />
      </div>
    </div>
  );
}


