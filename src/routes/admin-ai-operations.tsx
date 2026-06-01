import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { AIOperationsCenter } from "@/components/admin/AIOperationsCenter";

export const Route = createFileRoute("/admin-ai-operations")({
  head: () => ({
    meta: [
      { title: "AI Operations — FoundOurMarket™" },
      { name: "description", content: "AI Commerce Operations Assistant — prioritized, profit-aware recommendations, executive briefings, execution safety and outcome tracking in real time." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { view?: string } => ({ view: typeof s.view === "string" ? s.view : undefined }),
  component: AIOperationsPage,
});

function AIOperationsPage() {
  const { view } = Route.useSearch();
  useEffect(() => { logActivity("ai_operations_open", "ai_operations", undefined, view ? { view } : undefined); }, [view]);
  return (
    <AdminShell
      title="AI Operations"
      subtitle="The operational layer above every intelligence system — problem, reason, action, result."
      allow={["admin", "super_admin", "manager"]}
    >
      <AIOperationsCenter focusView={view} />
    </AdminShell>
  );
}
