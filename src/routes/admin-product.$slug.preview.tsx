import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, Smartphone, Monitor, Package } from "lucide-react";
import { ReadOnlySection, inr } from "@/components/admin/product-editor/kit";
import { resolveImage } from "@/lib/products";

export const Route = createFileRoute("/admin-product/$slug/preview")({ component: PreviewPage });

const COLS = ["name", "image", "price_inr", "compare_price_inr", "price", "discount", "rating", "reviews", "stock_quantity"];

function PreviewPage() {
  const { slug } = Route.useParams();
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  return (
    <ReadOnlySection slug={slug} sectionKey="preview" title="Preview" icon={<Eye className="size-4" />} cols={COLS}>
      {(r) => {
        const sell = r.price_inr ?? (Number(r.price) || 0);
        const compare = r.compare_price_inr as number | null;
        const pctOff = compare != null && compare > sell && sell > 0 ? Math.round(((compare - sell) / compare) * 100) : (r.discount ? Number(r.discount) : 0);
        const cardWidth = device === "mobile" ? "w-44" : "w-64";
        return (
          <div className="card-premium rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setDevice("mobile")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase tracking-widest ${device === "mobile" ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground"}`}>
                <Smartphone className="size-3" /> Mobile
              </button>
              <button onClick={() => setDevice("desktop")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase tracking-widest ${device === "desktop" ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground"}`}>
                <Monitor className="size-3" /> Desktop
              </button>
            </div>
            <div className="grid place-items-center rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5">
              <div className={`${cardWidth} max-w-full rounded-2xl overflow-hidden border border-white/10 bg-card shadow-[var(--shadow-ember)]`}>
                <div className="relative aspect-square bg-white/5 grid place-items-center overflow-hidden">
                  {r.image ? <img loading="lazy" decoding="async" src={resolveImage(r.image)} alt={r.name} className="w-full h-full object-cover" /> : <Package className="size-8 text-muted-foreground" />}
                  {pctOff > 0 && <span className="absolute top-2 right-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">-{pctOff}%</span>}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{inr(sell)}</span>
                    {compare != null && compare > sell && <span className="text-xs text-muted-foreground line-through">{inr(compare)}</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">★ {Number(r.rating ?? 0).toFixed(1)} ({r.reviews ?? 0})</p>
                </div>
              </div>
            </div>
            <p className="text-center text-[10px] text-muted-foreground">Exactly as buyers see it on the storefront.</p>
          </div>
        );
      }}
    </ReadOnlySection>
  );
}
