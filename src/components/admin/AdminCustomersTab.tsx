import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Users, Mail, Phone, ShoppingBag, LifeBuoy } from "lucide-react";
import { getAdminCustomersFn, type AdminCustomer } from "@/lib/customer-center.functions";

const money = (v: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v) || 0);
const dateOnly = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");

const STATUS_TONE: Record<AdminCustomer["status"], string> = {
  active: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  paying: "text-sky-400 border-sky-500/30 bg-sky-500/10",
  registered: "text-muted-foreground border-white/15 bg-white/5",
};
const STATUS_LABEL: Record<AdminCustomer["status"], string> = {
  active: "Active",
  paying: "Customer",
  registered: "Registered",
};

function Avatar({ c }: { c: AdminCustomer }) {
  const initials = (c.full_name || c.email || "?").trim().slice(0, 1).toUpperCase();
  if (c.avatar_url) {
    return <img src={c.avatar_url} alt="" className="size-9 rounded-full object-cover border border-white/10" loading="lazy" />;
  }
  return (
    <span className="size-9 rounded-full grid place-items-center bg-accent/15 text-accent text-xs font-bold border border-accent/20">
      {initials}
    </span>
  );
}

export function AdminCustomersTab() {
  const listFn = useServerFn(getAdminCustomersFn);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminCustomer[] | null>(null);
  const [total, setTotal] = useState(0);
  const reqId = useRef(0);

  useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    if (id === reqId.current) setRows((p) => p);
    try {
      const res = await listFn({ data: { search: search || undefined } });
      if (id !== reqId.current) return;
      setRows(res.customers ?? []);
      setTotal(res.total ?? 0);
    } catch {
      if (id === reqId.current) { setRows([]); setTotal(0); }
    }
  }, [listFn, search]);

  useEffect(() => { setRows(null); load(); }, [load]);

  const paying = useMemo(() => (rows ?? []).filter((c) => c.total_orders > 0).length, [rows]);

  if (rows === null) {
    return <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Users className="size-3.5 text-accent" /> {total} customers</span>
          <span className="inline-flex items-center gap-1.5"><ShoppingBag className="size-3.5 text-emerald-400" /> {paying} paying</span>
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone…"
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-accent/40"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No customers found.</p>
      ) : (
        <div className="card-premium rounded-2xl overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-5 py-3">Customer</th>
                  <th className="text-left px-5 py-3">Phone</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Orders</th>
                  <th className="text-right px-5 py-3">Spent</th>
                  <th className="text-right px-5 py-3">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-accent/5">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar c={c} />
                        <div className="min-w-0">
                          <div className="truncate max-w-[200px] font-medium">{c.full_name || "—"}</div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{c.email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{c.phone || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono ${STATUS_TONE[c.status]}`}>
                        {STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs tabular-nums">{c.total_orders}</td>
                    <td className="px-5 py-3 text-right font-mono text-accent">{money(c.lifetime_spend)}</td>
                    <td className="px-5 py-3 text-right text-[11px] font-mono text-muted-foreground">{dateOnly(c.last_active)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border/40">
            {rows.map((c) => (
              <div key={c.id} className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar c={c} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate">{c.full_name || c.email || "Customer"}</span>
                      <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono ${STATUS_TONE[c.status]}`}>
                        {STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    {c.email && <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate"><Mail className="size-3" /> {c.email}</div>}
                    {c.phone && <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Phone className="size-3" /> {c.phone}</div>}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><ShoppingBag className="size-3" /> {c.total_orders}</span>
                  <span className="font-mono text-accent">{money(c.lifetime_spend)}</span>
                  {c.open_tickets > 0 && <span className="inline-flex items-center gap-1 text-amber-400"><LifeBuoy className="size-3" /> {c.open_tickets}</span>}
                  <span className="ml-auto">{dateOnly(c.last_active)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
