import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAutosave } from "@/hooks/use-autosave";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import {
  fetchDraft,
  discardDraft,
  readLocalDraft,
  saveVersion,
  diffFields,
  logAdminActivity,
  type SaveState,
} from "@/lib/drafts";
import { logActivity } from "@/components/admin/AdminShell";

export interface RecoveryState<T> {
  data: T;
  savedAt: string | null;
  device?: string | null;
}

interface UseEditorProtectionOptions<T> {
  /** Logical entity bucket, e.g. "banner", "announcement", "homepage_section". */
  entityType: string;
  /** Stable id of the open entity ("new" for unsaved). */
  entityId: string;
  /** The current editor value (object) — autosaved + version-tracked. */
  value: T | null;
  /** JSON string of the last committed baseline (for dirty detection). */
  baseline: string;
  /** Whether an editor is currently open. */
  enabled?: boolean;
}

interface UseEditorProtectionReturn<T> {
  state: SaveState;
  lastSavedAt: Date | null;
  dirty: boolean;
  recovery: RecoveryState<T> | null;
  restoreDraft: () => T | null;
  dismissDraft: () => Promise<void>;
  /** Clears the autosave draft after a real commit. */
  markClean: () => Promise<void>;
  /** Records an immutable version snapshot with changed-field highlighting. */
  recordVersion: (
    versionId: string,
    payload: Record<string, unknown>,
    summaryVerb?: string,
  ) => Promise<void>;
}

/**
 * Unified editor-protection composite. Bundles autosave (local + DB),
 * crash/device draft recovery, unsaved-change guarding, version snapshots
 * and activity-timeline logging into a single drop-in hook so EVERY admin
 * editor behaves identically. This is the single save system — do not add
 * a second one.
 */
export function useEditorProtection<T extends Record<string, unknown>>({
  entityType,
  entityId,
  value,
  baseline,
  enabled = true,
}: UseEditorProtectionOptions<T>): UseEditorProtectionReturn<T> {
  const dirty = useMemo(
    () => (enabled && value ? JSON.stringify(value) !== baseline : false),
    [enabled, value, baseline],
  );

  const [recovery, setRecovery] = useState<RecoveryState<T> | null>(null);
  const checkedFor = useRef<string | null>(null);

  const autosave = useAutosave({
    entityType,
    entityId,
    value: value ?? {},
    enabled: enabled && !!value && dirty,
  });
  useUnsavedGuard(dirty);

  // Auto-detect a recoverable draft when an editor opens for a new entity.
  useEffect(() => {
    if (!enabled || !value) {
      checkedFor.current = null;
      return;
    }
    if (checkedFor.current === entityId) return;
    checkedFor.current = entityId;
    const local = readLocalDraft(entityType, entityId);
    if (local) {
      setRecovery({ data: local.data as T, savedAt: local.savedAt });
    }
    void fetchDraft(entityType, entityId)
      .then((d) => {
        if (d && (!local || new Date(d.updated_at) > new Date(local.savedAt))) {
          setRecovery({
            data: d.data as T,
            savedAt: d.updated_at,
            device: d.device_label,
          });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, entityId, !!value]);

  const restoreDraft = useCallback((): T | null => {
    const data = recovery?.data ?? null;
    if (data) void logAdminActivity("draft_recover", entityType, entityId);
    setRecovery(null);
    return data;
  }, [recovery, entityType, entityId]);

  const dismissDraft = useCallback(async () => {
    setRecovery(null);
    await discardDraft(entityType, entityId).catch(() => {});
  }, [entityType, entityId]);

  const markClean = useCallback(async () => {
    autosave.markClean();
    setRecovery(null);
    checkedFor.current = null;
    await discardDraft(entityType, entityId).catch(() => {});
  }, [autosave, entityType, entityId]);

  const recordVersion = useCallback(
    async (
      versionId: string,
      payload: Record<string, unknown>,
      summaryVerb = "Updated",
    ) => {
      const before = baseline ? (JSON.parse(baseline) as Record<string, unknown>) : {};
      const changed = diffFields(before, payload);
      await saveVersion(
        entityType,
        versionId,
        payload,
        changed,
        changed.length ? `${summaryVerb} ${changed.length} field(s)` : summaryVerb,
      ).catch(() => {});
      logActivity(`${entityType}_version_save`, entityType, versionId, {
        changed_fields: changed,
      });
    },
    [entityType, baseline],
  );

  return {
    state: autosave.state,
    lastSavedAt: autosave.lastSavedAt,
    dirty,
    recovery,
    restoreDraft,
    dismissDraft,
    markClean,
    recordVersion,
  };
}
