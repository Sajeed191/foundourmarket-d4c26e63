import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Shield, ShieldOff, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Newsletter Security Panel — Stage 2.
 * Feature flags + configurable limits + active IP blocks + spam analytics.
 * All reads/writes are RLS-protected: staff read, admin/manager update.
 */

type Settings = {
  honeypot_enabled: boolean;
  disposable_check_enabled: boolean;
  rate_limit_enabled: boolean;
  auto_block_enabled: boolean;
  timing_floor_enabled: boolean;
  fingerprint_enabled: boolean;
  burst_seconds: number;
  burst_limit: number;
  hour_limit: number;
  day_limit: number;
  min_submit_ms: number;
  abuse_threshold: number;
  block_minutes: number;
};

type BlockRow = {
  id: string;
  ip_hash: string;
  reason: string;
  score: number;
  created_at: string;
  expires_at: string;
  cleared_at: string | null;
};

type AttemptStats = { outcome: string; count: number };

const DEFAULTS: Settings = {
  honeypot_enabled: true,
  disposable_check_enabled: true,
  rate_limit_enabled: true,
  auto_block_enabled: true,
  timing_floor_enabled: true,
  fingerprint_enabled: true,
  burst_seconds: 10,
  burst_limit: 1,
  hour_limit: 3,
  day_limit: 10,
  min_submit_ms: 750,
  abuse_threshold: 50,
  block_minutes: 60,
};

const FLAGS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: "honeypot_enabled", label: "Honeypot", hint: "Silently reject bots that fill hidden fields." },
  { key: "disposable_check_enabled", label: "Disposable email block", hint: "Refuse throwaway providers." },
  { key: "rate_limit_enabled", label: "Rate limiting", hint: "Tri-layer burst / hour / day per IP." },
  { key: "auto_block_enabled", label: "Auto IP block", hint: "Temporary block on abuse threshold." },
  { key: "timing_floor_enabled", label: "Submit-timing floor", hint: "Reject sub-750ms submissions." },
  { key: "fingerprint_enabled", label: "Fingerprint capture", hint: "Log IP-hash, UA, language, timezone." },
];

const NUMBERS: { key: keyof Settings; label: string; suffix?: string; min?: number; max?: number }[] = [
  { key: "burst_seconds", label: "Burst window", suffix: "s", min: 1, max: 300 },
  { key: "burst_limit", label: "Burst limit", min: 1, max: 20 },
  { key: "hour_limit", label: "Per hour", min: 1, max: 100 },
  { key: "day_limit", label: "Per day", min: 1, max: 500 },
  { key: "min_submit_ms", label: "Min submit", suffix: "ms", min: 0, max: 10000 },
  { key: "abuse_threshold", label: "Abuse threshold", min: 10, max: 500 },
  { key: "block_minutes", label: "Block duration", suffix: "min", min: 1, max: 10080 },
];

export function NewsletterSecurityPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Settings | null>(null);

  const settingsQ = useQuery({
    queryKey: ["admin", "newsletter-security-settings"],
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase
        .from("newsletter_security_settings" as never)
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return { ...DEFAULTS, ...(data as Partial<Settings> | null ?? {}) };
    },
    staleTime: 30_000,
  });

  const blocksQ = useQuery({
    queryKey: ["admin", "newsletter-ip-blocks"],
    queryFn: async (): Promise<BlockRow[]> => {
      const { data, error } = await supabase
        .from("newsletter_ip_blocks" as never)
        .select("id,ip_hash,reason,score,created_at,expires_at,cleared_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as BlockRow[]) ?? [];
    },
    staleTime: 30_000,
  });

  const attemptsQ = useQuery({
    queryKey: ["admin", "newsletter-attempt-stats"],
    queryFn: async (): Promise<AttemptStats[]> => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("newsletter_submission_attempts" as never)
        .select("outcome")
        .gte("created_at", since)
        .limit(10000);
      if (error) throw error;
      const rows = (data as unknown as { outcome: string }[]) ?? [];
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
      return Array.from(counts, ([outcome, count]) => ({ outcome, count }))
        .sort((a, b) => b.count - a.count);
    },
    staleTime: 30_000,
  });

  const value = draft ?? settingsQ.data ?? DEFAULTS;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(settingsQ.data ?? DEFAULTS);

  const saveMut = useMutation({
    mutationFn: async (next: Settings) => {
      const { error } = await supabase
        .from("newsletter_security_settings" as never)
        .update({ ...next, updated_at: new Date().toISOString() } as never)
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Security settings saved.");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin", "newsletter-security-settings"] });
    },
    onError: () => toast.error("Couldn't save settings. Check your role."),
  });

  const clearMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("newsletter_ip_blocks" as never)
        .update({ cleared_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Block cleared.");
      qc.invalidateQueries({ queryKey: ["admin", "newsletter-ip-blocks"] });
    },
    onError: () => toast.error("Couldn't clear block."),
  });

  const spamCount = useMemo(() => {
    const rows = attemptsQ.data ?? [];
    const bad = new Set(["honeypot", "disposable", "rate_limited", "blocked", "timing", "invalid"]);
    return rows.filter((r) => bad.has(r.outcome)).reduce((s, r) => s + r.count, 0);
  }, [attemptsQ.data]);
  const legitCount = useMemo(() => {
    const rows = attemptsQ.data ?? [];
    return rows.filter((r) => r.outcome === "accepted" || r.outcome === "duplicate")
      .reduce((s, r) => s + r.count, 0);
  }, [attemptsQ.data]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setDraft({ ...value, [k]: v });

  const activeBlocks = (blocksQ.data ?? []).filter(
    (b) => !b.cleared_at && new Date(b.expires_at) > new Date(),
  );

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-accent" />
          <h2 className="text-sm font-semibold">Security & Anti-Spam</h2>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <span>Legit 7d: <b className="text-foreground">{legitCount}</b></span>
          <span>Spam 7d: <b className="text-destructive">{spamCount}</b></span>
          <span>Active blocks: <b className="text-foreground">{activeBlocks.length}</b></span>
        </div>
      </div>

      {settingsQ.isLoading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          <Loader2 className="mx-auto mb-2 size-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {/* Feature flags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {FLAGS.map((f) => (
              <label
                key={f.key}
                className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 cursor-pointer hover:bg-white/[0.04] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={value[f.key] as boolean}
                  onChange={(e) => set(f.key, e.target.checked as never)}
                  className="mt-1 accent-accent"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{f.label}</div>
                  <div className="text-[11px] text-muted-foreground">{f.hint}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Numeric limits */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {NUMBERS.map((n) => (
              <label key={n.key} className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span>{n.label}{n.suffix ? ` (${n.suffix})` : ""}</span>
                <input
                  type="number"
                  min={n.min}
                  max={n.max}
                  value={value[n.key] as number}
                  onChange={(e) => set(n.key, Math.max(n.min ?? 0, Number(e.target.value) || 0) as never)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground font-sans normal-case tracking-normal focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 mb-6">
            {dirty && (
              <button
                onClick={() => setDraft(null)}
                className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-widest"
              >
                Reset
              </button>
            )}
            <button
              onClick={() => draft && saveMut.mutate(draft)}
              disabled={!dirty || saveMut.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-2 text-xs uppercase tracking-widest font-bold disabled:opacity-40"
            >
              {saveMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
              Save
            </button>
          </div>

          {/* Active IP blocks */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldOff className="size-3.5 text-muted-foreground" />
              <h3 className="text-xs font-semibold">Active IP blocks</h3>
            </div>
            {blocksQ.isLoading ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
            ) : activeBlocks.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground border border-dashed border-white/10 rounded-lg">
                No active blocks.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-white/[0.02] text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">IP hash</th>
                      <th className="text-left px-3 py-2">Reason</th>
                      <th className="text-right px-3 py-2">Score</th>
                      <th className="text-left px-3 py-2">Expires</th>
                      <th className="text-right px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBlocks.map((b) => (
                      <tr key={b.id} className="border-t border-white/5">
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                          {b.ip_hash.slice(0, 12)}…
                        </td>
                        <td className="px-3 py-2">{b.reason}</td>
                        <td className="px-3 py-2 text-right">{b.score}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(b.expires_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => clearMut.mutate(b.id)}
                            disabled={clearMut.isPending}
                            className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-widest hover:bg-white/5 disabled:opacity-40"
                          >
                            Clear
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
