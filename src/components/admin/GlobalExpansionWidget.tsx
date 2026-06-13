import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, MapPin, Package } from "lucide-react";
import { CollapsibleModule } from "@/components/admin/CollapsibleModule";
import { getGlobalExpansionStats } from "@/lib/global-beta.functions";

export function GlobalExpansionWidget() {
  const fetchStats = useServerFn(getGlobalExpansionStats);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "global-expansion-stats"],
    queryFn: () => fetchStats(),
    staleTime: 60_000,
  });

  return (
    <CollapsibleModule
      eyebrow="International"
      title="Global Expansion"
      sectionId="dash-global-expansion"
    >
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-muted-foreground">Could not load global expansion metrics.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Metric
              icon={<Users className="size-4" />}
              label="Waitlist"
              value={data.interestCount}
            />
            <Metric
              icon={<MapPin className="size-4" />}
              label="Countries"
              value={data.countries.length}
            />
            <Metric
              icon={<Package className="size-4" />}
              label="Demo Orders"
              value={data.demoOrders}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Panel title="Countries Waiting">
              {data.countries.length === 0 ? (
                <Empty>No interest captured yet.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {data.countries.slice(0, 6).map((c) => (
                    <li key={c.country} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{c.country}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Top Requested Products">
              {data.topProducts.length === 0 ? (
                <Empty>No demo orders yet.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {data.topProducts.map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{p.name}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{p.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </CollapsibleModule>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-cyan-400 mb-1.5">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-display font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2.5">{title}</p>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
