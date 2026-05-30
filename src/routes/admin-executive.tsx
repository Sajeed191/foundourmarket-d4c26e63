import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { ExecutiveDashboard } from "@/components/admin/ExecutiveDashboard";
import { AcquisitionSummary } from "@/components/admin/AcquisitionSummary";

export const Route = createFileRoute("/admin-executive")({
  head: () => ({
    meta: [
      { title: "Executive Dashboard — FoundOurMarket™" },
      { name: "description", content: "CEO-level control center — business health, profit drivers, risks, opportunities and AI executive insights in real time." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ view: typeof s.view === "string" ? s.view : undefined }),
  component: ExecutivePage,
});

function ExecutivePage() {
  const { view } = Route.useSearch();
  useEffect(() => { logActivity("executive_dashboard_open", "executive", undefined, view ? { view } : undefined); }, [view]);
  return (
    <AdminShell
      title="Executive Dashboard"
      subtitle="One screen. One source of truth. The entire business in 30 seconds."
      allow={["admin", "super_admin", "manager"]}
    >
      <div className="mb-4"><AcquisitionSummary title="Acquisition Intelligence" /></div>
      <ExecutiveDashboard focusView={view} />
    </AdminShell>
  );
}
