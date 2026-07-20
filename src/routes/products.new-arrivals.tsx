import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { ProductCollection } from "@/components/site/ProductCollection";

export const Route = createFileRoute("/products/new-arrivals")({
  head: () => ({
    meta: [
      { title: "New Arrivals — FoundOurMarket™" },
      { name: "description", content: "The latest products added to FoundOurMarket — fresh arrivals from the global marketplace." },
      { property: "og:title", content: "New Arrivals — FoundOurMarket™" },
      { property: "og:description", content: "Discover the newest products on FoundOurMarket." },
    ],
  }),
  component: () => (
    <ProductCollection
      eyebrow="Just landed"
      title="New Arrivals"
      description="The freshest additions to the marketplace, curated and delivered worldwide."
      icon={Sparkles}
      sort="newest"
      collectionKey="new_arrivals"
      forceBadge="new"
    />
  ),
});
