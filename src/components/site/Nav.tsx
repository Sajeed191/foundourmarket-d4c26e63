import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShoppingBag, Search, User, Heart, Menu, X, LayoutDashboard } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { SearchCommand } from "@/components/site/SearchCommand";
import { NotificationBell } from "@/components/site/NotificationBell";
import { CurrencySwitcher } from "@/components/site/CurrencySwitcher";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_ROLES = ["admin","super_admin","manager","support","fulfillment","warehouse_staff","editor"];

export function Nav() {
  const { count } = useCart();
  const { user } = useAuth();
  const { slugs: wishSlugs } = useWishlist();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .then(({ data }) => setIsAdmin((data ?? []).some((r) => ADMIN_ROLES.includes(r.role as string))));
  }, [user]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navLinks = [
    { to: "/", label: "Shop" },
    { to: "/category/$slug", params: { slug: "electronics" }, label: "Electronics" },
    { to: "/category/$slug", params: { slug: "fashion" }, label: "Fashion" },
    { to: "/category/$slug", params: { slug: "home" }, label: "Home" },
  ] as const;

  return (
    <>
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 gap-2">
          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="md:hidden size-9 rounded-full grid place-items-center hover:bg-white/5 transition-colors -ml-1"
          >
            <Menu className="size-5" />
          </button>

          <Link to="/" className="text-base sm:text-xl font-display tracking-tighter uppercase font-semibold whitespace-nowrap">
            FoundOurMarket<span className="text-accent">™</span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {navLinks.map((l) => (
              <Link key={l.label} to={l.to} params={"params" in l ? l.params : undefined as never} className="hover:text-foreground transition-colors">
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            <button onClick={() => setSearchOpen(true)} aria-label="Search" className="size-9 rounded-full grid place-items-center hover:bg-white/5 transition-colors">
              <Search className="size-4" />
            </button>
            <div className="hidden sm:block"><CurrencySwitcher /></div>
            <Link to="/wishlist" aria-label="Wishlist" className="relative hidden xs:grid sm:grid size-9 rounded-full place-items-center hover:bg-white/5 transition-colors">
              <Heart className="size-4" />
              {wishSlugs.size > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-bold font-mono grid place-items-center">{wishSlugs.size}</span>
              )}
            </Link>
            {isAdmin && (
              <Link to="/admin" aria-label="Admin" className="hidden sm:grid size-9 rounded-full place-items-center hover:bg-white/5 transition-colors text-accent" title="Admin">
                <LayoutDashboard className="size-4" />
              </Link>
            )}
            {user && <NotificationBell />}
            <Link to={user ? "/account" : "/auth"} aria-label="Account" className="size-9 rounded-full grid place-items-center hover:bg-white/5 transition-colors">
              <User className="size-4" />
            </Link>
            <Link to="/cart" aria-label="Cart" className="relative flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border border-border hover:border-accent/40 transition-colors">
              <ShoppingBag className="size-4" />
              <span className="text-xs font-mono">{count}</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[82%] max-w-xs bg-background border-r border-border flex flex-col animate-slide-in-right" style={{ animationName: "slide-in-left" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <Link to="/" onClick={() => setOpen(false)} className="text-base font-display tracking-tighter uppercase font-semibold">
                FoundOurMarket<span className="text-accent">™</span>
              </Link>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="size-9 rounded-full grid place-items-center hover:bg-white/5">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              <p className="px-5 mb-3 text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Browse</p>
              <ul className="flex flex-col">
                {navLinks.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      params={"params" in l ? l.params : undefined as never}
                      onClick={() => setOpen(false)}
                      className="block px-5 py-3 text-sm uppercase tracking-widest font-medium hover:bg-white/5 transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="px-5 mt-6 mb-3 text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Account</p>
              <ul className="flex flex-col">
                <li><Link to={user ? "/account" : "/auth"} onClick={() => setOpen(false)} className="block px-5 py-3 text-sm uppercase tracking-widest font-medium hover:bg-white/5">{user ? "My Account" : "Sign In"}</Link></li>
                <li><Link to="/wishlist" onClick={() => setOpen(false)} className="block px-5 py-3 text-sm uppercase tracking-widest font-medium hover:bg-white/5">Wishlist · {wishSlugs.size}</Link></li>
                <li><Link to="/cart" onClick={() => setOpen(false)} className="block px-5 py-3 text-sm uppercase tracking-widest font-medium hover:bg-white/5">Cart · {count}</Link></li>
                {isAdmin && <li><Link to="/admin" onClick={() => setOpen(false)} className="block px-5 py-3 text-sm uppercase tracking-widest font-medium text-accent hover:bg-white/5">Admin Panel</Link></li>}
              </ul>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-center">
              <CurrencySwitcher />
            </div>
          </div>
        </div>
      )}
      <SearchCommand open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
