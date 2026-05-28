import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { loadCrisp, openCrispChat, closeCrispChat } from "@/lib/crisp";
import { useEffect, useMemo, useState } from "react";
import { motion, useMotionValue, useTransform, animate, useScroll, AnimatePresence } from "framer-motion";
import {
  LogOut, Package, Loader2, RotateCcw, MapPin, Bell, Heart, Clock, Sparkles,
  ShoppingBag, Wallet, ChevronRight, Shield, Settings, Eye, User as UserIcon,
  HelpCircle, LifeBuoy, MessageCircle, TrendingUp, ArrowRight, Star,
  Search, Zap, Gift, Tag, Headphones, Flame, Truck, Lock, BadgeCheck, Globe, Mic, Camera, Crown,
  CheckCircle2, Box, Home, X, Plus, Minus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { useWishlist } from "@/lib/wishlist";
import { useNotifications } from "@/lib/notifications";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

import { useProducts } from "@/lib/use-products";
import { useCart } from "@/lib/cart";
import { ProductCard } from "@/components/site/ProductCard";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Product } from "@/lib/products";
import logoSrc from "@/assets/logo.jpeg";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account — FoundOurMarket™" }] }),
  component: AccountPage,
});

type Order = {
  id: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
  order_items: { name: string; quantity: number; image: string | null }[];
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
  const { slugs: wishSlugs } = useWishlist();
  const { unread } = useNotifications();
  const { products } = useProducts();
  const cart = useCart();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select("id,status,total,currency,created_at,order_items(name,quantity,image)")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, [user]);

  const firstName = useMemo(() => {
    const full = (user?.user_metadata?.full_name as string | undefined) ?? "";
    return full.split(" ")[0] || user?.email?.split("@")[0] || "there";
  }, [user]);

  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? "";

  const stats = useMemo(() => {
    const list = orders ?? [];
    const spent = list.reduce((s, o) => s + Number(o.total || 0), 0);
    const active = list.filter((o) => !["delivered", "cancelled", "refunded"].includes(String(o.status).toLowerCase())).length;
    const saved = Math.round(spent * 0.08);
    const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";
    const categoryCount = new Map<string, number>();
    for (const o of list) for (const it of o.order_items) categoryCount.set(it.name, (categoryCount.get(it.name) ?? 0) + it.quantity);
    const topCategory = [...categoryCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    const latestActive = list.find((o) => !["delivered", "cancelled", "refunded"].includes(String(o.status).toLowerCase())) ?? null;
    return { count: list.length, spent, active, saved, memberSince, topCategory, latestActive };
  }, [orders, user]);

  const cartCount = cart.items.reduce((s, i) => s + i.qty, 0);
  const { slugs: recentSlugs } = useRecentlyViewed();

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
    <div className="min-h-screen pb-28 sm:pb-16">
      {/* Ambient page glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[120%] h-[60vh] opacity-50" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />
      </div>

      {/* Floating compact sticky bar (appears on scroll) */}
      <FloatingHeaderBar firstName={firstName} avatarUrl={avatarUrl} unread={unread} cartCount={cartCount} />

      <div className="container-page py-4 sm:py-10 lg:py-14 space-y-5 sm:space-y-10">


        {/* 1 — HEADER */}
        <motion.header {...fadeUp} className="relative overflow-hidden rounded-[28px] sm:rounded-3xl glass-strong">
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
          <div className="relative p-4 sm:p-7 lg:p-9 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="relative shrink-0">
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease }}
                  className="size-14 sm:size-16 rounded-2xl border border-white/10 bg-secondary overflow-hidden grid place-items-center shadow-[var(--shadow-float)] ring-1 ring-accent/30"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <img src={logoSrc} alt="FoundOurMarket logo" className="w-full h-full object-cover" />
                  )}
                </motion.div>
                <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-emerald-500 border-2 border-card shadow-[0_0_10px_oklch(0.7_0.18_150)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-1 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_oklch(0.7_0.18_150)] animate-pulse" /> Online · {greeting().text} {greeting().emoji}
                </p>
                <h1 className="text-[20px] leading-tight sm:text-2xl lg:text-3xl font-display font-semibold truncate tracking-tight">
                  Welcome back, <span className="text-gradient-ember">{firstName}</span>
                </h1>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <p className="text-[11px] sm:text-sm text-muted-foreground truncate">{user.email}</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[9px] font-mono uppercase tracking-widest ring-1 ring-accent/30">
                    <Crown className="size-2.5" /> Premium
                  </span>
                </div>
                {/* Profile completion */}
                <ProfileCompletion user={user} />
              </div>
              <div className="flex sm:hidden items-center gap-1.5 shrink-0">
                <Link to="/account/notifications" aria-label="Notifications" className="relative size-10 grid place-items-center rounded-xl glass hover:text-accent transition-all">
                  <Bell className="size-4" />
                  {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_var(--color-accent)]" />}
                </Link>
                <Link to="/account/profile" aria-label="Settings" className="size-10 grid place-items-center rounded-xl glass hover:text-accent transition-all">
                  <Settings className="size-4" />
                </Link>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 sm:gap-3 self-start sm:self-auto">
              <Link
                to="/account/notifications"
                aria-label="Notifications"
                className="relative size-11 grid place-items-center rounded-xl glass hover:bg-white/10 hover:text-accent transition-all"
              >
                <Bell className="size-4" />
                {unread > 0 && (
                  <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_var(--color-accent)]" />
                )}
              </Link>
              <Link
                to="/account/profile"
                aria-label="Settings"
                className="size-11 grid place-items-center rounded-xl glass hover:bg-white/10 hover:text-accent transition-all"
              >
                <Settings className="size-4" />
              </Link>
            </div>
          </div>
        </motion.header>

        {/* SEARCH BAR */}
        <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.03 }}>
          <SmartSearchBar />
        </motion.div>




        {/* 2 — OVERVIEW CARDS */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.05 }}>
          <SectionHeader title="Overview" eyebrow="Your account at a glance" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <OverviewCard icon={Package} label="Total orders" value={stats.count} loading={!orders} accent to="/account/orders" />
            <OverviewCard icon={Heart} label="Wishlist" value={wishSlugs.size} to="/wishlist" />
            <OverviewCard icon={ShoppingBag} label="Cart items" value={cartCount} to="/cart" />
            <OverviewCard icon={Wallet} label="Total saved" value={stats.saved} formatter={format} loading={!orders} />
          </div>
        </motion.section>



        {/* 3 — QUICK ACTIONS */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
          <SectionHeader title="Quick actions" eyebrow="Jump to" />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-2.5">
            <ActionCard to="/account/orders" icon={Package} title="Orders" subtitle="Track & invoices" badge={stats.active || undefined} />
            <ActionCard to="/wishlist" icon={Heart} title="Wishlist" subtitle="Saved items" badge={wishSlugs.size || undefined} />
            <ActionCard to="/search" icon={Tag} title="Categories" subtitle="Browse all" />
            <ActionCard to="/search" icon={Gift} title="Offers" subtitle="Deals & promos" />
            <ActionCard to="/help" icon={Headphones} title="Support" subtitle="24/7 help" />
            <ActionCard to="/account/security" icon={Shield} title="Security" subtitle="Account safety" />
          </div>
        </motion.section>


        {/* DESKTOP GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2 space-y-6 lg:space-y-8">
            {/* ORDER TRACKING TIMELINE */}
            {stats.latestActive && <OrderTimeline order={stats.latestActive} format={format} />}

            {/* RECENTLY VIEWED */}
            {recentlyViewed.length > 0 && (
              <SectionBlock title="Recently viewed" icon={Eye}>
                <ProductScroller items={recentlyViewed} />
              </SectionBlock>
            )}


          </div>


          {/* SIDEBAR */}
          <aside className="space-y-6 lg:space-y-8">
            {/* 8 — ACCOUNT INSIGHTS */}
            <SectionBlock title="Account insights" icon={TrendingUp}>
              <div className="grid grid-cols-2 gap-2.5">
                <InsightStat label="Total orders" value={String(stats.count)} />
                <InsightStat label="Total spent" value={format(stats.spent)} accent />
                <InsightStat label="Saved" value={format(stats.saved)} />
                <InsightStat label="Wishlist" value={String(wishSlugs.size)} />
                <InsightStat label="Member since" value={stats.memberSince} small />
                <InsightStat label="Top item" value={stats.topCategory} small truncate />
              </div>
            </SectionBlock>

          </aside>
        </div>

        {/* WHY SHOP WITH US */}
        <WhyShopWithUs />

        {/* 10 — FOOTER ACTIONS */}
        <motion.footer {...fadeUp} className="pt-2">
          <div className="relative overflow-hidden rounded-3xl glass-strong p-5 sm:p-7">
            <div aria-hidden className="absolute -top-20 -left-10 size-64 rounded-full opacity-40" style={{ background: "var(--gradient-ember)", filter: "blur(80px)" }} />
            <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FooterAction icon={LifeBuoy} label="Support" to="/" />
              <FooterAction icon={HelpCircle} label="FAQ" to="/" />
              <FooterAction icon={MessageCircle} label="Contact" to="/" />
              <button
                onClick={signOut}
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl glass p-4 hover:border-destructive/50 hover:text-destructive hover:-translate-y-0.5 transition-all"
              >
                <span className="size-9 rounded-xl bg-destructive/10 text-destructive grid place-items-center group-hover:bg-destructive/20 transition-colors">
                  <LogOut className="size-4" />
                </span>
                <span className="text-[11px] uppercase tracking-widest">Sign out</span>
              </button>
            </div>
          </div>
        </motion.footer>
      </div>

      {/* FLOATING SUPPORT BUTTON */}
      <FloatingSupportButton />

    </div>
  );
}

function FloatingSupportButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    w.$crisp = w.$crisp || [];
    w.$crisp.push(["on", "chat:opened", () => setOpen(true)]);
    w.$crisp.push(["on", "chat:closed", () => setOpen(false)]);
  }, []);

  const handleClick = () => {
    if (open) {
      closeCrispChat();
      setOpen(false);
    } else {
      loadCrisp().then(() => openCrispChat());
      setOpen(true);
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      aria-label={open ? "Close live chat" : "Open live chat"}
      className="fixed bottom-24 sm:bottom-6 right-4 sm:right-6 z-40 size-14 rounded-full bg-accent text-accent-foreground grid place-items-center shadow-[0_0_30px_var(--color-accent),0_10px_30px_-8px_oklch(0_0_0/0.6)] hover:shadow-[0_0_45px_var(--color-accent)] transition-shadow cursor-pointer"
    >
      {open ? <X className="size-6" strokeWidth={2.4} /> : <MessageCircle className="size-6" strokeWidth={2.4} />}
      {!open && <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping pointer-events-none" />}
    </motion.button>
  );
}


/* ---------- helpers ---------- */

function SectionHeader({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <div className="mb-4 sm:mb-5">
      {eyebrow && <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-1.5">{eyebrow}</p>}
      <h2 className="text-lg sm:text-xl font-display font-semibold">{title}</h2>
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

function OverviewCard({
  icon: Icon, label, value, hint, accent, loading, to, formatter,
}: { icon: typeof Package; label: string; value: number; hint?: string; accent?: boolean; loading?: boolean; to?: string; formatter?: (n: number) => string }) {
  const inner = (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.25, ease }}
      className={`group h-full w-full relative overflow-hidden rounded-2xl p-3.5 sm:p-5 card-premium transition-all ${
        accent ? "ring-1 ring-accent/40 shadow-[var(--shadow-glow)]" : "hover:ring-1 hover:ring-accent/25"
      }`}
    >
      {/* Ambient ember edge glow — always present, stronger on accent / hover */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-12 -right-12 size-32 rounded-full blur-3xl transition-opacity duration-500 ${
          accent ? "opacity-70" : "opacity-0 group-hover:opacity-50"
        }`}
        style={{ background: "var(--gradient-ember)" }}
      />
      {/* Subtle grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse at top right, black 0%, transparent 70%)",
        }}
      />
      <div className="relative flex items-center justify-between mb-3">
        <span className={`size-9 rounded-xl grid place-items-center transition-all ${
          accent
            ? "bg-accent/25 text-accent shadow-[0_0_18px_-4px_var(--color-accent)]"
            : "bg-white/[0.06] text-accent/90 group-hover:bg-accent/15 group-hover:text-accent group-hover:shadow-[0_0_18px_-6px_var(--color-accent)]"
        }`}>
          <Icon className="size-4" />
        </span>
        {hint && <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{hint}</span>}
      </div>
      {loading ? (
        <div className="h-7 w-12 rounded-md bg-white/5 animate-pulse" />
      ) : (
        <AnimatedNumber
          value={value}
          formatter={formatter}
          className={`relative block text-xl sm:text-3xl font-display font-semibold tabular-nums ${accent ? "text-gradient-ember" : "text-foreground"}`}
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
        className="h-full min-h-[104px] sm:min-h-[120px] flex flex-col items-center justify-center text-center gap-2 card-premium px-2.5 py-3.5 sm:py-5"
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
          <p className="text-[10.5px] text-muted-foreground truncate mt-0.5">{subtitle}</p>
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
    <div className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
      {items.map((p, i) => (
        <motion.div
          key={p.slug}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, ease, delay: Math.min(i * 0.05, 0.3) }}
          className="snap-start shrink-0 w-[46%] xs:w-[44%] sm:w-[32%] lg:w-[31%]"
        >
          <ProductCard product={p as never} />
        </motion.div>
      ))}
    </div>
  );
}

function InsightStat({ label, value, accent, small, truncate }: { label: string; value: string; accent?: boolean; small?: boolean; truncate?: boolean }) {
  return (
    <div className={`rounded-xl glass p-3.5 transition-colors hover:border-accent/30 ${accent ? "border-accent/30 bg-accent/5" : ""}`}>
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display font-semibold tabular-nums ${small ? "text-sm" : "text-lg"} ${accent ? "text-gradient-ember" : ""} ${truncate ? "truncate" : ""}`}>{value}</p>
    </div>
  );
}

function FooterAction({ icon: Icon, label, to }: { icon: typeof Package; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center justify-center gap-2 rounded-2xl glass p-4 hover:border-accent/40 hover:text-accent hover:-translate-y-0.5 transition-all"
    >
      <span className="size-9 rounded-xl bg-accent/10 text-accent grid place-items-center group-hover:bg-accent/20 transition-colors">
        <Icon className="size-4" />
      </span>
      <span className="text-[11px] uppercase tracking-widest">{label}</span>
    </Link>
  );
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
    { icon: Globe, text: "Free Worldwide Shipping" },
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

function WhyShopWithUs() {
  const items = [
    { icon: Lock, title: "Secure Payments", desc: "256-bit SSL encryption" },
    { icon: Globe, title: "Worldwide Shipping", desc: "Delivered to 100+ countries" },
    { icon: BadgeCheck, title: "Trusted Quality", desc: "Authentic & verified" },
    { icon: Truck, title: "Fast Delivery", desc: "Express options available" },
    { icon: Headphones, title: "24/7 Support", desc: "We're always here" },
  ];
  return (
    <motion.section {...fadeUp}>
      <SectionHeader title="Why shop with us" eyebrow="The FoundOurMarket promise" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {items.map((it, idx) => {
          const Icon = it.icon;
          return (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease, delay: idx * 0.05 }}
              whileHover={{ y: -3 }}
              className="card-premium p-3.5 sm:p-4 flex flex-col items-center text-center gap-2 hover:ring-1 hover:ring-accent/30 transition-all"
            >
              <span className="size-10 rounded-xl bg-accent/10 text-accent grid place-items-center shadow-[0_0_18px_-6px_var(--color-accent)]">
                <Icon className="size-[18px]" />
              </span>
              <p className="text-[12px] sm:text-[13px] font-medium leading-tight">{it.title}</p>
              <p className="text-[10px] text-muted-foreground leading-snug">{it.desc}</p>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}

function ProfileCompletion({ user }: { user: { email?: string | null; user_metadata?: Record<string, unknown> } }) {
  const meta = user.user_metadata ?? {};
  const checks = [
    !!user.email,
    !!meta.full_name,
    !!meta.avatar_url,
    !!meta.phone,
  ];
  const done = checks.filter(Boolean).length;
  const pct = Math.round((done / checks.length) * 100);
  if (pct === 100) return null;
  return (
    <div className="mt-2 hidden sm:block">
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
    { key: "ordered", label: "Ordered", icon: CheckCircle2, match: ["pending", "processing", "shipped", "in_transit", "out_for_delivery", "delivered"] },
    { key: "packed", label: "Packed", icon: Box, match: ["processing", "shipped", "in_transit", "out_for_delivery", "delivered"] },
    { key: "shipped", label: "Shipped", icon: Truck, match: ["shipped", "in_transit", "out_for_delivery", "delivered"] },
    { key: "out", label: "Out for Delivery", icon: MapPin, match: ["out_for_delivery", "delivered"] },
    { key: "delivered", label: "Delivered", icon: Home, match: ["delivered"] },
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




function FloatingHeaderBar({ firstName, avatarUrl, unread, cartCount }: { firstName: string; avatarUrl: string; unread: number; cartCount: number }) {
  const { scrollY } = useScroll();
  const [show, setShow] = useState(false);
  useEffect(() => {
    return scrollY.on("change", (v) => setShow(v > 220));
  }, [scrollY]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.28, ease }}
          className="fixed top-2 left-2 right-2 sm:left-4 sm:right-4 z-40"
        >
          <div className="mx-auto max-w-7xl glass-strong rounded-2xl px-3 py-2 flex items-center gap-2 ring-1 ring-white/10 shadow-[0_10px_30px_-12px_oklch(0_0_0/0.6)]">
            <div className="size-9 rounded-xl border border-white/10 bg-secondary overflow-hidden grid place-items-center ring-1 ring-accent/30 shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-display font-semibold text-accent">{firstName.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-accent leading-none">Welcome</p>
              <p className="text-xs font-medium truncate leading-tight mt-0.5">{firstName}</p>
            </div>
            <Link to="/search" aria-label="Search" className="size-9 grid place-items-center rounded-xl glass hover:text-accent transition-all">
              <Search className="size-4" />
            </Link>
            <Link to="/account/notifications" aria-label="Notifications" className="relative size-9 grid place-items-center rounded-xl glass hover:text-accent transition-all">
              <Bell className="size-4" />
              {unread > 0 && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent animate-pulse" />}
            </Link>
            <Link to="/cart" aria-label="Cart" className="relative size-9 grid place-items-center rounded-xl glass hover:text-accent transition-all">
              <ShoppingBag className="size-4" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold grid place-items-center">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const SEARCH_HINTS = [
  "Search headphones, sneakers, gadgets…",
  "Try “wireless earbuds”…",
  "Discover trending sneakers…",
  "Find premium watches…",
  "Search smart home gear…",
];

function SmartSearchBar() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((p) => (p + 1) % SEARCH_HINTS.length), 3200);
    return () => clearInterval(t);
  }, []);
  return (
    <Link
      to="/search"
      className="group relative flex items-center gap-2.5 glass-strong rounded-2xl px-4 py-3 sm:py-3.5 ring-1 ring-transparent hover:ring-accent/40 focus-visible:ring-accent/60 transition-all hover:shadow-[0_0_28px_-10px_var(--color-accent)]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "var(--gradient-ember-soft)", filter: "blur(14px)" }} />
      <Search className="relative size-4 text-accent shrink-0" />
      <div className="relative flex-1 min-w-0 h-5 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.span
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease }}
            className="absolute inset-0 text-sm text-muted-foreground truncate"
          >
            {SEARCH_HINTS[idx]}
          </motion.span>
        </AnimatePresence>
      </div>
      <button
        type="button"
        onClick={(e) => e.preventDefault()}
        aria-label="Camera search"
        className="relative size-8 grid place-items-center rounded-full bg-white/5 text-foreground/80 hover:bg-accent/15 hover:text-accent transition-colors shrink-0"
      >
        <Camera className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => e.preventDefault()}
        aria-label="Voice search"
        className="relative size-8 grid place-items-center rounded-full bg-accent/15 text-accent hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
      >
        <Mic className="size-3.5" />
      </button>
      <span className="relative hidden sm:inline text-[10px] font-mono uppercase tracking-widest text-muted-foreground px-2 py-1 rounded-md bg-white/5">
        ⌘ K
      </span>
    </Link>
  );
}
