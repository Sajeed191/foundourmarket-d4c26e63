import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  LogOut, Package, Loader2, RotateCcw, MapPin, Bell, Heart, Clock, Sparkles,
  ShoppingBag, Wallet, ChevronRight, Shield, Settings, Award, Eye, User as UserIcon,
  HelpCircle, LifeBuoy, MessageCircle, TrendingUp, Gift, ArrowRight, Star,
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
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const { format } = useRegion();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const { slugs: wishSlugs } = useWishlist();
  const { unread, items: notifs } = useNotifications();
  const { slugs: recentSlugs } = useRecentlyViewed();
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
    return { count: list.length, spent, active, saved, memberSince, topCategory };
  }, [orders, user]);

  const cartCount = cart.items.reduce((s, i) => s + i.qty, 0);

  const wishlistProducts = useMemo(
    () => products.filter((p) => wishSlugs.has(p.slug)).slice(0, 8),
    [products, wishSlugs],
  );
  const recentProducts = useMemo(
    () => recentSlugs.map((s) => products.find((p) => p.slug === s)).filter(Boolean).slice(0, 8) as typeof products,
    [products, recentSlugs],
  );
  const recommended = useMemo(
    () => products
      .filter((p) => !wishSlugs.has(p.slug) && !recentSlugs.includes(p.slug))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 8),
    [products, wishSlugs, recentSlugs],
  );
  const trending = useMemo(
    () => [...products].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 6),
    [products],
  );

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 sm:pb-16">
      <div className="container-page py-5 sm:py-10 lg:py-14 space-y-6 sm:space-y-10">
        {/* 1 — HEADER */}
        <motion.header {...fadeUp} className="relative overflow-hidden rounded-3xl glass-strong">
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
          <div className="relative p-5 sm:p-7 lg:p-9 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative">
                <div className="size-14 sm:size-16 rounded-2xl border border-white/10 bg-secondary overflow-hidden grid place-items-center shrink-0 shadow-[var(--shadow-float)]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-display font-semibold text-accent">
                      {firstName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="absolute -bottom-1 -right-1 size-4 rounded-full bg-emerald-500 border-2 border-card shadow-[0_0_10px_oklch(0.7_0.18_150)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-1.5 flex items-center gap-1.5">
                  <span className="size-1 rounded-full bg-accent animate-glow" /> {greeting()}
                </p>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-display font-semibold truncate tracking-tight">
                  Welcome back, <span className="text-gradient-ember">{firstName}</span>
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground truncate mt-1">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 self-start sm:self-auto">
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


        {/* 2 — OVERVIEW CARDS */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.05 }}>
          <SectionHeader title="Overview" eyebrow="Your account at a glance" />
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 lg:grid-cols-6 sm:overflow-visible">
            <OverviewCard icon={Package} label="Active orders" value={stats.active} loading={!orders} accent />
            <OverviewCard icon={Heart} label="Wishlist" value={wishSlugs.size} to="/wishlist" />
            <OverviewCard icon={ShoppingBag} label="Cart items" value={cartCount} to="/cart" />
            <OverviewCard icon={Wallet} label="Total saved" value={stats.saved} formatter={format} loading={!orders} />
            <OverviewCard icon={Eye} label="Recently viewed" value={recentSlugs.length} />
            <OverviewCard icon={Gift} label="Reward points" value={Math.round(stats.spent)} hint="preview" />
          </div>
        </motion.section>

        {/* 3 — QUICK ACTIONS */}
        <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
          <SectionHeader title="Quick actions" eyebrow="Jump to" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5">
            <ActionCard to="/account/profile" icon={UserIcon} title="Edit profile" subtitle="Name, photo, phone" />
            <ActionCard to="/account/addresses" icon={MapPin} title="Addresses" subtitle="Shipping & billing" />
            <ActionCard to="/account" icon={Package} title="Orders" subtitle="Track & invoices" />
            <ActionCard to="/account/returns" icon={RotateCcw} title="Returns" subtitle="Refunds & RMA" />
            <ActionCard to="/account/notifications" icon={Bell} title="Notifications" subtitle="Inbox & alerts" badge={unread} />
            <ActionCard to="/auth" icon={Shield} title="Security" subtitle="Password & sessions" />
            <ActionCard to="/account/notifications" icon={Settings} title="Preferences" subtitle="Email & locale" />
            <ActionCard to="/" icon={HelpCircle} title="Help center" subtitle="Guides & FAQ" />
          </div>
        </motion.section>

        {/* DESKTOP GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2 space-y-6 lg:space-y-8">
            {/* 4 — RECENT ORDERS */}
            <SectionBlock
              title="Recent orders"
              icon={Package}
              action={<Link to="/account" hash="orders" className="action-link">View all <ArrowRight className="size-3" /></Link>}
            >
              {orders === null ? (
                <SkeletonRows />
              ) : orders.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No orders yet"
                  body="Discover curated premium products."
                  cta={<Link to="/" className="cta-primary">Start shopping <ArrowRight className="size-3.5" /></Link>}
                  extra={
                    trending.length > 0 ? (
                      <div className="mt-5 w-full">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2.5 text-left">Trending now</p>
                        <MiniProductRow items={trending.slice(0, 6)} format={format} />
                      </div>
                    ) : null
                  }
                />
              ) : (
                <div className="space-y-2.5" id="orders">
                  {orders.slice(0, 4).map((o) => <OrderRow key={o.id} o={o} format={format} />)}
                </div>
              )}
            </SectionBlock>

            {/* 5 — WISHLIST */}
            <SectionBlock
              title="Saved for later"
              icon={Heart}
              action={<Link to="/wishlist" className="action-link">View wishlist <ArrowRight className="size-3" /></Link>}
            >
              {wishlistProducts.length === 0 ? (
                <EmptyState
                  icon={Heart}
                  title="Nothing saved yet"
                  body="Tap the heart on any product to save it."
                  extra={
                    recommended.length > 0 ? (
                      <div className="mt-5 w-full">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2.5 text-left">You might love</p>
                        <MiniProductRow items={recommended.slice(0, 6)} format={format} />
                      </div>
                    ) : null
                  }
                />
              ) : (
                <ProductScroller items={wishlistProducts} />
              )}
            </SectionBlock>

            {/* 6 — RECENTLY VIEWED */}
            {recentProducts.length > 0 && (
              <SectionBlock title="Recently viewed" icon={Eye} action={<Link to="/" className="action-link">Continue browsing <ArrowRight className="size-3" /></Link>}>
                <ProductScroller items={recentProducts} />
              </SectionBlock>
            )}

            {/* 7 — RECOMMENDATIONS */}
            {recommended.length > 0 && (
              <SectionBlock title="Picked for you" icon={Sparkles}>
                <ProductScroller items={recommended} />
              </SectionBlock>
            )}
          </div>

          {/* SIDEBAR */}
          <aside className="space-y-6 lg:space-y-8">
            {/* 8 — NOTIFICATION CENTER */}
            <SectionBlock
              title="Notifications"
              icon={Bell}
              action={<Link to="/account/notifications" className="action-link">All <ArrowRight className="size-3" /></Link>}
            >
              {notifs.length === 0 ? (
                <div className="card-premium rounded-2xl p-6 text-center">
                  <Bell className="size-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm">All caught up</p>
                  <p className="text-xs text-muted-foreground mt-1">You'll see order, shipment & promo alerts here.</p>
                </div>
              ) : (
                <ul className="card-premium rounded-2xl overflow-hidden divide-y divide-border">
                  {notifs.slice(0, 4).map((n) => (
                    <li key={n.id} className={`p-4 flex gap-3 ${!n.read_at ? "bg-accent/5" : ""}`}>
                      <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${!n.read_at ? "bg-accent animate-pulse" : "bg-muted-foreground/30"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>}
                        <p className="text-[10px] font-mono text-muted-foreground mt-1.5">{new Date(n.created_at).toLocaleDateString()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionBlock>

            {/* 9 — ACCOUNT INSIGHTS */}
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

            {/* Founders Club */}
            <motion.div {...fadeUp} className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-card to-card p-5 sm:p-6">
              <div className="absolute -top-16 -right-12 size-44 rounded-full bg-accent/25 blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="size-4 text-accent" />
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Founders Club</p>
                </div>
                <h3 className="text-base sm:text-lg font-display font-semibold leading-snug">Earn rewards on every order.</h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  Loyalty perks, early drops & member-only pricing — coming soon.
                </p>
                <div className="mt-4 flex items-baseline gap-2">
                  <AnimatedNumber value={Math.round(stats.spent)} className="font-mono text-2xl text-accent" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">pts preview</span>
                </div>
              </div>
            </motion.div>
          </aside>
        </div>

        {/* 10 — FOOTER ACTIONS */}
        <motion.footer {...fadeUp} className="pt-2">
          <div className="rounded-3xl border border-border bg-card p-5 sm:p-7">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FooterAction icon={LifeBuoy} label="Support" to="/" />
              <FooterAction icon={HelpCircle} label="FAQ" to="/" />
              <FooterAction icon={MessageCircle} label="Contact" to="/" />
              <button
                onClick={signOut}
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-background/40 p-4 hover:border-destructive/40 hover:text-destructive transition-colors"
              >
                <LogOut className="size-4" />
                <span className="text-xs uppercase tracking-widest">Sign out</span>
              </button>
            </div>
          </div>
        </motion.footer>
      </div>
    </div>
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
      className={`snap-start shrink-0 w-[44%] sm:w-auto h-full relative overflow-hidden rounded-2xl p-4 sm:p-5 transition-all ${
        accent
          ? "border border-accent/40 bg-gradient-to-br from-accent/15 via-card to-card shadow-[var(--shadow-glow)]"
          : "card-premium"
      }`}
    >
      {accent && (
        <div aria-hidden className="absolute -top-10 -right-10 size-32 rounded-full opacity-50" style={{ background: "var(--gradient-ember)", filter: "blur(40px)" }} />
      )}
      <div className="relative flex items-center justify-between mb-3">
        <span className={`size-9 rounded-xl grid place-items-center ${accent ? "bg-accent/25 text-accent" : "bg-white/5 text-muted-foreground"}`}>
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
          className={`relative block text-2xl sm:text-3xl font-display font-semibold tabular-nums ${accent ? "text-gradient-ember" : ""}`}
        />
      )}
      <p className="relative text-[10px] sm:text-xs font-mono uppercase tracking-widest text-muted-foreground mt-1.5">{label}</p>
    </motion.div>
  );
  return to ? <Link to={to} className="contents">{inner}</Link> : inner;
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
        className="h-full min-h-[110px] sm:min-h-[120px] flex flex-col items-center justify-center text-center gap-2.5 card-premium px-3 py-4 sm:py-5"
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
      {items.map((p) => (
        <div key={p.slug} className="snap-start shrink-0 w-[60%] xs:w-[48%] sm:w-[32%] lg:w-[31%]">
          <ProductCard product={p as never} />
        </div>
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
    <div className="card-premium rounded-2xl border-dashed p-5 sm:p-6 flex flex-col items-center text-center">
      <div className="size-10 rounded-xl bg-accent/10 text-accent grid place-items-center mb-3">
        <Icon className="size-[18px]" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{body}</p>
      {cta && <div className="mt-4">{cta}</div>}
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
