import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { HomepageBuilder } from "@/components/builder/HomepageBuilder";

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
    </AdminShell>
  );
}
