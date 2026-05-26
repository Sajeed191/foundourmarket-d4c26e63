import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin-activity")({
  head: () => ({ meta: [{ title: "Activity log — Admin" }] }),
  component: ActivityPage,
});

type Log = { id: number; action: string; entity_type: string | null; entity_id: string | null; metadata: Record<string, unknown>; created_at: string; actor_id: string | null };

function ActivityPage() {
  const [logs, setLogs] = useState<Log[] | null>(null);

  useEffect(() => {
    supabase.from("admin_activity_logs").select("*").order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => setLogs((data as unknown as Log[]) ?? []));

    const channel = supabase.channel("activity-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_activity_logs" }, (payload) => {
        setLogs((prev) => [payload.new as unknown as Log, ...(prev ?? [])].slice(0, 300));
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, []);

  return (
    <AdminShell title="Activity log" subtitle="Audit trail of every admin action" allow={["admin","super_admin"]} actions={
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
        <span className="size-1.5 rounded-full bg-accent animate-pulse" /> Live
      </span>
    }>
      {logs === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        <div className="bg-card border border-border rounded-2xl divide-y divide-border/40">
          {logs.map((l) => (
            <div key={l.id} className="px-5 py-3 flex items-center gap-4">
              <Activity className="size-4 text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-mono text-xs uppercase tracking-widest text-accent">{l.action}</span>
                  {l.entity_type && <span className="text-muted-foreground"> · {l.entity_type}</span>}
                  {l.entity_id && <span className="font-mono text-[11px] text-muted-foreground"> · {l.entity_id}</span>}
                </p>
                {Object.keys(l.metadata ?? {}).length > 0 && (
                  <p className="text-[10px] font-mono text-muted-foreground truncate">{JSON.stringify(l.metadata)}</p>
                )}
              </div>
              <p className="text-[10px] font-mono text-muted-foreground shrink-0">{new Date(l.created_at).toLocaleString()}</p>
            </div>
          ))}
          {logs.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No activity yet.</p>}
        </div>
      }
    </AdminShell>
  );
}
