import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  LayoutDashboard,
  PackagePlus,
  ImagePlus,
  FolderTree,
  ShoppingBag,
  BarChart3,
  Megaphone,
  Boxes,
  ChevronUp,
  X,
  Pencil,
} from "lucide-react";
import { useIsAdmin } from "@/lib/use-admin";
import { useAdminMode } from "@/lib/admin-mode";
import { cn } from "@/lib/utils";

type Action = {
  label: string;
  icon: typeof LayoutDashboard;
  to: string;
};

const ACTIONS: Action[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/admin" },
  { label: "Products", icon: ShoppingBag, to: "/admin-products" },
  { label: "Add product", icon: PackagePlus, to: "/admin-products" },
  { label: "Banners", icon: ImagePlus, to: "/admin-cms" },
  { label: "Categories", icon: FolderTree, to: "/admin-inventory" },
  { label: "Inventory", icon: Boxes, to: "/admin-inventory" },
  { label: "Orders", icon: ShoppingBag, to: "/admin-shipments" },
  { label: "Marketing", icon: Megaphone, to: "/admin-marketing" },
  { label: "Analytics", icon: BarChart3, to: "/admin-analytics" },
];

/**
 * Global admin command dock. Mounted app-wide but renders only for staff
 * accounts (useIsAdmin). Every destination is itself role-protected, so this
 * is a pure UX shortcut layer — customers never see or reach it.
 */
export function AdminFloatingToolbar() {
  const { isAdmin, loading } = useIsAdmin();
  const { adminMode, toggle } = useAdminMode();
  const [open, setOpen] = useState(false);

  if (loading || !isAdmin) return null;

  return (
    <div className="fixed bottom-24 right-3 z-[60] md:bottom-6 md:right-6 print:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mb-3 w-60 overflow-hidden rounded-2xl border border-accent/30 bg-background/80 p-2 backdrop-blur-2xl shadow-[0_20px_60px_-15px_oklch(0.74_0.19_49/0.45)]"
          >
            <div className="mb-1.5 flex items-center justify-between px-2 pt-1">
              <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
                <ShieldCheck className="size-3.5" /> Admin console
              </span>
              <button
                onClick={() => setOpen(false)}
                className="grid size-6 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Close admin console"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {ACTIONS.map((a) => (
                <Link
                  key={a.label}
                  to={a.to}
                  onClick={() => setOpen(false)}
                  className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"
                >
                  <a.icon className="size-4 text-muted-foreground transition-colors group-hover:text-accent" />
                  <span className="text-[9px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
                    {a.label}
                  </span>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full border border-accent/40 bg-background/70 px-4 py-3 backdrop-blur-2xl transition-all",
          "shadow-[0_10px_40px_-10px_oklch(0.74_0.19_49/0.55)] hover:brightness-110",
        )}
        aria-label="Open admin tools"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-full opacity-60"
          style={{ background: "var(--gradient-ember-soft)", filter: "blur(16px)" }}
        />
        <ShieldCheck className="size-4 text-accent" />
        <span className="hidden text-xs font-semibold uppercase tracking-widest text-accent sm:inline">
          Admin
        </span>
        <ChevronUp
          className={cn(
            "size-4 text-accent transition-transform",
            open && "rotate-180",
          )}
        />
      </motion.button>
    </div>
  );
}
