import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
        logs.length === 0 ? (
          <div className="card-premium rounded-2xl">
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
          </div>
        ) : (
          <div className="card-premium rounded-2xl overflow-hidden">
            <ActivityList logs={logs} />
          </div>
        )
      }
    </AdminShell>
  );
}

function ActivityList({ logs }: { logs: Log[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });
  const items = virtualizer.getVirtualItems();
  return (
    <div ref={parentRef} className="overflow-auto overscroll-contain" style={{ maxHeight: "72vh", contain: "strict" }}>
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {items.map((vi) => {
          const l = logs[vi.index];
          return (
            <div
              key={l.id}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${vi.start}px)`, willChange: "transform" }}
            >
              <div className={`px-5 py-3 flex items-center gap-4 ${vi.index === 0 ? "" : "border-t border-border/40"}`}>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
