import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileEdit, History, AlertCircle, RotateCcw, Loader2 } from "lucide-react";
import { CollapsibleModule } from "@/components/admin/CollapsibleModule";
import {
  fetchMyDrafts,
  fetchRecentVersions,
  type EditorDraft,
  type EntityVersion,
} from "@/lib/drafts";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

function rel(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TYPE_LABEL = (t: string) =>
  t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Dashboard widget surfacing the universal autosave/versioning ecosystem:
 * recent drafts (recovery queue), pending unsynced changes, and the latest
 * version edits/restores across every entity.
 */
export function DraftActivityWidget() {
  const [drafts, setDrafts] = useState<EditorDraft[]>([]);
  const [versions, setVersions] = useState<EntityVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [d, v] = await Promise.all([
          fetchMyDrafts(8).catch(() => []),
          fetchRecentVersions(8).catch(() => []),
        ]);
        if (!active) return;
        setDrafts(d);
        setVersions(v);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const ch = supabase
      .channel("dash-draft-activity")
      .on("postgres_changes", { event: "*", schema: "public", table: "editor_drafts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "entity_versions" }, () => load())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(ch);
    };
  }, []);

  const pending = drafts.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <CollapsibleModule
        eyebrow="Save protection"
        title={`Recent drafts${pending ? ` · ${pending} pending` : ""}`}
      >
        {loading ? (
          <div className="grid place-items-center py-6 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : drafts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No recoverable drafts — everything is saved.
          </p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5"
              >
                <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-amber-500/30 text-amber-400">
                  <FileEdit className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {TYPE_LABEL(d.entity_type)}
                    <span className="ml-1 text-muted-foreground">
                      {d.entity_id === "new" ? "(new)" : `#${d.entity_id.slice(0, 8)}`}
                    </span>
                  </p>
                  <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                    {d.device_label ?? "Draft"} · {rel(d.updated_at)}
                  </p>
                </div>
                <AlertCircle className="size-3.5 shrink-0 text-amber-400" />
              </li>
            ))}
          </ul>
        )}
      </CollapsibleModule>

      <CollapsibleModule eyebrow="Version history" title="Latest edits & restores">
        {loading ? (
          <div className="grid place-items-center py-6 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : versions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No version history yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => {
              const restore = (v.summary ?? "").toLowerCase().includes("restore");
              return (
                <li
                  key={v.id}
                  className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-2.5"
                >
                  <div
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg border",
                      restore
                        ? "border-emerald-500/30 text-emerald-400"
                        : "border-white/10 text-muted-foreground",
                    )}
                  >
                    {restore ? <RotateCcw className="size-3.5" /> : <History className="size-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {TYPE_LABEL(v.entity_type)}
                      <span className="ml-1 text-muted-foreground">{v.summary ?? "Version saved"}</span>
                    </p>
                    <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                      {v.changed_fields.length} field(s) · {rel(v.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          to="/admin-activity"
          className="mt-3 block text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent"
        >
          View full activity timeline
        </Link>
      </CollapsibleModule>
    </div>
  );
}
