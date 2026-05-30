import { supabase } from "@/integrations/supabase/client";

/**
 * Universal draft / autosave / version-history data layer.
 * Backed by editor_drafts + entity_versions + admin_activity_logs.
 * Every admin editor (products, categories, banners, announcements,
 * homepage sections, testimonials, blog posts, CMS pages, marketing
 * campaigns, email templates, future CMS entities) uses this engine.
 */

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface EditorDraft {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  data: Record<string, unknown>;
  base_snapshot: Record<string, unknown> | null;
  status: string;
  device_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntityVersion {
  id: string;
  entity_type: string;
  entity_id: string;
  snapshot: Record<string, unknown>;
  changed_fields: string[];
  summary: string | null;
  edited_by: string | null;
  created_at: string;
}

const lsKey = (entityType: string, entityId: string) =>
  `fom:draft:${entityType}:${entityId}`;

/** Instant, synchronous local persistence — survives crashes/refresh before DB sync. */
export function writeLocalDraft(
  entityType: string,
  entityId: string,
  data: unknown,
) {
  try {
    localStorage.setItem(
      lsKey(entityType, entityId),
      JSON.stringify({ data, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* storage full / unavailable */
  }
}

export function readLocalDraft(
  entityType: string,
  entityId: string,
): { data: unknown; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(lsKey(entityType, entityId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(entityType: string, entityId: string) {
  try {
    localStorage.removeItem(lsKey(entityType, entityId));
  } catch {
    /* noop */
  }
}

function deviceLabel(): string {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return "Mobile";
  if (/Tablet|iPad/i.test(ua)) return "Tablet";
  return "Desktop";
}

/** Persist draft to the database (background autosave). */
export async function syncDraft(
  entityType: string,
  entityId: string,
  data: unknown,
  baseSnapshot?: unknown,
  status = "draft",
) {
  const { error } = await supabase.rpc("upsert_editor_draft", {
    _entity_type: entityType,
    _entity_id: entityId,
    _data: data as never,
    _base_snapshot: (baseSnapshot ?? null) as never,
    _status: status,
    _device_label: deviceLabel(),
  });
  if (error) throw error;
}

export async function discardDraft(entityType: string, entityId: string) {
  clearLocalDraft(entityType, entityId);
  const { error } = await supabase.rpc("discard_editor_draft", {
    _entity_type: entityType,
    _entity_id: entityId,
  });
  if (error) throw error;
}

export async function fetchDraft(
  entityType: string,
  entityId: string,
): Promise<EditorDraft | null> {
  const { data, error } = await supabase
    .from("editor_drafts")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) throw error;
  return (data as EditorDraft) ?? null;
}

/** All of the current admin's outstanding drafts (recovery queue / dashboard). */
export async function fetchMyDrafts(limit = 50): Promise<EditorDraft[]> {
  const { data, error } = await supabase
    .from("editor_drafts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as EditorDraft[]) ?? [];
}

export async function saveVersion(
  entityType: string,
  entityId: string,
  snapshot: unknown,
  changedFields: string[] = [],
  summary?: string,
) {
  const { error } = await supabase.rpc("save_entity_version", {
    _entity_type: entityType,
    _entity_id: entityId,
    _snapshot: snapshot as never,
    _changed_fields: changedFields,
    _summary: summary ?? undefined,
  });
  if (error) throw error;
}

export async function fetchVersions(
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<EntityVersion[]> {
  const { data, error } = await supabase
    .from("entity_versions")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as EntityVersion[]) ?? [];
}

export async function logAdminActivity(
  action: string,
  entityType?: string,
  entityId?: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await supabase.rpc("log_admin_activity", {
      _action: action,
      _entity_type: entityType ?? null,
      _entity_id: entityId ?? null,
      _metadata: metadata as never,
    });
  } catch {
    /* audit logging is best-effort; never block the editor */
  }
}

/** Shallow diff of two records — returns the keys whose values differ. */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): string[] {
  const a = before ?? {};
  const b = after ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.push(k);
  }
  return changed;
}
