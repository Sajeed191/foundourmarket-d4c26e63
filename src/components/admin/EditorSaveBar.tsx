import { useState } from "react";
import { History, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SaveStateBadge } from "@/components/admin/SaveStateBadge";
import { DraftRecoveryDialog } from "@/components/admin/DraftRecoveryDialog";
import { VersionHistorySheet } from "@/components/admin/VersionHistorySheet";
import type { SaveState } from "@/lib/drafts";
import type { RecoveryState } from "@/hooks/use-editor-protection";

interface EditorSaveBarProps<T> {
  state: SaveState;
  lastSavedAt?: Date | null;
  recovery: RecoveryState<T> | null;
  onRestore: () => void;
  onDismiss: () => void;
  /** Version history target. Hidden when entityId is "new". */
  entityType: string;
  entityId: string;
  onRestoreVersion?: (snapshot: Record<string, unknown>) => void;
  onDuplicateVersion?: (snapshot: Record<string, unknown>) => void;
  // Optional undo/redo wiring (works on desktop shortcuts + touch buttons).
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  className?: string;
}

/**
 * Unified save controls shared by every admin editor. Shows the live save
 * state ("Saving…", "Saved", "Unsaved changes", "Save failed", last-saved
 * time), undo/redo, and a version-history launcher — plus the crash/device
 * draft-recovery prompt. One bar, identical everywhere.
 */
export function EditorSaveBar<T extends Record<string, unknown>>({
  state,
  lastSavedAt,
  recovery,
  onRestore,
  onDismiss,
  entityType,
  entityId,
  onRestoreVersion,
  onDuplicateVersion,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  className,
}: EditorSaveBarProps<T>) {
  const [showVersions, setShowVersions] = useState(false);
  const hasUndoRedo = onUndo || onRedo;
  const hasHistory = entityId && entityId !== "new";

  return (
    <>
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2",
          className,
        )}
      >
        <SaveStateBadge state={state} lastSavedAt={lastSavedAt} />
        <div className="flex items-center gap-1">
          {hasUndoRedo && (
            <>
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label="Undo"
                className="grid size-7 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent disabled:opacity-30"
              >
                <Undo2 className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                aria-label="Redo"
                className="grid size-7 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent disabled:opacity-30"
              >
                <Redo2 className="size-3.5" />
              </button>
            </>
          )}
          {hasHistory && (
            <button
              type="button"
              onClick={() => setShowVersions(true)}
              aria-label="Version history"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent"
            >
              <History className="size-3.5" /> History
            </button>
          )}
        </div>
      </div>

      <DraftRecoveryDialog
        open={!!recovery}
        savedAt={recovery?.savedAt ?? null}
        deviceLabel={recovery?.device}
        onRestore={onRestore}
        onDiscard={onDismiss}
      />

      {hasHistory && (
        <VersionHistorySheet
          open={showVersions}
          onOpenChange={setShowVersions}
          entityType={entityType}
          entityId={entityId}
          onRestore={onRestoreVersion}
          onDuplicate={onDuplicateVersion}
        />
      )}
    </>
  );
}
