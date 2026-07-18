import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search, Download, Trash2, MailX, Users, UserCheck, UserX, CalendarDays,
  Loader2, ChevronUp, ChevronDown, Copy, AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin-newsletter")({
  head: () => ({ meta: [{ title: "Newsletter — Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: NewsletterAdmin,
});

type Subscriber = {
  id: string;
  email: string;
  status: string;
  source: string | null;
  source_page: string | null;
  device: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
  subscribed_at: string | null;
  unsubscribed_at: string | null;
  abuse_status: string | null;
  flag_reason: string | null;
  browser: string | null;
};

type AuditRow = {
  id: string;
  action: string;
  target_email: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_email: string | null;
};

type SortKey = "created_at" | "email" | "status";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

async function fetchSubscribers(): Promise<Subscriber[]> {
  const { data, error } = await supabase
    .from("newsletter_subscribers")
    // Use a broad select so newly-added columns are picked up without regenerating types.
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data as unknown as Subscriber[]) ?? [];
}

async function fetchAudit(): Promise<AuditRow[]> {
  const { data, error } = await supabase
    // Not in generated types yet — cast through unknown.
    .from("newsletter_audit_log" as never)
    .select("id,action,target_email,reason,metadata,created_at,actor_email")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as unknown as AuditRow[]) ?? [];
}

function toCSV(rows: Subscriber[]): string {
  const headers = ["email", "status", "source", "source_page", "device", "country", "subscribed_at", "unsubscribed_at", "created_at"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc((r as unknown as Record<string, unknown>)[h])).join(",")),
  ].join("\n");
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "subscribed"
      ? "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20"
      : status === "unsubscribed"
      ? "text-muted-foreground bg-white/5 ring-white/10"
      : "text-amber-400 bg-amber-400/10 ring-amber-400/20";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ring-1 ring-inset ${cls}`}>
      {status}
    </span>
  );
}

function NewsletterAdmin() {
  const qc = useQueryClient();
  const { data: subs, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "newsletter-subscribers"],
    queryFn: fetchSubscribers,
    staleTime: 30_000,
  });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "subscribed" | "unsubscribed">("all");
  const [abuseFilter, setAbuseFilter] = useState<"all" | "normal" | "flagged" | "blocked">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAudit, setShowAudit] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "newsletter-subscribers"] });

  const auditQ = useQuery({
    queryKey: ["admin", "newsletter-audit"],
    queryFn: fetchAudit,
    enabled: showAudit,
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("newsletter_subscribers").delete().in("id", ids);
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ["admin", "newsletter-subscribers"] });
      const prev = qc.getQueryData<Subscriber[]>(["admin", "newsletter-subscribers"]);
      const set = new Set(ids);
      qc.setQueryData<Subscriber[]>(
        ["admin", "newsletter-subscribers"],
        (curr) => (curr ?? []).filter((s) => !set.has(s.id)),
      );
      return { prev };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin", "newsletter-subscribers"], ctx.prev);
      toast.error("Failed to delete. Please try again.");
    },
    onSuccess: (_d, ids) => {
      toast.success(ids.length > 1 ? `${ids.length} subscribers deleted.` : "Subscriber deleted.");
      setSelected(new Set());
    },
  });

  const unsubMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("newsletter_subscribers")
        .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ["admin", "newsletter-subscribers"] });
      const prev = qc.getQueryData<Subscriber[]>(["admin", "newsletter-subscribers"]);
      const set = new Set(ids);
      const now = new Date().toISOString();
      qc.setQueryData<Subscriber[]>(
        ["admin", "newsletter-subscribers"],
        (curr) => (curr ?? []).map((s) =>
          set.has(s.id) ? { ...s, status: "unsubscribed", unsubscribed_at: now } : s,
        ),
      );
      return { prev };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin", "newsletter-subscribers"], ctx.prev);
      toast.error("Failed to unsubscribe. Please try again.");
    },
    onSuccess: (_d, ids) => {
      toast.success(ids.length > 1 ? `${ids.length} subscribers unsubscribed.` : "Subscriber unsubscribed.");
      setSelected(new Set());
    },
  });

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of subs ?? []) if (r.source) set.add(r.source);
    return Array.from(set).sort();
  }, [subs]);

  const filtered = useMemo(() => {
    const rows = subs ?? [];
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (abuseFilter !== "all" && (r.abuse_status ?? "normal") !== abuseFilter) return false;
      if (sourceFilter !== "all" && (r.source ?? "") !== sourceFilter) return false;
      if (!q) return true;
      return (
        r.email.toLowerCase().includes(q) ||
        (r.source ?? "").toLowerCase().includes(q) ||
        (r.source_page ?? "").toLowerCase().includes(q) ||
        (r.country ?? "").toLowerCase().includes(q)
      );
    });
    const sorted = [...base].sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [subs, query, statusFilter, abuseFilter, sourceFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const stats = useMemo(() => {
    const rows = subs ?? [];
    const active = rows.filter((r) => r.status === "subscribed").length;
    const unsubscribed = rows.filter((r) => r.status === "unsubscribed").length;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const today = rows.filter((r) => new Date(r.created_at) >= startOfToday).length;
    const months = new Map<string, number>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.set(d.toISOString().slice(0, 7), 0);
    }
    for (const r of rows) {
      const key = r.created_at.slice(0, 7);
      if (months.has(key)) months.set(key, (months.get(key) ?? 0) + 1);
    }
    const chart = Array.from(months.entries()).map(([k, v]) => ({
      month: new Date(k + "-01").toLocaleDateString(undefined, { month: "short" }),
      subscribers: v,
    }));
    return { total: rows.length, active, unsubscribed, today, chart };
  }, [subs]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
    setPage(0);
  };

  const exportCSV = () => {
    if (!filtered.length) { toast.error("Nothing to export."); return; }
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} subscribers.`);
  };

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied.");
    } catch {
      toast.error("Copy failed.");
    }
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const togglePage = () => {
    const ids = pageRows.map((r) => r.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };
  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  const bulkDelete = () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (confirm(`Delete ${ids.length} subscriber${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) {
      deleteMut.mutate(ids);
    }
  };
  const bulkUnsubscribe = () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (confirm(`Unsubscribe ${ids.length} subscriber${ids.length > 1 ? "s" : ""}?`)) {
      unsubMut.mutate(ids);
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? null : sortDir === "asc" ? <ChevronUp className="inline size-3" /> : <ChevronDown className="inline size-3" />;

  return (
    <AdminShell
      title="Newsletter"
      subtitle="Manage newsletter subscribers"
      allow={["admin", "super_admin", "manager", "support", "editor"]}
      actions={
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium"
        >
          <Download className="size-3.5" /> Export CSV
        </button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total" value={stats.total} icon={Users} />
        <StatCard label="Active" value={stats.active} icon={UserCheck} />
        <StatCard label="Unsubscribed" value={stats.unsubscribed} icon={UserX} />
        <StatCard label="Today" value={stats.today} icon={CalendarDays} />
      </div>

      {/* Growth chart */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Monthly growth</h3>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Last 12 months</span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="subscribers" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            placeholder="Search email, source, country…"
            className="w-full rounded-full border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(0); }}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="all">All statuses</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <button
            onClick={bulkUnsubscribe}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1"
          >
            <MailX className="size-3" /> Unsubscribe
          </button>
          <button
            onClick={bulkDelete}
            className="inline-flex items-center gap-1 rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10 px-3 py-1"
          >
            <Trash2 className="size-3" /> Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/10"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-white/10 overflow-hidden">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-10 text-center text-sm">
            <AlertTriangle className="mx-auto mb-2 size-5 text-destructive" />
            <p className="text-destructive font-medium">Couldn't load subscribers</p>
            <p className="mt-1 text-xs text-muted-foreground">{(error as Error)?.message ?? "Please retry."}</p>
            <button
              onClick={() => refetch()}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-1.5 text-xs"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {(subs ?? []).length === 0 ? "No subscribers yet." : "No subscribers match your filters."}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.02] text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={pageAllSelected}
                        onChange={togglePage}
                        aria-label="Select all on page"
                        className="accent-accent"
                      />
                    </th>
                    <th className="text-left px-4 py-3 cursor-pointer" onClick={() => toggleSort("email")}>
                      Email <SortIcon k="email" />
                    </th>
                    <th className="text-left px-4 py-3 cursor-pointer" onClick={() => toggleSort("status")}>
                      Status <SortIcon k="status" />
                    </th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Source</th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Country</th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Device</th>
                    <th className="text-left px-4 py-3 cursor-pointer" onClick={() => toggleSort("created_at")}>
                      Joined <SortIcon k="created_at" />
                    </th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s) => (
                    <tr key={s.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggleRow(s.id)}
                          aria-label={`Select ${s.email}`}
                          className="accent-accent"
                        />
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{s.email}</span>
                          <button
                            onClick={() => copyEmail(s.email)}
                            className="opacity-60 hover:opacity-100 shrink-0"
                            title="Copy email"
                            aria-label={`Copy ${s.email}`}
                          >
                            <Copy className="size-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{s.source_page ?? s.source ?? "—"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{s.country ?? "—"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{s.device ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {s.status === "subscribed" && (
                            <button
                              onClick={() => unsubMut.mutate([s.id])}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 hover:bg-white/10 px-2.5 py-1 text-[11px]"
                              title="Unsubscribe"
                            >
                              <MailX className="size-3" /> Unsubscribe
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm(`Delete ${s.email}?`)) deleteMut.mutate([s.id]);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10 px-2.5 py-1 text-[11px]"
                            title="Delete"
                          >
                            <Trash2 className="size-3" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-white/5 px-4 py-3 text-xs text-muted-foreground">
              <span>
                {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded-full border border-white/10 px-3 py-1 disabled:opacity-40"
                >
                  Prev
                </button>
                <span>Page {currentPage + 1} / {pageCount}</span>
                <button
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="rounded-full border border-white/10 px-3 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function StatCard({
  label, value, icon: Icon,
}: { label: string; value: number; icon: typeof Users }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className="size-4 text-accent" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="p-4 space-y-2" role="status" aria-label="Loading subscribers">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 rounded-lg bg-white/[0.03] animate-pulse" />
      ))}
      <span className="sr-only">Loading…</span>
      <div className="pt-2 flex justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
