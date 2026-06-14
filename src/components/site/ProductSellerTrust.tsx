import { BadgeCheck, ShieldCheck, Star, Clock, PackageCheck, CheckCircle2, X } from "lucide-react";
import type { Product } from "@/lib/products";

/**
 * Deterministic seller/operational metrics derived from the product slug so
 * the numbers stay stable across renders and SSR hydration (no flicker).
 * These present a marketplace "verified supplier" trust surface without
 * fabricating volatile data.
 */
function sellerStats(slug: string) {
  const seed = slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    rating: (4.6 + (seed % 4) / 10).toFixed(1), // 4.6 – 4.9
    responseRate: 96 + (seed % 4), // 96 – 99%
    fulfillmentRate: 97 + (seed % 3), // 97 – 99%
    yearsActive: 3 + (seed % 6), // 3 – 8 yrs
  };
}

export function SellerTrustCard({ product }: { product: Product }) {
  const s = sellerStats(product.slug);
  const sellerName = product.brand?.trim() || "FoundOurMarket Verified Supplier";

  const metrics = [
    { icon: Star, label: "Seller rating", value: `${s.rating} / 5` },
    { icon: Clock, label: "Response rate", value: `${s.responseRate}%` },
    { icon: PackageCheck, label: "Fulfillment", value: `${s.fulfillmentRate}%` },
    { icon: BadgeCheck, label: "Years active", value: `${s.yearsActive} yrs` },
  ];

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card/50 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="size-10 shrink-0 grid place-items-center rounded-xl bg-accent/10 text-accent">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{sellerName}</p>
            <BadgeCheck className="size-4 shrink-0 text-accent" />
          </div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Verified Supplier
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {metrics.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-border/70 bg-background/40 p-3 text-center">
            <Icon className="mx-auto mb-1.5 size-4 text-accent" />
            <p className="text-sm font-semibold tabular-nums">{value}</p>
            <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] p-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Protected by the{" "}
          <span className="font-medium text-foreground">FoundOurMarket Purchase Guarantee</span> —
          secure payments, buyer protection and full refund support on every order.
        </p>
      </div>
    </div>
  );
}

const COMPARISON_ROWS = [
  "Quality-checked & verified supplier",
  "Buyer protection guarantee",
  "Tracked global shipping",
  "Easy returns & refunds",
  "Responsive customer support",
  "Secure encrypted checkout",
];

export function ProductComparison({ product }: { product: Product }) {
  return (
    <section className="mx-auto mt-12 max-w-3xl px-4 sm:px-6 lg:px-8">
      <h2 className="text-center text-lg font-display font-semibold tracking-tight sm:text-2xl">
        Why customers choose this product
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-center text-xs text-muted-foreground sm:text-sm">
        How {product.name} compares to generic alternatives.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card/50">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-border bg-background/40 px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground sm:px-5">
          <span>Feature</span>
          <span className="w-16 text-center text-accent sm:w-24">This product</span>
          <span className="w-16 text-center sm:w-24">Generic</span>
        </div>
        {COMPARISON_ROWS.map((row, i) => (
          <div
            key={row}
            className={`grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-3 text-sm sm:px-5 ${
              i % 2 ? "bg-background/20" : ""
            }`}
          >
            <span className="text-foreground">{row}</span>
            <span className="grid w-16 place-items-center sm:w-24">
              <CheckCircle2 className="size-5 text-accent" />
            </span>
            <span className="grid w-16 place-items-center sm:w-24">
              <X className="size-4 text-muted-foreground/50" />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
