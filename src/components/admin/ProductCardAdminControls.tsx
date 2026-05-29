import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Pencil,
  Copy,
  Trash2,
  EyeOff,
  Eye,
  MoreVertical,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useIsProductAdmin } from "@/lib/use-admin";
import { useAdminMode } from "@/lib/admin-mode";
import type { Product } from "@/lib/products";
import {
  adminUpdateProduct,
  adminDeleteProduct,
  adminDuplicateProduct,
} from "@/lib/admin-products.functions";
import { invalidateProducts } from "@/lib/use-products";
import { cn } from "@/lib/utils";
import { ProductQuickEditSheet } from "@/components/admin/ProductQuickEditSheet";

/**
 * Admin-only quick-action layer for a product card. Renders nothing for
 * customers (gated on useIsAdmin) and only appears when global Admin Mode is
 * active. Every mutation runs through a staff-gated server function, so the
 * controls are a pure UX surface.
 */
export function ProductCardAdminControls({ product }: { product: Product }) {
  const { isProductAdmin: isAdmin } = useIsProductAdmin();
  const { adminMode } = useAdminMode();
  const navigate = useNavigate();
  const update = useServerFn(adminUpdateProduct);
  const del = useServerFn(adminDeleteProduct);
  const duplicate = useServerFn(adminDuplicateProduct);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [quickEdit, setQuickEdit] = useState(false);

  if (!isAdmin || !adminMode) return null;

  async function run(fn: () => Promise<unknown>, label: string) {
    setBusy(true);
    try {
      await fn();
      await invalidateProducts();
      toast.success(label);
    } catch (e) {
      toast.error("Action failed", {
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const actions = [
    {
      label: "Quick edit",
      icon: SlidersHorizontal,
      onClick: (e: React.MouseEvent) => {
        stop(e);
        setOpen(false);
        setQuickEdit(true);
      },
    },
    {
      label: "Edit product",
      icon: Pencil,
      onClick: (e: React.MouseEvent) => {
        stop(e);
        navigate({ to: "/products/$slug", params: { slug: product.slug } });
      },
    },
    {
      label: product.inStock ? "Hide product" : "Publish product",
      icon: product.inStock ? EyeOff : Eye,
      onClick: (e: React.MouseEvent) => {
        stop(e);
        run(
          () => update({ data: { slug: product.slug, inStock: !product.inStock } }),
          product.inStock ? "Product hidden" : "Product published",
        );
      },
    },
    {
      label: "Duplicate",
      icon: Copy,
      onClick: (e: React.MouseEvent) => {
        stop(e);
        run(() => duplicate({ data: { slug: product.slug } }), "Product duplicated");
      },
    },
    {
      label: "Delete",
      icon: Trash2,
      danger: true,
      onClick: (e: React.MouseEvent) => {
        stop(e);
        if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
        run(() => del({ data: { slug: product.slug } }), "Product deleted");
      },
    },
  ];

  return (
    <div className="absolute left-2 top-2 z-20" onClick={stop}>
      <button
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        aria-label="Admin actions"
        className={cn(
          "grid size-7 place-items-center rounded-full border backdrop-blur-md transition-all",
          open
            ? "border-accent/60 bg-accent/20 text-accent"
            : "border-accent/40 bg-background/70 text-accent hover:bg-accent/15",
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <MoreVertical className="size-3.5" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="mt-1.5 w-44 overflow-hidden rounded-xl border border-accent/30 bg-background/90 p-1 backdrop-blur-2xl shadow-[0_16px_40px_-12px_oklch(0.74_0.19_49/0.5)]"
          >
            <div className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-mono uppercase tracking-widest text-accent">
              <ShieldCheck className="size-3" /> Admin
            </div>
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                disabled={busy}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors disabled:opacity-50",
                  a.danger
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                )}
              >
                <a.icon className="size-3.5 shrink-0" />
                {a.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
