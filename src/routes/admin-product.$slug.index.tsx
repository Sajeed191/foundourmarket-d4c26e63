import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText, IndianRupee, Boxes, Truck, RotateCcw, Search, Sparkles, BarChart3, Eye, ChevronRight,
} from "lucide-react";
import { ReadOnlySection, PRODUCT_SECTIONS } from "@/components/admin/product-editor/kit";

export const Route = createFileRoute("/admin-product/$slug/")({
  component: OverviewPage,
});

const ICONS: Record<string, any> = {
  details: FileText, pricing: IndianRupee, inventory: Boxes, shipping: Truck,
  returns: RotateCcw, seo: Search, merchandising: Sparkles, analytics: BarChart3, preview: Eye,
};

const DESC: Record<string, string> = {
  details: "Name, description, media & attributes",
  pricing: "Regional prices, cost & margins",
  inventory: "Stock levels, SKU & availability",
  shipping: "Dimensions, fees & delivery options",
  returns: "Return window, replacements & warranty",
  seo: "Search title, description & keywords",
  merchandising: "Badges, placement & priority",
  analytics: "Views, ratings & performance",
  preview: "See exactly how buyers view it",
};

function OverviewPage() {
  const { slug } = Route.useParams();
  return (
    <ReadOnlySection slug={slug} sectionKey="" title="Product Overview" icon={<FileText className="size-4" />} cols={[]}>
      {() => (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PRODUCT_SECTIONS.map((s) => {
            const Icon = ICONS[s.key] ?? FileText;
            return (
              <Link key={s.key} to={s.to} params={{ slug }}
                className="group card-premium rounded-2xl p-4 hover:border-accent/40 transition-colors">
                <div className="flex items-start justify-between">
                  <span className="size-9 grid place-items-center rounded-xl bg-accent/10 text-accent"><Icon className="size-4" /></span>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-accent transition-colors" />
                </div>
                <p className="mt-3 text-sm font-medium">{s.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{DESC[s.key]}</p>
              </Link>
            );
          })}
        </div>
      )}
    </ReadOnlySection>
  );
}
