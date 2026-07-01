import { createFileRoute } from "@tanstack/react-router";
import { VirtualizedProductGrid } from "@/components/site/VirtualizedProductGrid";

export const Route = createFileRoute("/wtest")({
  component: WTest,
});

function WTest() {
  const items = Array.from({ length: 300 }, (_, i) => ({ id: String(i), n: i }));
  return (
    <VirtualizedProductGrid
      items={items}
      cols={{ base: 2, md: 3, xl: 4 }}
      className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3"
      getKey={(p) => p.id}
      renderItem={(p) => (
        <div style={{ height: 300 }} className="rounded-xl bg-card grid place-items-center">
          <img alt="" width={40} height={40} src={`data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='%23888'/></svg>`} />
          <span>#{p.n}</span>
        </div>
      )}
    />
  );
}
