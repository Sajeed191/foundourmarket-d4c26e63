import { ImageOff, ChevronRight, Repeat, Wallet, CalendarClock, User } from "lucide-react";
import type { AdminReturnRow } from "@/lib/returns-admin.functions";
import type { Product } from "@/lib/products";

const STATUS_TONE: Record<string, string> = {
  requested: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  approved: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  received: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  completed: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  rejected: "text-rose-400 border-rose-400/30 bg-rose-400/10",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ReturnQueueCard({
  r,
  products,
  onReview,
}: {
  r: AdminReturnRow;
  products: Map<string, Product>;
  onReview: (r: AdminReturnRow) => void;
}) {
  const item = r.return_items[0];
  const p = item ? products.get(item.product_slug) : undefined;
  const resolution = r.resolution_type === "refund" ? "refund" : "replacement";

  return (
    <button
      type="button"
      onClick={() => onReview(r)}
      className="group w-full text-left card-premium rounded-2xl p-3 sm:p-4 flex items-center gap-3 hover:border-accent/40 transition-colors"
    >
      {/* Product image */}
      <div className="size-14 sm:size-16 rounded-xl overflow-hidden bg-muted/30 border border-border/60 shrink-0 grid place-items-center">
        {p?.image ? (
          <img src={p.image} alt={p.name} className="size-full object-cover" loading="lazy" />
        ) : (
          <ImageOff className="size-5 text-muted-foreground" />
        )}
      </div>

      {/* Main info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate max-w-full">{p?.name ?? item?.product_slug ?? "Return"}</p>
          <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${STATUS_TONE[r.status] ?? "text-muted-foreground border-border"}`}>
            {r.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
          <User className="size-3 shrink-0" /> {r.customer.name ?? "—"}
        </p>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{r.reason}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {resolution === "refund" ? <Wallet className="size-3 text-amber-400" /> : <Repeat className="size-3 text-accent" />}
            {resolution}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3" /> {fmtDate(r.created_at)}
          </span>
        </div>
      </div>

      {/* Review affordance */}
      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-accent self-stretch sm:self-center">
        <span className="hidden sm:inline">Review</span>
        <ChevronRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </button>
  );
}
