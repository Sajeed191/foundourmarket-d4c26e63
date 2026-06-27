import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Sparkles, ChevronRight } from "lucide-react";
import { NAV, useAdminRoles, type NavItem } from "@/components/admin/AdminShell";

/**
 * Mobile-only hamburger + slide-in drawer exposing the full admin navigation.
 * Used on standalone admin pages (like the dashboard) that don't render AdminShell,
 * so every admin feature stays reachable on phones.
 */
export function AdminNavDrawer() {
  const { roles } = useAdminRoles();
  const location = useRouterState({ select: (s) => s.location });
  const path = location.pathname;
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [path]);

  function visibleItem(it: NavItem) {
    if (!it.roles) return true;
    return (roles ?? []).some((r) => it.roles!.includes(r));
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 size-10 grid place-items-center rounded-xl bg-background/70 backdrop-blur-xl border border-white/[0.08] hover:bg-white/[0.06] hover:border-accent/25 transition-all duration-300 shadow-[0_4px_16px_-8px_oklch(0_0_0_/_0.7)] active:scale-95"
        aria-label="Open admin menu"
      >
        <Menu className="size-[18px]" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            aria-label="Close menu"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: "-110%" }} animate={{ x: 0 }} exit={{ x: "-110%" }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="lg:hidden fixed top-0 bottom-0 left-0 z-50 w-[17.5rem] p-3"
          >
            <div className="relative h-full flex flex-col rounded-[1.75rem] overflow-hidden glass-strong glass-reflect" style={{ boxShadow: "var(--shadow-float), 0 0 50px -22px oklch(0.74 0.19 49 / 0.3), inset 0 1px 0 oklch(1 0 0 / 0.06)" }}>
              <div className="relative px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
                <Link to="/" className="group inline-flex items-center gap-2.5">
                  <span className="relative size-7 rounded-lg bg-gradient-to-br from-accent to-primary grid place-items-center">
                    <Sparkles className="size-3.5 text-accent-foreground" />
                    <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/15" />
                  </span>
                  <span className="font-display text-sm tracking-tight">FoundOurMarket™</span>
                </Link>
                <button onClick={() => setOpen(false)} className="size-7 grid place-items-center rounded-full hover:bg-white/5 transition-colors" aria-label="Close menu">
                  <X className="size-3.5" />
                </button>
              </div>

              <nav className="relative px-2.5 py-2 space-y-4 flex-1 overflow-y-auto">
                {NAV.map((g) => {
                  const items = g.items.filter(visibleItem);
                  if (!items.length) return null;
                  return (
                    <div key={g.group}>
                      <div className="flex items-center gap-2 px-2.5 mb-1.5">
                        <p className="text-[9px] font-mono uppercase tracking-[0.32em] text-muted-foreground/70">{g.group}</p>
                        <span className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                      </div>
                      <ul className="space-y-0.5">
                        {items.map((it) => (
                          <li key={`${it.to}:${it.search?.tab ?? ""}`}>
                            <Link
                              to={it.to as string}
                              search={(it.search ?? undefined) as never}
                              className="group relative flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-white/[0.035] transition-all duration-300"
                            >
                              <it.icon className="relative size-4 shrink-0" />
                              <span className="relative truncate flex-1">{it.label}</span>
                              <ChevronRight className="relative size-3.5 shrink-0 opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-300" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </nav>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
