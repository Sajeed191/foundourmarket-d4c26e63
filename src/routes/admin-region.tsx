import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Globe, Loader2, Check, X, ArrowRightLeft } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  adminListCustomerRegions,
  adminListRegionRequests,
  adminSetUserRegion,
  adminReviewRegionRequest,
} from "@/lib/region-admin.functions";
import { getCheckoutRegionDebug } from "@/lib/region.functions";

export const Route = createFileRoute("/admin-region")({
  head: () => ({ meta: [{ title: "Region Management — FoundOurMarket™" }] }),
  component: AdminRegionPage,
});

type Region = "india" | "international";

function Pill({ region }: { region: string | null }) {
  const india = region === "india";
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${
        india
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-border bg-white/[0.03] text-muted-foreground"
      }`}
    >
      {region ? (india ? "🇮🇳 India" : "🌍 International") : "—"}
    </span>
  );
}

/** Human-readable label for how the region was locked + which signals drove it. */
const METHOD_LABELS: Record<string, string> = {
  self: "Self / auto-detected",
  admin: "Admin override",
  support_approval: "Support approval",
};
const SOURCE_LABELS: Record<string, string> = {
  "geo-ip+signals": "Geo-IP + device signals",
  signals: "Device signals only",
};
const TIER_LABELS: Record<string, string> = {
  auto: "Auto-applied",
  confirm: "One-tap confirmed",
  pick: "Manual picker",
};

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
        No data
      </span>
    );
  }
  const tone =
    value >= 90
      ? "border-accent/30 bg-accent/10 text-accent"
      : value >= 70
        ? "border-amber-400/30 bg-amber-400/10 text-amber-400"
        : "border-destructive/30 bg-destructive/10 text-destructive";
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${tone}`}
      title="Blended detection confidence across IP, timezone, locale, currency & history"
    >
      {Math.round(value)}% confidence
    </span>
  );
}

function AdminRegionPage() {
  const listCustomers = useServerFn(adminListCustomerRegions);
  const listRequests = useServerFn(adminListRegionRequests);
  const setRegion = useServerFn(adminSetUserRegion);
  const review = useServerFn(adminReviewRegionRequest);

  const [tab, setTab] = useState<"customers" | "requests">("requests");
  const [customers, setCustomers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([
        listCustomers({ data: { search: search || null, region: "all", limit: 50 } }),
        listRequests(),
      ]);
      setCustomers(c.customers);
      setRequests(r.requests);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load region data.");
    } finally {
      setLoading(false);
    }
  }, [listCustomers, listRequests, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function override(userId: string, region: Region) {
    const reason = window.prompt(`Reason for setting region to ${region}?`)?.trim();
    if (!reason) return;
    setBusy(userId);
    try {
      await setRegion({ data: { targetUserId: userId, region, reason } });
      toast.success("Region updated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change region.");
    } finally {
      setBusy(null);
    }
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    const note = window.prompt(`Note for this ${decision} decision (optional):`) ?? "";
    setBusy(id);
    try {
      const res = await review({ data: { requestId: id, decision, note } });
      if ((res as any).ok === false) toast.error((res as any).reason);
      else toast.success(`Request ${decision}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not review request.");
    } finally {
      setBusy(null);
    }
  }

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <AdminShell title="Region Management">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <Globe className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-display font-semibold tracking-tight">Region Management</h1>
            <p className="text-sm text-muted-foreground">
              Override customer regions and review change requests. All changes are audited.
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          {(["requests", "customers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl border px-3.5 py-2 text-[11px] font-mono uppercase tracking-widest transition-all ${
                tab === t
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:border-accent/40"
              }`}
            >
              {t === "requests" ? `Requests${pending.length ? ` · ${pending.length}` : ""}` : "Customers"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : tab === "requests" ? (
          <div className="space-y-2.5">
            {requests.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No region requests.</p>
            )}
            {requests.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.full_name}</span>
                  <Pill region={r.current_region} />
                  <ArrowRightLeft className="size-3.5 text-muted-foreground" />
                  <Pill region={r.requested_region} />
                  <span
                    className={`ml-auto rounded-md px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${
                      r.status === "pending"
                        ? "bg-amber-400/10 text-amber-400"
                        : r.status === "approved"
                          ? "bg-accent/10 text-accent"
                          : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{r.reason}</p>
                {r.review_note && (
                  <p className="mt-1 text-xs text-muted-foreground/80">Note: {r.review_note}</p>
                )}
                {r.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={busy === r.id}
                      onClick={() => decide(r.id, "approved")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:brightness-110 disabled:opacity-60"
                    >
                      <Check className="size-3.5" /> Approve
                    </button>
                    <button
                      disabled={busy === r.id}
                      onClick={() => decide(r.id, "rejected")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-60"
                    >
                      <X className="size-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="mb-3 w-full rounded-2xl border border-border bg-background/60 px-3.5 py-2.5 text-sm outline-none focus:border-accent"
            />
            <div className="space-y-2">
              {customers.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-border bg-background/60 p-3.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.full_name ?? "—"}</span>
                    <Pill region={c.market_region} />
                    {c.currency && (
                      <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {c.currency}
                      </span>
                    )}
                    {(c.detectedCountry || c.country_code) && (
                      <span className="text-[10px] font-mono uppercase text-muted-foreground/70">
                        {c.detectedCountry || c.country_code}
                      </span>
                    )}
                    <ConfidenceBadge value={c.confidence ?? null} />
                    <div className="ml-auto flex gap-1.5">
                      {(["india", "international"] as const).map((rg) => (
                        <button
                          key={rg}
                          disabled={busy === c.id || c.market_region === rg}
                          onClick={() => override(c.id, rg)}
                          className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider hover:border-accent/40 disabled:opacity-40"
                        >
                          {rg === "india" ? "Set 🇮🇳" : "Set 🌍"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                      <span className="text-muted-foreground/60">Method: </span>
                      {c.assignmentMethod ? METHOD_LABELS[c.assignmentMethod] ?? c.assignmentMethod : "—"}
                    </span>
                    <span>
                      <span className="text-muted-foreground/60">Signals: </span>
                      {c.detectionSource ? SOURCE_LABELS[c.detectionSource] ?? c.detectionSource : "—"}
                    </span>
                    {c.detectionTier && (
                      <span>
                        <span className="text-muted-foreground/60">UX tier: </span>
                        {TIER_LABELS[c.detectionTier] ?? c.detectionTier}
                      </span>
                    )}
                  </div>

                  {c.detectionReasons && c.detectionReasons.length > 0 && (
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
                      {c.detectionReasons.join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
