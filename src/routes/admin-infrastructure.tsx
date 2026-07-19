import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { InfraDiagnosticsPanel } from "@/components/admin/InfraDiagnosticsPanel";

export const Route = createFileRoute("/admin-infrastructure")({
  head: () => ({ meta: [{ title: "Infrastructure — Admin" }] }),
  component: InfrastructurePage,
});

function InfrastructurePage() {
  return (
    <AdminShell title="Infrastructure" subtitle="Service Worker, cache health, and deployment recovery" allow={["admin","super_admin"]}>
      <InfraDiagnosticsPanel />
    </AdminShell>
  );
}
