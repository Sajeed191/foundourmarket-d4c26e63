import { Sparkles, PackageCheck, X } from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose, DrawerTrigger,
} from "@/components/ui/drawer";

type Line = { slug: string; name: string; image: string; qty: number; lineTotal: number };

export function CheckoutSummaryDrawer({
  open,
  onOpenChange,
  trigger,
  lines,
  fmt,
  subtotal,
  shipping,
  tax,
  discount,
  savings,
  total,
  taxLabel,
  eta,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: React.ReactNode;
  lines: Line[];
  fmt: (n: number) => string;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  savings: number;
  total: number;
  taxLabel: string;
  eta: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="flex flex-row items-center justify-between">
          <DrawerTitle className="text-base">Order summary</DrawerTitle>
          <DrawerClose aria-label="Close order summary" className="rounded-full p-1.5 hover:bg-white/10">
            <X className="size-4" />
          </DrawerClose>
        </DrawerHeader>

        <div className="px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] overflow-y-auto">
          <ul className="space-y-3 mb-4">
            {lines.map((i) => (
              <li key={i.slug} className="flex items-center gap-3 text-sm">
                <img src={i.image} alt="" loading="lazy" className="size-12 rounded-lg object-cover bg-black/30 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{i.name}</p>
                  <p className="text-xs text-muted-foreground">× {i.qty}</p>
                </div>
                <span className="font-mono text-xs">{fmt(i.lineTotal)}</span>
              </li>
            ))}
          </ul>

          {savings > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5">
              <span className="text-xs font-medium text-emerald-400 inline-flex items-center gap-1.5"><Sparkles className="size-3.5" /> You saved</span>
              <span className="font-mono text-sm text-emerald-400">{fmt(savings)}</span>
            </div>
          )}

          <dl className="space-y-2.5 text-sm border-t border-white/10 pt-4">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-mono">{fmt(subtotal)}</dd></div>
            {discount > 0 && (
              <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="font-mono text-emerald-400">−{fmt(discount)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="font-mono">{shipping === 0 ? <span className="text-emerald-400">Free</span> : fmt(shipping)}</dd></div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground inline-flex items-center gap-1">Tax<span className="text-[10px] text-muted-foreground/70">({taxLabel})</span></dt>
              <dd className="font-mono">{fmt(tax)}</dd>
            </div>
            <div className="border-t border-white/10 pt-3 flex justify-between items-end">
              <dt className="font-medium text-base">Total</dt>
              <dd className="font-mono text-2xl font-semibold text-accent leading-none">{fmt(total)}</dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <PackageCheck className="size-3.5 text-accent" /> Estimated delivery {eta}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
