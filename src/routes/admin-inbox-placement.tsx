import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, RefreshCw, Send, MailCheck, ShieldCheck, AlertTriangle, Inbox,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  getSeedInboxes, createPlacementTest, classifyPlacementTest, listPlacementTests,
} from "@/lib/inbox-placement.functions";

export const Route = createFileRoute("/admin-inbox-placement")({
  head: () => ({ meta: [{ title: "Inbox placement — Admin" }] }),
  component: InboxPlacementPage,
});

type Placement = string | null;

const GOOD = "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20";
const WARN = "text-amber-400 bg-amber-400/10 ring-amber-400/20";
const BAD = "text-destructive bg-destructive/10 ring-destructive/20";
const NEUTRAL = "text-muted-foreground bg-white/5 ring-white/10";

function placementStyle(p: Placement): string {
  if (!p || p === "pending") return NEUTRAL;
  if (["primary", "focused"].includes(p)) return GOOD;
  if (["spam", "junk", "missing", "trash"].includes(p)) return BAD;
  return WARN;
}

const PLACEMENT_LABEL: Record<string, string> = {
  pending: "Pending",
  primary: "Primary inbox",
  promotions: "Promotions",
  social: "Social",
  updates: "Updates",
  forums: "Forums",
  spam: "Spam",
  trash: "Trash",
  archive: "Archived",
  focused: "Focused inbox",
  other: "Other inbox",
  junk: "Junk",
  missing: "Not delivered",
};

function plabel(p: Placement) {
  if (!p) return "—";
  return PLACEMENT_LABEL[p] ?? p;
}

function PlacementBadge({ provider, value }: { provider: string; value: Placement }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 ring-1 ring-inset ${placementStyle(value)}`}>
      <span className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-70">{provider}</span>
      <span className="text-xs font-medium">{plabel(value)}</span>
    </div>
  );
}

function InboxPlacementPage() {
  const fetchSeeds = useServerFn(getSeedInboxes);
  const create = useServerFn(createPlacementTest);
  const classify = useServerFn(classifyPlacementTest);
  const list = useServerFn(listPlacementTests);
  const qc = useQueryClient();

  const [gmail, setGmail] = useState("");
  const [outlook, setOutlook] = useState("");

  const seeds = useQuery({ queryKey: ["seed-inboxes"], queryFn: () => fetchSeeds(undefined), staleTime: 5 * 60_000 });
...
  const tests = useQuery({ queryKey: ["placement-tests"], queryFn: () => list({ data: { limit: 25 } }), staleTime: 60_000 });

  const runTest = useMutation({
    mutationFn: () =>
      create({ data: { gmailAddress: gmail || null, outlookAddress: outlook || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["placement-tests"] });
    },
  });

  const checkTest = useMutation({
    mutationFn: (id: string) => classify({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["placement-tests"] });
    },
  });

  const rows = tests.data?.tests ?? [];
  const completed = rows.filter((r) => r.status === "completed");
  const passing = completed.filter(
    (r) =>
      (!r.gmail_address || r.gmail_placement === "primary") &&
      (!r.outlook_address || r.outlook_placement === "focused"),
  ).length;

  return (
    <AdminShell
      title="Inbox placement"
      subtitle="Validate that your emails reach the primary inbox across Gmail and Outlook."
      allow={["admin", "super_admin", "manager"]}
    >
      <div className="grid gap-5">
        {/* Run a new test */}
        <section className="rounded-2xl border border-border/40 bg-white/[0.02] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Send className="size-4 text-accent" />
            <h2 className="text-sm font-display">Run a placement test</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4 max-w-2xl">
            A tagged email is sent through your live sending domain ({" "}
            <span className="font-mono text-foreground">notify.foundourmarket.com</span>) to each
            seed inbox below. Wait ~30s for delivery, then check placement.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Gmail seed inbox {seeds.data?.gmail.connected ? "✓ connected" : ""}
              </span>
              <input
                value={gmail}
                onChange={(e) => setGmail(e.target.value)}
                placeholder="name@gmail.com"
                className="mt-1.5 w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent/40"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Outlook seed inbox {seeds.data?.outlook.connected ? "✓ connected" : ""}
              </span>
              <input
                value={outlook}
                onChange={(e) => setOutlook(e.target.value)}
                placeholder="name@outlook.com"
                className="mt-1.5 w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent/40"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => runTest.mutate()}
              disabled={runTest.isPending || (!gmail && !outlook)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-primary px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50 transition-opacity"
            >
              {runTest.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send test emails
            </button>
            {runTest.isError && (
              <span className="text-xs text-destructive">{(runTest.error as Error).message}</span>
            )}
            {runTest.isSuccess && (
              <span className="text-xs text-emerald-400">
                Sent — check placement in ~30s below.
              </span>
            )}
          </div>
        </section>

        {/* Summary */}
        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border/40 bg-white/[0.02] px-4 py-3">
            <p className="text-xl font-display">{rows.length}</p>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-1">Tests run</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-white/[0.02] px-4 py-3">
            <p className="text-xl font-display text-emerald-400">{passing}</p>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-1">Reached primary</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-white/[0.02] px-4 py-3">
            <p className="text-xl font-display text-amber-400">{completed.length - passing}</p>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-1">Needs attention</p>
          </div>
        </section>

        {/* Results */}
        <section className="rounded-2xl border border-border/40 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Inbox className="size-4 text-accent" />
              <h2 className="text-sm font-display">Test results</h2>
            </div>
            <button
              onClick={() => tests.refetch()}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={`size-3.5 ${tests.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {tests.isLoading ? (
            <div className="grid place-items-center py-12">
              <Loader2 className="size-5 animate-spin text-accent" />
            </div>
          ) : rows.length === 0 ? (
            <div className="grid place-items-center py-12 text-center">
              <MailCheck className="size-6 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No tests yet. Run one above to get started.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-border/40 bg-white/[0.015] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-foreground truncate">{r.token}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                    {r.error && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-destructive">
                        <AlertTriangle className="size-3" /> {r.error}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.gmail_address && <PlacementBadge provider="Gmail" value={r.gmail_placement} />}
                    {r.outlook_address && <PlacementBadge provider="Outlook" value={r.outlook_placement} />}
                    <button
                      onClick={() => checkTest.mutate(r.id)}
                      disabled={checkTest.isPending && checkTest.variables === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs hover:border-accent/40 disabled:opacity-50 transition-colors"
                    >
                      {checkTest.isPending && checkTest.variables === r.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="size-3.5" />
                      )}
                      Check placement
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
