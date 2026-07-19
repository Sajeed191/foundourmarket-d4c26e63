import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { InfraDiagnosticsPanel } from "@/components/admin/InfraDiagnosticsPanel";
import { RecoveryAnalyticsPanel } from "@/components/admin/RecoveryAnalyticsPanel";

export const Route = createFileRoute("/admin-infrastructure")({
  head: () => ({ meta: [{ title: "Infrastructure — Admin" }] }),
  component: InfrastructurePage,
});

function InfrastructurePage() {
  return (
    <AdminShell title="Infrastructure" subtitle="Service Worker, cache health, and deployment recovery" allow={["admin","super_admin"]}>
      <div className="space-y-8">
        <InfraDiagnosticsPanel />
        <div className="h-px bg-border/40" />
        <RecoveryAnalyticsPanel />
      </div>
    </AdminShell>
  );
}
