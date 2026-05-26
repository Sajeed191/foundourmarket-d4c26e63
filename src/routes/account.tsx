import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  LogOut, Package, Loader2, RotateCcw, MapPin, Bell, Heart, Clock, Sparkles,
  ShoppingBag, Wallet, ChevronRight, Shield, Settings, Award, Eye, Plus, User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { useWishlist } from "@/lib/wishlist";
import { useNotifications } from "@/lib/notifications";
import { useAddresses } from "@/lib/use-addresses";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useProducts } from "@/lib/use-products";
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

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
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
  const { addresses, defaultShipping } = useAddresses();
  const { slugs: recentSlugs } = useRecentlyViewed();
  const { products } = useProducts();

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

  const stats = useMemo(() => {
    const list = orders ?? [];
    const spent = list.reduce((s, o) => s + Number(o.total || 0), 0);
    const active = list.filter((o) => !["delivered", "cancelled", "refunded"].includes(String(o.status).toLowerCase())).length;
    return { count: list.length, spent, active };
  }, [orders]);

  const wishlistProducts = useMemo(
    () => products.filter((p) => wishSlugs.has(p.slug)).slice(0, 4),
    [products, wishSlugs],
  );
  const recentProducts = useMemo(
    () => recentSlugs.map((s) => products.find((p) => p.slug === s)).filter(Boolean).slice(0, 4) as typeof products,
    [products, recentSlugs],
  );
  const recommended = useMemo(
    () => products
      .filter((p) => !wishSlugs.has(p.slug) && !recentSlugs.includes(p.slug))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 4),
    [products, wishSlugs, recentSlugs],
  );

  const profileFields = useMemo(() => {
    const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "";
    const phone = (user?.user_metadata?.phone as string | undefined) ?? "";
    return [
      { label: "Name", done: !!fullName },
      { label: "Email", done: !!user?.email },
      { label: "Phone", done: !!phone },
      { label: "Default address", done: !!defaultShipping },
      { label: "Wishlist", done: wishSlugs.size > 0 },
    ];
  }, [user, defaultShipping, wishSlugs]);
  const completion = Math.round((profileFields.filter((f) => f.done).length / profileFields.length) * 100);

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
      {/* Greeting */}
      <motion.header {...fadeUp} className="mb-8 sm:mb-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 sm:mb-3">Your dashboard</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold leading-tight">
              {greeting()}, <span className="text-accent">{firstName}</span>.
            </h1>
            <p className="text-sm text-muted-foreground mt-2">{user.email}</p>
          </div>
          <button
            onClick={signOut}
            className="self-start sm:self-auto inline-flex items-center gap-2 text-xs uppercase tracking-widest border border-border rounded-full px-5 py-2.5 hover:border-accent/40 hover:text-accent transition-colors"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </motion.header>

      {/* Stats */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.05 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8 sm:mb-10">
        <StatCard icon={ShoppingBag} label="Orders" value={orders ? String(stats.count) : "—"} hint="lifetime" />
        <StatCard icon={Wallet} label="Spent" value={orders ? format(stats.spent) : "—"} hint="total" />
        <StatCard icon={Package} label="In transit" value={orders ? String(stats.active) : "—"} hint="active" accent />
        <StatCard icon={Heart} label="Wishlist" value={String(wishSlugs.size)} hint="saved" />
      </motion.section>

      {/* Quick actions */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="mb-10">
        <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">Quick actions</h2>
        <div className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          <QuickAction to="/account/profile" icon={UserIcon} label="Edit profile" />
          <QuickAction to="/account/addresses" icon={MapPin} label="Addresses" />
          <QuickAction to="/account/returns" icon={RotateCcw} label="Returns" />
          <QuickAction to="/account/notifications" icon={Bell} label="Inbox" badge={unread} />
          <QuickAction to="/wishlist" icon={Heart} label="Wishlist" badge={wishSlugs.size} />
          <QuickAction to="/track" icon={Package} label="Track order" />
          <QuickAction to="/" icon={Sparkles} label="Continue shopping" />
        </div>
      </motion.section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6 lg:space-y-8">
          {/* Recent orders */}
          <Section
            title="Recent orders"
            icon={Package}
            action={<Link to="/account" hash="orders" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">View all</Link>}
          >
            {orders === null ? (
              <SkeletonRows />
            ) : orders.length === 0 ? (
              <EmptyState
                title="No orders yet"
                body="Your premium finds will appear here."
                cta={<Link to="/" className="inline-block bg-accent text-accent-foreground rounded-full px-6 py-3 text-xs uppercase tracking-widest font-bold">Start shopping</Link>}
              />
            ) : (
              <div className="space-y-3" id="orders">
                {orders.slice(0, 5).map((o) => (
                  <Link
                    key={o.id}
                    to="/orders/$id"
                    params={{ id: o.id }}
                    className="group bg-card border border-border rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 hover:border-accent/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className="hidden sm:flex -space-x-2 shrink-0">
                        {o.order_items.slice(0, 3).map((it, i) => (
                          <div key={i} className="size-10 rounded-xl border border-border bg-black/40 overflow-hidden">
                            {it.image && <img src={it.image} alt="" className="w-full h-full object-cover" loading="lazy" />}
                          </div>
                        ))}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          #{o.id.slice(0, 8)} · {new Date(o.created_at).toLocaleDateString()}
                        </p>
                        <p className="font-medium mt-1 truncate">
                          {o.order_items.length} item{o.order_items.length === 1 ? "" : "s"}{" "}
                          · <span className="text-accent capitalize">{o.status}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {o.order_items.map((i) => i.name).join(", ")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-sm text-accent">{format(Number(o.total))}</span>
                      <ChevronRight className="size-4 text-muted-foreground group-hover:text-accent transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {/* Wishlist preview */}
          <Section
            title="Saved for later"
            icon={Heart}
            action={<Link to="/wishlist" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">View wishlist</Link>}
          >
            {wishlistProducts.length === 0 ? (
              <EmptyState
                title="Nothing saved yet"
                body="Tap the heart on any product to save it for later."
              />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {wishlistProducts.map((p) => <ProductCard key={p.slug} product={p} />)}
              </div>
            )}
          </Section>

          {/* Recently viewed */}
          {recentProducts.length > 0 && (
            <Section
              title="Recently viewed"
              icon={Eye}
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {recentProducts.map((p) => <ProductCard key={p.slug} product={p} />)}
              </div>
            </Section>
          )}

          {/* Recommendations */}
          {recommended.length > 0 && (
            <Section
              title="Picked for you"
              icon={Sparkles}
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {recommended.map((p) => <ProductCard key={p.slug} product={p} />)}
              </div>
            </Section>
          )}
        </div>

        {/* Side column */}
        <aside className="space-y-6 lg:space-y-8">
          {/* Profile completion */}
          <motion.div {...fadeUp} className="bg-card border border-border rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="size-9 rounded-full grid place-items-center bg-accent/10 text-accent">
                  <UserIcon className="size-4" />
                </div>
                <h3 className="text-sm font-medium">Profile</h3>
              </div>
              <span className="font-mono text-sm text-accent">{completion}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-4">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${completion}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="h-full bg-gradient-to-r from-accent to-primary"
              />
            </div>
            <ul className="space-y-2 mb-4">
              {profileFields.map((f) => (
                <li key={f.label} className="flex items-center justify-between text-xs">
                  <span className={f.done ? "text-foreground" : "text-muted-foreground"}>{f.label}</span>
                  <span className={`size-4 rounded-full grid place-items-center text-[10px] ${f.done ? "bg-accent/20 text-accent" : "bg-white/5 text-muted-foreground"}`}>
                    {f.done ? "✓" : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              to="/account/profile"
              className="w-full inline-flex items-center justify-center gap-2 border border-border rounded-full px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest hover:border-accent/40 hover:text-accent transition-colors"
            >
              Edit profile <ChevronRight className="size-3" />
            </Link>
          </motion.div>

          {/* Addresses preview */}
          <Section title="Default address" icon={MapPin} action={<Link to="/account/addresses" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">Manage</Link>}>
            {defaultShipping ? (
              <div className="bg-card border border-border rounded-2xl p-5 text-sm">
                <p className="font-medium">{defaultShipping.full_name}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                  {defaultShipping.line1}{defaultShipping.line2 ? `, ${defaultShipping.line2}` : ""}<br />
                  {defaultShipping.city}{defaultShipping.state ? `, ${defaultShipping.state}` : ""} {defaultShipping.postal}<br />
                  {defaultShipping.country}
                </p>
                {addresses.length > 1 && (
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-3">
                    +{addresses.length - 1} more saved
                  </p>
                )}
              </div>
            ) : (
              <Link to="/account/addresses" className="block bg-card border border-dashed border-border rounded-2xl p-6 text-center hover:border-accent/40 transition-colors">
                <Plus className="size-5 mx-auto mb-2 text-accent" />
                <p className="text-sm">Add your first address</p>
                <p className="text-xs text-muted-foreground mt-1">Faster checkout next time</p>
              </Link>
            )}
          </Section>

          {/* Notifications preview */}
          <Section title="Inbox" icon={Bell} action={<Link to="/account/notifications" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">All</Link>}>
            {notifs.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-6 text-center">
                <p className="text-sm text-muted-foreground">All caught up.</p>
              </div>
            ) : (
              <ul className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {notifs.slice(0, 3).map((n) => (
                  <li key={n.id} className={`p-4 ${!n.read_at ? "bg-accent/5" : ""}`}>
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{n.body}</p>}
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Loyalty placeholder */}
          <motion.div {...fadeUp} className="relative overflow-hidden bg-card border border-border rounded-2xl p-5 sm:p-6">
            <div className="absolute -top-12 -right-12 size-40 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <Award className="size-4 text-accent" />
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Founders Club</p>
              </div>
              <h3 className="text-lg font-display font-semibold">Earn rewards on every order.</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Loyalty perks, early access drops, and member-only pricing are coming soon.
              </p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-mono text-2xl text-accent">{Math.round(stats.spent)}</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">pts (preview)</span>
              </div>
            </div>
          </motion.div>

          {/* Security & Preferences shortcuts */}
          <div className="grid grid-cols-2 gap-3">
            <Link to="/auth" className="bg-card border border-border rounded-2xl p-4 hover:border-accent/40 transition-colors group">
              <Shield className="size-4 text-accent mb-2" />
              <p className="text-sm font-medium">Security</p>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1 group-hover:text-accent">Password & sessions</p>
            </Link>
            <Link to="/account/notifications" className="bg-card border border-border rounded-2xl p-4 hover:border-accent/40 transition-colors group">
              <Settings className="size-4 text-accent mb-2" />
              <p className="text-sm font-medium">Preferences</p>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1 group-hover:text-accent">Email & alerts</p>
            </Link>
          </div>

          {/* Recently activity */}
          <Section title="Activity" icon={Clock}>
            <ol className="bg-card border border-border rounded-2xl p-5 space-y-3 text-xs">
              {(orders ?? []).slice(0, 3).map((o) => (
                <li key={o.id} className="flex items-start gap-3">
                  <span className="size-1.5 rounded-full bg-accent mt-1.5" />
                  <div className="min-w-0">
                    <p className="text-foreground">Order <span className="font-mono">#{o.id.slice(0, 6)}</span> {o.status}</p>
                    <p className="text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                  </div>
                </li>
              ))}
              {wishSlugs.size > 0 && (
                <li className="flex items-start gap-3">
                  <span className="size-1.5 rounded-full bg-accent/50 mt-1.5" />
                  <div className="min-w-0">
                    <p className="text-foreground">{wishSlugs.size} item{wishSlugs.size === 1 ? "" : "s"} on your wishlist</p>
                    <p className="text-muted-foreground">Last updated recently</p>
                  </div>
                </li>
              )}
              {(orders ?? []).length === 0 && wishSlugs.size === 0 && (
                <li className="text-muted-foreground">No activity yet — explore the shop to get started.</li>
              )}
            </ol>
          </Section>
        </aside>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function StatCard({ icon: Icon, label, value, hint, accent }: { icon: typeof Package; label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${accent ? "border-accent/30 bg-accent/5" : "border-border bg-card"}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${accent ? "text-accent" : "text-muted-foreground"}`} />
      </div>
      <p className={`mt-3 text-2xl sm:text-3xl font-display font-semibold ${accent ? "text-accent" : ""}`}>{value}</p>
      {hint && <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{hint}</p>}
    </motion.div>
  );
}

function QuickAction({ to, icon: Icon, label, badge }: { to: string; icon: typeof Package; label: string; badge?: number }) {
  return (
    <Link
      to={to}
      className="shrink-0 inline-flex items-center gap-2 bg-card border border-border rounded-full pl-3 pr-4 py-2.5 text-xs uppercase tracking-widest hover:border-accent/40 hover:text-accent transition-colors"
    >
      <span className="relative size-7 grid place-items-center rounded-full bg-accent/10 text-accent">
        <Icon className="size-3.5" />
        {typeof badge === "number" && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold grid place-items-center">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      {label}
    </Link>
  );
}

function Section({ title, icon: Icon, action, children }: { title: string; icon: typeof Package; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.section {...fadeUp}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm sm:text-base font-medium flex items-center gap-2">
          <Icon className="size-4 text-accent" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

function EmptyState({ title, body, cta }: { title: string; body: string; cta?: React.ReactNode }) {
  return (
    <div className="bg-card border border-dashed border-border rounded-2xl p-8 sm:p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">{body}</p>
      {cta}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-card border border-border rounded-2xl p-5 h-20 animate-pulse" />
      ))}
    </div>
  );
}
