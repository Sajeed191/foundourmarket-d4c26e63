import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { HomepageBuilder } from "@/components/builder/HomepageBuilder";
import { ExecutiveSummaryPanel } from "@/components/admin/ExecutiveSummaryPanel";
import { FinancialInsightsPanel } from "@/components/admin/FinancialInsightsPanel";

export const Route = createFileRoute("/builder")({
  head: () => ({
    meta: [
      { title: "Storefront Builder — FoundOurMarket™" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BuilderPage,
});

function BuilderPage() {
  return (
    <AdminShell
      title="Storefront Builder"
      subtitle="Visually compose the homepage — drag, schedule, target regions and publish in realtime."
      allow={["admin", "super_admin", "editor", "manager"]}
    >
      <HomepageBuilder />

      {/* FINANCIAL PERFORMANCE PER STOREFRONT */}
      <div className="mt-8 space-y-6">
        <ExecutiveSummaryPanel source="storefront" compact />
        <FinancialInsightsPanel module="storefront" />
      </div>
    </AdminShell>
  );
}
