import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, LifeBuoy, MessageSquare } from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThreadSheet } from "@/routes/account_.support";
import { notifySupportEvent } from "@/lib/support.functions";

export const Route = createFileRoute("/admin-support")({
  head: () => ({ meta: [{ title: "Support — Admin" }] }),
  component: AdminSupportPage,
});

type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  market_region: string | null;
  last_message_at: string;
  created_at: string;
};

const STATUSES = ["open", "pending", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const FILTERS = ["all", "open", "pending", "resolved", "closed"] as const;

function statusTone(s: string) {
  const v = s.toLowerCase();
  if (v === "resolved" || v === "closed") return "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20";
  if (v === "pending") return "text-sky-400 bg-sky-400/10 ring-sky-400/20";
  return "text-accent bg-accent/10 ring-accent/25";
}

function AdminSupportPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id,user_id,subject,category,status,priority,market_region,last_message_at,created_at")
      .order("last_message_at", { ascending: false })
      .limit(500);
    if (error) { toast.error(error.message); setTickets([]); return; }
    setTickets((data as Ticket[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase.channel("admin-support")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  async function update(id: string, patch: Record<string, unknown>) {
    if (patch.status === "resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await (supabase.from("support_tickets") as any).update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    logActivity("support_update", "support_ticket", id, patch);
    if (patch.status === "resolved" || patch.status === "closed") {
      void notifySupportEvent({ data: { ticketId: id, event: patch.status as "resolved" | "closed" } }).catch(() => {});
    }
    void load();
  }

  const filtered = useMemo(
    () => (tickets ?? []).filter((t) => filter === "all" || t.status === filter),
    [tickets, filter],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, open: 0, pending: 0, resolved: 0, closed: 0 };
    (tickets ?? []).forEach((t) => { c.all++; if (c[t.status] !== undefined) c[t.status]++; });
    return c;
  }, [tickets]);

  return (
    <AdminShell
      title="Support inbox"
      subtitle="Customer tickets across both markets — reply, triage, and resolve in real time."
      allow={["admin", "super_admin", "manager", "support"]}
      actions={<LifeBuoy className="size-4 text-accent" />}
    >
      <div className="flex gap-2 mb-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wide ring-1 transition",
              filter === f ? "bg-accent/15 text-accent ring-accent/40" : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-accent/30")}>
            {f} {counts[f] ? `· ${counts[f]}` : ""}
          </button>
        ))}
      </div>

      {tickets === null ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tickets in this view.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div key={t.id} className="card-premium rounded-2xl p-5">
              <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
                <button onClick={() => setActiveId(t.id)} className="text-left group min-w-0 flex items-start gap-3">
                  <span className="size-9 mt-0.5 grid place-items-center rounded-xl bg-white/[0.04] text-muted-foreground group-hover:text-accent transition-colors shrink-0"><MessageSquare className="size-4" /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium group-hover:text-accent transition-colors truncate">{t.subject}</p>
                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                      #{t.id.slice(0, 8)} · {t.category}{t.market_region ? ` · ${t.market_region}` : ""} · {new Date(t.last_message_at).toLocaleString()}
                    </p>
                  </div>
                </button>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-widest ring-1", statusTone(t.status))}>{t.status}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <select value={t.status} onChange={(e) => update(t.id, { status: e.target.value })}
                  className="bg-background border border-border rounded-md px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-accent focus:outline-none focus:border-accent">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={t.priority} onChange={(e) => update(t.id, { priority: e.target.value })}
                  className="bg-background border border-border rounded-md px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-accent focus:outline-none focus:border-accent">
                  {PRIORITIES.map((p) => <option key={p} value={p}>priority: {p}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeId && user && (
        <ThreadSheet ticketId={activeId} userId={user.id} isStaff onClose={() => setActiveId(null)} />
      )}
    </AdminShell>
  );
}
