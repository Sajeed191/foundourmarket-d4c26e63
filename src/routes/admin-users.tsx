import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Users, Search, Loader2, RadioTower, Crown, Gem, AlertTriangle, ShieldAlert,
  Download, Globe, UserCog, Activity, TrendingDown, Sparkles, X, Mail, Phone,
  MapPin, Smartphone, Clock, ShoppingBag, Star, Heart, LifeBuoy, RefreshCw, Wifi,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUserIntelligence } from "@/lib/use-user-intelligence";
import {
  type UserIntel, type UserIntelligence, inactivityBuckets, regionStats, countryStats,
  fmtMoney, timeAgo, ROLE_LABEL, scoreColor, STAFF_ROLES,
} from "@/lib/user-intelligence";
import { exportRows, exportJson, type ExportFormat } from "@/lib/traffic-export";

export const Route = createFileRoute("/admin-users")({
  head: () => ({ meta: [{ title: "User & Staff Intelligence — Admin" }] }),
  component: UsersPage,
});

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

function Card({ title, icon, children, className = "", actions }: { title?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <div className={`card-premium rounded-2xl p-5 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h2 className="text-sm font-medium flex items-center gap-2">{icon}{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

function StatusDot({ status }: { status: UserIntel["onlineStatus"] }) {
  const map = { online: "bg-emerald-400", recent: "bg-amber-400", offline: "bg-muted-foreground/40" } as const;
  return <span className={`inline-block size-2 rounded-full ${map[status]} ${status === "online" ? "animate-pulse" : ""}`} />;
}

function Avatar({ u, size = 36 }: { u: UserIntel; size?: number }) {
  if (u.avatar) return <img loading="lazy" decoding="async" src={u.avatar} alt={u.name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  const initials = u.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full grid place-items-center bg-accent/10 text-accent font-medium" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const staff = STAFF_ROLES.includes(role as never);
  return (
    <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
      role === "super_admin" || role === "admin" ? "text-violet-400 border-violet-400/30 bg-violet-400/10"
        : role === "manager" ? "text-sky-400 border-sky-400/30 bg-sky-400/10"
        : staff ? "text-cyan-400 border-cyan-400/30 bg-cyan-400/10"
        : "text-muted-foreground border-border bg-muted/30"
    }`}>{ROLE_LABEL[role] ?? role}</span>
  );
}

function Tag({ t }: { t: string }) {
  const cls = t === "VIP" ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
    : t === "At Risk" || t === "Refund Heavy" ? "text-destructive border-destructive/30 bg-destructive/10"
    : t === "High Value" ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
    : "text-muted-foreground border-border bg-muted/30";
  return <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>{t}</span>;
}

function exportPdf(title: string, rows: Record<string, unknown>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<html><head><title>${title}</title><style>
    body{font-family:system-ui,sans-serif;padding:24px;color:#111}
    h1{font-size:18px;margin-bottom:4px} .meta{color:#666;font-size:11px;margin-bottom:16px}
    table{border-collapse:collapse;width:100%;font-size:11px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f4f4f5;text-transform:uppercase;font-size:9px;letter-spacing:.05em}
    tr:nth-child(even){background:#fafafa}
  </style></head><body><h1>${title}</h1>
  <div class="meta">FoundOurMarket™ · Generated ${new Date().toLocaleString()} · ${rows.length} records</div>
  <table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${headers.map((h) => `<td>${esc(r[h])}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <script>window.onload=()=>{window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function toExportRow(u: UserIntel) {
  return {
    name: u.name, email: u.email ?? "", role: u.primaryRole, segment: u.segment,
    status: u.onlineStatus, region: u.region, country: u.country ?? "",
    joined: u.joinedAt?.slice(0, 10) ?? "", last_active: u.lastActivityAt ? new Date(u.lastActivityAt).toISOString() : "",
    orders: u.ordersCount, revenue: Math.round(u.revenue), ltv: Math.round(u.ltv), aov: Math.round(u.aov),
    refund_rate: (u.refundRate * 100).toFixed(0) + "%", reviews: u.reviews, questions: u.questions, wishlist: u.wishlist,
    tickets: u.tickets, health: u.healthScore, loyalty: u.loyaltyScore, churn_risk: u.churnRisk,
    engagement: u.engagementScore, vip_score: u.vipScore,
  };
}

function ExportMenu({ rows, name }: { rows: UserIntel[]; name: string }) {
  const [open, setOpen] = useState(false);
  const data = rows.map(toExportRow);
  const run = (fn: () => void) => { fn(); setOpen(false); };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 transition-colors">
        <Download className="size-3.5" /> Export
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-20 w-32 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {(["csv", "excel"] as ExportFormat[]).map((f) => (
            <button key={f} onClick={() => run(() => exportRows(f, data, name))} className="block w-full text-left text-xs px-3 py-2 hover:bg-muted/50">{f.toUpperCase()}</button>
          ))}
          <button onClick={() => run(() => exportJson(data, name))} className="block w-full text-left text-xs px-3 py-2 hover:bg-muted/50">JSON</button>
          <button onClick={() => run(() => exportPdf(name, data))} className="block w-full text-left text-xs px-3 py-2 hover:bg-muted/50">PDF</button>
        </div>
      )}
    </div>
  );
}

function UserRow({ u, onClick }: { u: UserIntel; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors text-left">
      <div className="relative shrink-0">
        <Avatar u={u} />
        <span className="absolute -bottom-0.5 -right-0.5"><StatusDot status={u.onlineStatus} /></span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{u.name}</span>
          <RoleBadge role={u.primaryRole} />
          {u.tags.slice(0, 2).map((t) => <Tag key={t} t={t} />)}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{u.email ?? "no email"} · {u.country ?? "—"}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-medium tabular-nums">{inr(u.revenue)}</p>
        <p className="text-[10px] text-muted-foreground">{u.ordersCount} orders · {timeAgo(u.lastActivityMs)}</p>
      </div>
    </button>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1"><span className="text-muted-foreground uppercase tracking-wider">{label}</span><span className={`font-mono ${scoreColor(value)}`}>{value}</span></div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function UserDetail({ u, onClose }: { u: UserIntel; onClose: () => void }) {
  const stat = (label: string, value: React.ReactNode, icon?: React.ReactNode) => (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{icon}{label}</div>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full overflow-y-auto bg-card border-l border-border p-5 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative"><Avatar u={u} size={52} /><span className="absolute -bottom-0.5 -right-0.5"><StatusDot status={u.onlineStatus} /></span></div>
            <div>
              <h2 className="text-base font-display font-semibold">{u.name}</h2>
              <div className="flex flex-wrap gap-1 mt-1">{u.roles.length ? u.roles.map((r) => <RoleBadge key={r} role={r} />) : <RoleBadge role={u.primaryRole} />}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="size-4" /></button>
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          {u.email && <p className="flex items-center gap-2"><Mail className="size-3.5" />{u.email}</p>}
          {u.phone && <p className="flex items-center gap-2"><Phone className="size-3.5" />{u.phone}</p>}
          <p className="flex items-center gap-2"><MapPin className="size-3.5" />{u.country ?? "—"} · {u.region}</p>
          <p className="flex items-center gap-2"><Smartphone className="size-3.5" />{u.device ?? "—"} · {u.source}</p>
          <p className="flex items-center gap-2"><Clock className="size-3.5" />Joined {u.joinedAt?.slice(0, 10) ?? "—"} · {u.accountAgeDays}d old</p>
          <p className="flex items-center gap-2"><Wifi className="size-3.5" />Last active {timeAgo(u.lastActivityMs)} {u.currentPath ? `· ${u.currentPath}` : ""}</p>
        </div>

        <div className="flex flex-wrap gap-1">{u.tags.map((t) => <Tag key={t} t={t} />)}</div>

        <div className="grid grid-cols-2 gap-2">
          {stat("Orders", u.ordersCount, <ShoppingBag className="size-3" />)}
          {stat("Revenue", inr(u.revenue))}
          {stat("LTV", inr(u.ltv))}
          {stat("Avg order", inr(u.aov))}
          {stat("Refund rate", `${(u.refundRate * 100).toFixed(0)}%`)}
          {stat("Coupons used", u.promoCount)}
          {stat("Reviews", u.reviews, <Star className="size-3" />)}
          {stat("Questions", u.questions)}
          {stat("Wishlist", u.wishlist, <Heart className="size-3" />)}
          {stat("Support tickets", u.tickets, <LifeBuoy className="size-3" />)}
        </div>

        {u.isStaff && (
          <Card title="Staff performance" icon={<UserCog className="size-4 text-accent" />}>
            <div className="grid grid-cols-2 gap-2">
              {stat("Assigned tickets", u.assignedTickets)}
              {stat("Resolved", u.resolvedTickets)}
              {stat("Resolution rate", `${(u.resolutionRate * 100).toFixed(0)}%`)}
              {stat("Admin actions", u.activityCount)}
              {stat("Last action", timeAgo(u.lastAdminAction != null ? Date.now() - u.lastAdminAction : null))}
            </div>
          </Card>
        )}

        <Card title="Intelligence scores" icon={<Gem className="size-4 text-accent" />}>
          <div className="space-y-3">
            <ScoreBar label="Health" value={u.healthScore} />
            <ScoreBar label="Loyalty" value={u.loyaltyScore} />
            <ScoreBar label="Engagement" value={u.engagementScore} />
            <ScoreBar label="VIP" value={u.vipScore} />
            <ScoreBar label="Churn risk" value={u.churnRisk} />
          </div>
        </Card>

        {(u.multiCountry || u.multiDevice) && (
          <Card title="Security signals" icon={<ShieldAlert className="size-4 text-destructive" />}>
            <ul className="text-xs text-muted-foreground space-y-1">
              {u.multiCountry && <li>• Sessions from multiple countries</li>}
              {u.multiDevice && <li>• Activity across 3+ devices</li>}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Directory({ data, onSelect }: { data: UserIntelligence; onSelect: (u: UserIntel) => void }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [seg, setSeg] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.users.filter((u) => {
      if (term && !(`${u.name} ${u.email ?? ""} ${u.country ?? ""}`.toLowerCase().includes(term))) return false;
      if (role !== "all" && !(role === "customer" ? !u.isStaff : u.roles.includes(role))) return false;
      if (seg !== "all" && u.segment !== seg) return false;
      if (status !== "all" && u.onlineStatus !== status) return false;
      return true;
    }).sort((a, b) => b.revenue - a.revenue || (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
  }, [data.users, q, role, seg, status]);

  const sel = "text-xs bg-muted/40 border border-border rounded-lg px-2 py-1.5";
  return (
    <Card actions={<ExportMenu rows={filtered} name="user-directory" />} title={`Directory · ${filtered.length}`} icon={<Users className="size-4 text-accent" />}>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, country…" className="w-full text-xs bg-muted/40 border border-border rounded-lg pl-8 pr-2 py-1.5" />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={sel}>
          <option value="all">All roles</option><option value="customer">Customers</option>
          {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <select value={seg} onChange={(e) => setSeg(e.target.value)} className={sel}>
          {["all", "VIP Customer", "High Value", "Returning Customer", "New Customer", "At Risk", "Customer", "Lead"].map((s) => <option key={s} value={s}>{s === "all" ? "All segments" : s}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          {["all", "online", "recent", "offline"].map((s) => <option key={s} value={s}>{s === "all" ? "Any status" : s}</option>)}
        </select>
      </div>
      <div className="divide-y divide-border/50 max-h-[640px] overflow-y-auto -mx-2">
        {filtered.length === 0 ? <p className="text-xs text-muted-foreground p-4 text-center">No users match.</p>
          : filtered.slice(0, 300).map((u) => <UserRow key={u.id} u={u} onClick={() => onSelect(u)} />)}
      </div>
    </Card>
  );
}

function UsersPage() {
  const { data, loading, refreshing, error, refresh } = useUserIntelligence();
  const [sel, setSel] = useState<UserIntel | null>(null);

  if (loading) {
    return <AdminShell title="User & Staff Intelligence" allow={["admin", "super_admin", "manager", "support"]}>
      <div className="min-h-[50vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
    </AdminShell>;
  }
  if (error || !data) {
    return <AdminShell title="User & Staff Intelligence" allow={["admin", "super_admin", "manager", "support"]}>
      <div className="min-h-[40vh] grid place-items-center text-center"><div><AlertTriangle className="size-6 text-destructive mx-auto mb-2" /><p className="text-sm text-muted-foreground">{error ?? "No data"}</p><button onClick={refresh} className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-border">Retry</button></div></div>
    </AdminShell>;
  }

  const s = data.summary;
  const regions = regionStats(data.users);
  const countries = countryStats(data.users);
  const buckets = inactivityBuckets(data.users);
  const online = data.users.filter((u) => u.onlineStatus !== "offline").sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));

  return (
    <AdminShell
      title="User & Staff Intelligence"
      subtitle="Live, database-backed view of every user & team member"
      allow={["admin", "super_admin", "manager", "support"]}
      actions={
        <div className="flex items-center gap-2">
          {refreshing && <Loader2 className="size-3.5 animate-spin text-accent" />}
          <button onClick={refresh} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40"><RefreshCw className="size-3.5" /> Refresh</button>
          <ExportMenu rows={data.users} name="all-users" />
        </div>
      }
    >
      <div className="space-y-5">
        {/* Executive summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total users" value={s.total} icon={<Users className="size-4" />} />
          <KpiCard label="Online now" value={s.online} icon={<RadioTower className="size-4" />} sub={<span className="text-[10px] text-muted-foreground">{s.recent} recently active</span>} />
          <KpiCard label="Active 7d" value={s.active7d} icon={<Activity className="size-4" />} />
          <KpiCard label="VIP customers" value={s.vip} icon={<Crown className="size-4" />} sub={<span className="text-[10px] text-muted-foreground">{inr(s.revenueVip)}</span>} />
          <KpiCard label="At risk" value={s.atRisk} icon={<TrendingDown className="size-4" />} />
          <KpiCard label="Total revenue" value={inr(s.totalRevenue)} icon={<ShoppingBag className="size-4" />} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Customers" value={s.customers} />
          <KpiCard label="Returning" value={s.returning} />
          <KpiCard label="New" value={s.newCustomers} />
          <KpiCard label="Staff" value={s.staff} icon={<UserCog className="size-4" />} />
          <KpiCard label="Admins / Mgrs" value={`${s.admins} / ${s.managers}`} />
          <KpiCard label="Inactive 30d+" value={s.inactive30d} />
        </div>

        <Tabs defaultValue="directory">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="directory">Directory</TabsTrigger>
            <TabsTrigger value="online">Online ({s.online + s.recent})</TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
            <TabsTrigger value="staff">Staff ({s.staff})</TabsTrigger>
            <TabsTrigger value="insights">AI Insights ({data.insights.length})</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="map">User Map</TabsTrigger>
          </TabsList>

          <TabsContent value="directory" className="mt-4">
            <Directory data={data} onSelect={setSel} />
          </TabsContent>

          <TabsContent value="online" className="mt-4">
            <Card title="Active users" icon={<RadioTower className="size-4 text-emerald-400" />} actions={<ExportMenu rows={online} name="active-users" />}>
              {online.length === 0 ? <p className="text-xs text-muted-foreground p-4 text-center">No users currently active.</p>
                : <div className="divide-y divide-border/50 -mx-2 max-h-[640px] overflow-y-auto">{online.map((u) => <UserRow key={u.id} u={u} onClick={() => setSel(u)} />)}</div>}
            </Card>
          </TabsContent>

          <TabsContent value="inactive" className="mt-4 space-y-3">
            {buckets.map((b) => (
              <Card key={b.label} title={`Inactive ${b.label} · ${b.users.length}`} icon={<Clock className="size-4 text-amber-400" />} actions={b.users.length ? <ExportMenu rows={b.users} name={`inactive-${b.days}d`} /> : undefined}>
                {b.users.length === 0 ? <p className="text-[11px] text-muted-foreground">None.</p>
                  : <>
                      <p className="text-[11px] text-muted-foreground mb-2">Reactivation target — {b.users.filter((u) => u.ordersCount > 0).length} are past buyers worth {inr(b.users.reduce((x, u) => x + u.revenue, 0))} in lifetime revenue.</p>
                      <div className="divide-y divide-border/50 -mx-2 max-h-72 overflow-y-auto">{b.users.slice(0, 50).map((u) => <UserRow key={u.id} u={u} onClick={() => setSel(u)} />)}</div>
                    </>}
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <Card title="Staff directory" icon={<UserCog className="size-4 text-accent" />} actions={<ExportMenu rows={data.staff} name="staff" />}>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-xs">
                  <thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left p-2">Member</th><th className="text-left p-2">Role</th><th className="text-right p-2">Assigned</th><th className="text-right p-2">Resolved</th><th className="text-right p-2">Actions</th><th className="text-right p-2">Last active</th>
                  </tr></thead>
                  <tbody>
                    {data.staff.sort((a, b) => b.activityCount - a.activityCount).map((u) => (
                      <tr key={u.id} className="border-b border-border/40 hover:bg-muted/30 cursor-pointer" onClick={() => setSel(u)}>
                        <td className="p-2"><div className="flex items-center gap-2"><Avatar u={u} size={28} /><span className="font-medium">{u.name}</span></div></td>
                        <td className="p-2"><RoleBadge role={u.primaryRole} /></td>
                        <td className="p-2 text-right tabular-nums">{u.assignedTickets}</td>
                        <td className="p-2 text-right tabular-nums">{u.resolvedTickets}</td>
                        <td className="p-2 text-right tabular-nums">{u.activityCount}</td>
                        <td className="p-2 text-right text-muted-foreground">{timeAgo(u.lastActivityMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.staff.length === 0 && <p className="text-xs text-muted-foreground p-4 text-center">No staff found.</p>}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="mt-4">
            <Card title="AI user insights" icon={<Sparkles className="size-4 text-accent" />}>
              {data.insights.length === 0 ? <p className="text-xs text-muted-foreground p-4 text-center">No actionable insights right now.</p>
                : <div className="space-y-2 max-h-[640px] overflow-y-auto">
                    {data.insights.map((i) => (
                      <button key={i.id} onClick={() => setSel(i.user)} className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-border hover:border-accent/40 transition-colors">
                        <span className={`mt-0.5 size-2 rounded-full shrink-0 ${i.severity === "high" ? "bg-destructive" : i.severity === "medium" ? "bg-amber-400" : "bg-accent"}`} />
                        <div className="min-w-0"><p className="text-sm font-medium">{i.title}</p><p className="text-[11px] text-muted-foreground">{i.detail}</p></div>
                      </button>
                    ))}
                  </div>}
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-4 grid gap-3 lg:grid-cols-2">
            <Card title="Multi-country logins" icon={<ShieldAlert className="size-4 text-destructive" />}>
              {data.users.filter((u) => u.multiCountry).length === 0 ? <p className="text-[11px] text-muted-foreground">None detected.</p>
                : <div className="divide-y divide-border/50 -mx-2 max-h-80 overflow-y-auto">{data.users.filter((u) => u.multiCountry).map((u) => <UserRow key={u.id} u={u} onClick={() => setSel(u)} />)}</div>}
            </Card>
            <Card title="Multi-device usage" icon={<Smartphone className="size-4 text-amber-400" />}>
              {data.users.filter((u) => u.multiDevice).length === 0 ? <p className="text-[11px] text-muted-foreground">None detected.</p>
                : <div className="divide-y divide-border/50 -mx-2 max-h-80 overflow-y-auto">{data.users.filter((u) => u.multiDevice).map((u) => <UserRow key={u.id} u={u} onClick={() => setSel(u)} />)}</div>}
            </Card>
            <Card title="Admin access history" icon={<UserCog className="size-4 text-accent" />} className="lg:col-span-2">
              <div className="divide-y divide-border/50 -mx-2 max-h-80 overflow-y-auto">
                {data.staff.filter((u) => u.lastAdminAction).sort((a, b) => (b.lastAdminAction ?? 0) - (a.lastAdminAction ?? 0)).map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2"><Avatar u={u} size={28} /><span className="text-sm">{u.name}</span><RoleBadge role={u.primaryRole} /></div>
                    <span className="text-[11px] text-muted-foreground">{u.activityCount} actions · {timeAgo(u.lastAdminAction != null ? Date.now() - u.lastAdminAction : null)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="map" className="mt-4 grid gap-3 lg:grid-cols-2">
            <Card title="Region distribution" icon={<Globe className="size-4 text-accent" />}>
              <div className="space-y-3">
                {regions.map((r) => (
                  <div key={r.region}>
                    <div className="flex justify-between text-xs mb-1"><span className="capitalize">{r.region}</span><span className="text-muted-foreground">{r.users} users · {inr(r.revenue)}</span></div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${s.total ? (r.users / s.total) * 100 : 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Top countries" icon={<MapPin className="size-4 text-accent" />}>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {countries.map((c) => (
                  <div key={c.country} className="flex items-center justify-between text-xs">
                    <span>{c.country}</span>
                    <span className="text-muted-foreground tabular-nums">{c.users} · {inr(c.revenue)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {sel && <UserDetail u={sel} onClose={() => setSel(null)} />}
    </AdminShell>
  );
}
