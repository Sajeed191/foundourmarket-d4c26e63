import { createFileRoute } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { ProductCollection } from "@/components/site/ProductCollection";

export const Route = createFileRoute("/products/trending")({
  head: () => ({
    meta: [
      { title: "Trending Products — FoundOurMarket™" },
      { name: "description", content: "The most-viewed products on FoundOurMarket right now — trending picks from the global marketplace." },
      { property: "og:title", content: "Trending Products — FoundOurMarket™" },
      { property: "og:description", content: "Shop the hottest trending products on FoundOurMarket." },
    ],
  }),
  component: () => (
    <ProductCollection
      eyebrow="Hot right now"
      title="Trending Products"
      description="Products our team has marked as Trending across the marketplace."
      icon={Flame}
      sort="trending"
      collectionKey="trending"
      forceBadge="trending"
    />
  ),
});
