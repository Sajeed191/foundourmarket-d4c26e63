import { createFileRoute } from "@tanstack/react-router";
import { Award } from "lucide-react";
import { ProductCollection } from "@/components/site/ProductCollection";

export const Route = createFileRoute("/products/best-sellers")({
  head: () => ({
    meta: [
      { title: "Best Sellers — FoundOurMarket™" },
      { name: "description", content: "The best-selling products on FoundOurMarket — customer favourites from the global marketplace." },
      { property: "og:title", content: "Best Sellers — FoundOurMarket™" },
      { property: "og:description", content: "Shop the best-selling products on FoundOurMarket." },
    ],
  }),
  component: () => (
    <ProductCollection
      eyebrow="Customer favourites"
      title="Best Sellers"
      description="Products our team has marked as Best Sellers, ranked by total sales worldwide."
      icon={Award}
      sort="best_sellers"
      collectionKey="best_sellers"
      forceBadge="bestseller"
    />
  ),
});
