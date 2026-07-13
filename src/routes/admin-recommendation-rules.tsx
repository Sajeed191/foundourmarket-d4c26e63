import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2, ArrowUpCircle, ArrowDownCircle, Ban, Save } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  listAllRules,
  upsertRule as upsertRuleFn,
  deleteRule as deleteRuleFn,
} from "@/lib/recommendations/rules.functions";
import type { BusinessRule, RuleKind, RuleTargetType } from "@/lib/recommendations/rules";

export const Route = createFileRoute("/admin-recommendation-rules")({
  head: () => ({ meta: [{ title: "Recommendation Rules — Admin" }] }),
  component: RecommendationRulesPage,
});

const KINDS: { kind: RuleKind; label: string; icon: typeof ArrowUpCircle; hint: string }[] = [
  { kind: "boost", label: "Boost", icon: ArrowUpCircle, hint: "Promote matching products in recommendations" },
  { kind: "reduce", label: "Reduce", icon: ArrowDownCircle, hint: "De-emphasize matching products" },
  { kind: "exclude", label: "Exclude", icon: Ban, hint: "Never recommend matching products" },
];

const SIGNAL_TARGETS: RuleTargetType[] = [
  "new_arrivals", "high_margin", "fast_shipping", "local_seller", "featured", "sustainable",
  "low_inventory", "poor_reviews", "high_returns", "slow_delivery",
];
const VALUE_TARGETS: RuleTargetType[] = ["brand", "category", "product", "seller"];
const ALL_TARGETS = [...SIGNAL_TARGETS, ...VALUE_TARGETS];

function targetLabel(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type Draft = {
  target_type: RuleTargetType;
  target_value: string;
  weight: number;
  priority: number;
  starts_at: string;
  ends_at: string;
};

const emptyDraft: Draft = {
  target_type: "new_arrivals",
  target_value: "",
  weight: 2,
  priority: 100,
  starts_at: "",
  ends_at: "",
};

function RecommendationRulesPage() {
  const load = useServerFn(listAllRules);
  const save = useServerFn(upsertRuleFn);
  const remove = useServerFn(deleteRuleFn);

  const [rules, setRules] = useState<BusinessRule[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [openKind, setOpenKind] = useState<RuleKind | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const refresh = useCallback(() => {
    load().then((r) => setRules(r as BusinessRule[])).catch(() => setRules([]));
  }, [load]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grouped = useMemo(() => {
    const g: Record<RuleKind, BusinessRule[]> = { boost: [], reduce: [], exclude: [] };
    for (const r of rules ?? []) g[r.rule_kind]?.push(r);
    return g;
  }, [rules]);

  const addRule = async (kind: RuleKind) => {
    setBusy(true);
    try {
      await save({
        data: {
          rule_kind: kind,
          target_type: draft.target_type,
          target_value: VALUE_TARGETS.includes(draft.target_type) ? draft.target_value.trim() || null : null,
          weight: kind === "exclude" ? 0 : draft.weight,
          priority: draft.priority,
          enabled: true,
          starts_at: draft.starts_at || null,
          ends_at: draft.ends_at || null,
        },
      });
      setOpenKind(null);
      setDraft(emptyDraft);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r: BusinessRule) => {
    await save({
      data: {
        id: r.id,
        rule_kind: r.rule_kind,
        target_type: r.target_type,
        target_value: r.target_value,
        weight: r.weight,
        priority: r.priority,
        enabled: !r.enabled,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
      },
    });
    refresh();
  };

  const updateWeight = async (r: BusinessRule, weight: number) => {
    setRules((prev) => (prev ? prev.map((x) => (x.id === r.id ? { ...x, weight } : x)) : prev));
  };
  const commitWeight = async (r: BusinessRule, weight: number) => {
    await save({
      data: {
        id: r.id, rule_kind: r.rule_kind, target_type: r.target_type, target_value: r.target_value,
        weight, priority: r.priority, enabled: r.enabled, starts_at: r.starts_at, ends_at: r.ends_at,
      },
    });
    refresh();
  };

  const del = async (id: string) => {
    await remove({ data: { id } });
    refresh();
  };

  return (
    <AdminShell
      title="Recommendation Rules"
      subtitle="Guide the recommendation engine — boost, reduce, or exclude products without touching the model"
      allow={["admin", "super_admin"]}
    >
      {rules === null ? (
        <div className="p-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {KINDS.map(({ kind, label, icon: Icon, hint }) => (
            <div key={kind} className="card-premium rounded-2xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`size-4 ${kind === "boost" ? "text-emerald-400" : kind === "reduce" ? "text-amber-400" : "text-destructive"}`} />
                  <div>
                    <h2 className="text-sm font-medium">{label}</h2>
                    <p className="text-[10px] text-muted-foreground">{hint}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setOpenKind(openKind === kind ? null : kind); setDraft(emptyDraft); }}
                  className="text-accent hover:text-accent/80 transition"
                  aria-label={`Add ${label} rule`}
                >
                  <Plus className="size-4" />
                </button>
              </div>

              {openKind === kind && (
                <div className="px-5 py-4 border-b border-border space-y-3 bg-muted/20">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Target</label>
                  <select
                    value={draft.target_type}
                    onChange={(e) => setDraft((d) => ({ ...d, target_type: e.target.value as RuleTargetType }))}
                    className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm"
                  >
                    {ALL_TARGETS.map((t) => (
                      <option key={t} value={t}>{targetLabel(t)}</option>
                    ))}
                  </select>
                  {VALUE_TARGETS.includes(draft.target_type) && (
                    <input
                      value={draft.target_value}
                      onChange={(e) => setDraft((d) => ({ ...d, target_value: e.target.value }))}
                      placeholder={draft.target_type === "product" ? "product slug" : `${targetLabel(draft.target_type)} name`}
                      className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm"
                    />
                  )}
                  {kind !== "exclude" && (
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Weight: {draft.weight}</label>
                      <input type="range" min={0} max={10} step={0.5} value={draft.weight}
                        onChange={(e) => setDraft((d) => ({ ...d, weight: Number(e.target.value) }))} className="w-full" />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Priority</label>
                      <input type="number" value={draft.priority}
                        onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
                        className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Start</label>
                      <input type="date" value={draft.starts_at}
                        onChange={(e) => setDraft((d) => ({ ...d, starts_at: e.target.value }))}
                        className="w-full rounded-lg bg-background border border-border px-2 py-2 text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">End</label>
                      <input type="date" value={draft.ends_at}
                        onChange={(e) => setDraft((d) => ({ ...d, ends_at: e.target.value }))}
                        className="w-full rounded-lg bg-background border border-border px-2 py-2 text-xs" />
                    </div>
                  </div>
                  <button
                    disabled={busy || (VALUE_TARGETS.includes(draft.target_type) && !draft.target_value.trim())}
                    onClick={() => addRule(kind)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Add rule
                  </button>
                </div>
              )}

              <div className="divide-y divide-border flex-1">
                {grouped[kind].length === 0 ? (
                  <div className="px-5 py-8 text-center text-xs text-muted-foreground">No {label.toLowerCase()} rules yet.</div>
                ) : (
                  grouped[kind].map((r) => (
                    <div key={r.id} className={`px-5 py-3 ${r.enabled ? "" : "opacity-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm truncate">
                            {targetLabel(r.target_type)}
                            {r.target_value ? <span className="text-muted-foreground"> · {r.target_value}</span> : null}
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            priority {r.priority}
                            {r.starts_at || r.ends_at ? ` · ${r.starts_at?.slice(0, 10) ?? "…"} → ${r.ends_at?.slice(0, 10) ?? "…"}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => toggle(r)} className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${r.enabled ? "border-emerald-400/40 text-emerald-400" : "border-border text-muted-foreground"}`}>
                            {r.enabled ? "ON" : "OFF"}
                          </button>
                          <button onClick={() => del(r.id)} className="text-muted-foreground hover:text-destructive transition" aria-label="Delete rule">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                      {kind !== "exclude" && (
                        <input
                          type="range" min={0} max={10} step={0.5} value={r.weight}
                          onChange={(e) => updateWeight(r, Number(e.target.value))}
                          onMouseUp={(e) => commitWeight(r, Number((e.target as HTMLInputElement).value))}
                          onTouchEnd={(e) => commitWeight(r, Number((e.target as HTMLInputElement).value))}
                          className="w-full mt-2"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
