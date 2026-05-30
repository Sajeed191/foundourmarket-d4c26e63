import { useEffect, useState } from "react";
import { History, RotateCcw, Copy, Download, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  fetchVersions,
  logAdminActivity,
  type EntityVersion,
} from "@/lib/drafts";

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Version-history viewer for any entity. Lists historical snapshots with
 * changed-field highlighting and lets admins restore, duplicate, or export
 * a version. `onRestore` applies the snapshot back into the live editor.
 */
export function VersionHistorySheet({
  open,
  onOpenChange,
  entityType,
  entityId,
  onRestore,
  onDuplicate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityType: string;
  entityId: string;
  onRestore?: (snapshot: Record<string, unknown>) => void;
  onDuplicate?: (snapshot: Record<string, unknown>) => void;
}) {
  const [versions, setVersions] = useState<EntityVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entityId) return;
    setLoading(true);
    fetchVersions(entityType, entityId)
      .then(setVersions)
      .catch((e) => toast.error(e.message ?? "Failed to load versions"))
      .finally(() => setLoading(false));
  }, [open, entityType, entityId]);

  const exportVersion = (v: EntityVersion) => {
    const blob = new Blob([JSON.stringify(v.snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entityType}-${entityId}-${v.created_at}.json`;
    a.click();
    URL.revokeObjectURL(url);
    void logAdminActivity("version_export", entityType, entityId, {
      version_id: v.id,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Version history
          </SheetTitle>
          <SheetDescription>
            {versions.length} saved version{versions.length === 1 ? "" : "s"} ·
            tap a version to inspect changes
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No version history yet. Versions are recorded each time you save.
            </div>
          ) : (
            <ul className="divide-y">
              {versions.map((v, i) => (
                <li key={v.id} className="p-4">
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(selected === v.id ? null : v.id)
                    }
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {fmt(v.created_at)}
                      </span>
                      {i === 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          Latest
                        </Badge>
                      )}
                    </div>
                    {v.summary && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {v.summary}
                      </p>
                    )}
                    {v.changed_fields.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {v.changed_fields.slice(0, 8).map((f) => (
                          <span
                            key={f}
                            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                          >
                            {f}
                          </span>
                        ))}
                        {v.changed_fields.length > 8 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{v.changed_fields.length - 8} more
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                  {selected === v.id && (
                    <div className="mt-3 space-y-2">
                      <pre
                        className={cn(
                          "max-h-48 overflow-auto rounded-md bg-muted p-2",
                          "text-[10px] leading-relaxed",
                        )}
                      >
                        {JSON.stringify(v.snapshot, null, 2)}
                      </pre>
                      <div className="flex flex-wrap gap-2">
                        {onRestore && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              onRestore(v.snapshot);
                              void logAdminActivity(
                                "version_restore",
                                entityType,
                                entityId,
                                { version_id: v.id },
                              );
                              toast.success("Version restored into editor");
                            }}
                          >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Restore
                          </Button>
                        )}
                        {onDuplicate && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDuplicate(v.snapshot)}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Duplicate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => exportVersion(v)}
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Export
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
