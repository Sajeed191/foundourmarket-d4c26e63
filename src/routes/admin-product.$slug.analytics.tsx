import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Eye, Star, ShoppingCart, Heart } from "lucide-react";
import { ReadOnlySection } from "@/components/admin/product-editor/kit";

export const Route = createFileRoute("/admin-product/$slug/analytics")({ component: AnalyticsPage });

const COLS = ["views_count", "rating", "reviews", "sold_count", "wishlist_count"];

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card-premium rounded-2xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <span className="text-accent">{icon}</span>
        <span className="text-[9px] font-mono uppercase tracking-[0.25em]">{label}</span>
      </div>
      <p className="text-2xl font-display font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function AnalyticsPage() {
  const { slug } = Route.useParams();
  return (
    <ReadOnlySection slug={slug} sectionKey="analytics" title="Analytics" icon={<BarChart3 className="size-4" />} cols={COLS}>
      {(r) => (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={<Eye className="size-4" />} label="Views" value={String(r.views_count ?? 0)} />
          <Stat icon={<ShoppingCart className="size-4" />} label="Units sold" value={String(r.sold_count ?? 0)} />
          <Stat icon={<Star className="size-4" />} label="Rating" value={`${Number(r.rating ?? 0).toFixed(1)} (${r.reviews ?? 0})`} />
          <Stat icon={<Heart className="size-4" />} label="Wishlisted" value={String(r.wishlist_count ?? 0)} />
        </div>
      )}
    </ReadOnlySection>
  );
}
