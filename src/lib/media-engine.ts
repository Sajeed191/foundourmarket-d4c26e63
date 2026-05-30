// ============================================================
// FoundOurMarket™ — Shared Media Engine
// Centralized, reusable image pipeline for every admin surface
// (products, categories, banners, testimonials, CMS, homepage…).
// Handles client-side compression, responsive variant generation,
// progress-aware uploads, media-library recording, and audit logging.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const DEFAULT_BUCKET = "media";

export type MediaEntityType =
  | "product"
  | "category"
  | "banner"
  | "announcement"
  | "testimonial"
  | "blog"
  | "cms"
  | "homepage"
  | "library";

export type VariantKey = "thumb" | "medium" | "large" | "original";

const VARIANT_DIMS: Record<Exclude<VariantKey, "original">, number> = {
  thumb: 400,
  medium: 900,
  large: 1600,
};

const VARIANT_QUALITY: Record<Exclude<VariantKey, "original">, number> = {
  thumb: 0.72,
  medium: 0.8,
  large: 0.84,
};

export type MediaVariants = {
  url: string;
  thumb_url: string;
  medium_url: string;
  large_url: string;
};

export type MediaAsset = {
  id: string;
  bucket: string;
  path: string;
  url: string;
  thumb_url: string | null;
  medium_url: string | null;
  large_url: string | null;
  alt: string | null;
  original_name: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  entity_type: string;
  entity_ref: string | null;
  tags: string[];
  usage_count: number;
  created_at: string;
};

export const MAX_UPLOAD_MB = 25;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

// ------------------------------------------------------------
// Image decoding + dimensions
// ------------------------------------------------------------
export function loadImageBitmap(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

// ------------------------------------------------------------
// Canvas compression — resize to a max dimension, re-encode webp
// (non-destructive: original is uploaded separately).
// ------------------------------------------------------------
export async function compressTo(
  source: HTMLImageElement,
  maxDim: number,
  quality: number,
): Promise<Blob> {
  const ratio = Math.min(1, maxDim / Math.max(source.naturalWidth, source.naturalHeight));
  const w = Math.max(1, Math.round(source.naturalWidth * ratio));
  const h = Math.max(1, Math.round(source.naturalHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
      "image/webp",
      quality,
    );
  });
}

// ------------------------------------------------------------
// Crop / rotate (non-destructive — produces a new blob)
// ------------------------------------------------------------
export type CropRect = { x: number; y: number; width: number; height: number };

export async function applyCropRotate(
  file: Blob,
  crop: CropRect | null,
  rotateDeg: number,
  quality = 0.85,
): Promise<Blob> {
  const img = await loadImageBitmap(file);
  const rad = (rotateDeg * Math.PI) / 180;
  const cw = crop ? crop.width : img.naturalWidth;
  const ch = crop ? crop.height : img.naturalHeight;
  const rotated = rotateDeg % 180 !== 0;
  const canvas = document.createElement("canvas");
  canvas.width = rotated ? ch : cw;
  canvas.height = rotated ? cw : ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(
    img,
    crop ? crop.x : 0,
    crop ? crop.y : 0,
    cw,
    ch,
    -cw / 2,
    -ch / 2,
    cw,
    ch,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Crop failed"))),
      "image/webp",
      quality,
    );
  });
}

// ------------------------------------------------------------
// Progress-aware upload via Storage REST (XHR gives upload events)
// ------------------------------------------------------------
function publicUrl(bucket: string, path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
}

async function authToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? SUPABASE_KEY;
}

export type UploadProgress = { loaded: number; total: number };

export function xhrUpload(
  bucket: string,
  path: string,
  blob: Blob,
  token: string,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const endpoint = `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`;
    xhr.open("POST", endpoint, true);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("cache-control", "3600");
    if (blob.type) xhr.setRequestHeader("content-type", blob.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress({ loaded: e.loaded, total: e.total });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText || "error"}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(blob);
  });
}

export type ProcessedUpload = {
  asset: MediaAsset | null;
  variants: MediaVariants;
  width: number;
  height: number;
  size: number;
};

export type UploadOptions = {
  bucket?: string;
  entityType?: MediaEntityType;
  entityRef?: string | null;
  alt?: string | null;
  pathPrefix?: string;
  recordLibrary?: boolean;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
};

/**
 * Full pipeline for a single file:
 *  1. decode + read dimensions
 *  2. generate thumb / medium / large webp variants + keep original
 *  3. upload all variants with aggregate progress
 *  4. record in media_assets library + write an audit log entry
 */
export async function processAndUpload(
  file: File | Blob,
  opts: UploadOptions = {},
): Promise<ProcessedUpload> {
  const bucket = opts.bucket ?? DEFAULT_BUCKET;
  const prefix = opts.pathPrefix ?? opts.entityType ?? "library";
  const token = await authToken();
  const baseName = (file as File).name?.replace(/\.[^.]+$/, "") || "image";
  const id = crypto.randomUUID();
  const folder = `${prefix}/${id}`;

  const img = await loadImageBitmap(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  // Build variant blobs (skip upscaling: only generate sizes <= original)
  const variantBlobs: Record<string, Blob> = {};
  variantBlobs.original = file;
  for (const key of ["large", "medium", "thumb"] as const) {
    const dim = VARIANT_DIMS[key];
    if (Math.max(width, height) <= dim && key !== "thumb") continue;
    variantBlobs[key] = await compressTo(img, dim, VARIANT_QUALITY[key]);
  }

  // Aggregate progress across all variant uploads
  const totals: Record<string, number> = {};
  const loaded: Record<string, number> = {};
  Object.entries(variantBlobs).forEach(([k, b]) => {
    totals[k] = b.size;
    loaded[k] = 0;
  });
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const emit = () => {
    if (!opts.onProgress) return;
    const sum = Object.values(loaded).reduce((a, b) => a + b, 0);
    opts.onProgress({ loaded: sum, total: grandTotal });
  };

  const urls: Record<string, string> = {};
  for (const [key, blob] of Object.entries(variantBlobs)) {
    const ext = key === "original" ? (file.type.split("/")[1] || "jpg") : "webp";
    const path = `${folder}/${key}.${ext}`;
    await xhrUpload(
      bucket,
      path,
      blob,
      token,
      (p) => {
        loaded[key] = p.loaded;
        emit();
      },
      opts.signal,
    );
    loaded[key] = blob.size;
    emit();
    urls[key] = publicUrl(bucket, path);
  }

  const variants: MediaVariants = {
    url: urls.large || urls.medium || urls.original,
    thumb_url: urls.thumb || urls.medium || urls.original,
    medium_url: urls.medium || urls.large || urls.original,
    large_url: urls.large || urls.original,
  };

  let asset: MediaAsset | null = null;
  if (opts.recordLibrary !== false) {
    const { data, error } = await supabase
      .from("media_assets")
      .insert({
        bucket,
        path: folder,
        url: variants.url,
        thumb_url: variants.thumb_url,
        medium_url: variants.medium_url,
        large_url: variants.large_url,
        alt: opts.alt ?? baseName,
        original_name: (file as File).name ?? `${baseName}.webp`,
        mime: file.type,
        width,
        height,
        size_bytes: file.size,
        entity_type: opts.entityType ?? "library",
        entity_ref: opts.entityRef ?? null,
      })
      .select()
      .single();
    if (!error && data) {
      asset = data as MediaAsset;
      await logMediaEvent("upload", {
        assetId: asset.id,
        entityType: opts.entityType,
        entityRef: opts.entityRef,
        meta: { size: file.size, width, height, variants: Object.keys(variantBlobs) },
      });
    }
  }

  URL.revokeObjectURL(img.src);
  return { asset, variants, width, height, size: file.size };
}

// ------------------------------------------------------------
// Audit logging
// ------------------------------------------------------------
export async function logMediaEvent(
  action: string,
  opts: {
    assetId?: string | null;
    entityType?: string | null;
    entityRef?: string | null;
    meta?: Record<string, unknown>;
  } = {},
) {
  try {
    await supabase.rpc("log_media_event", {
      _action: action,
      _asset_id: opts.assetId ?? undefined,
      _entity_type: opts.entityType ?? undefined,
      _entity_ref: opts.entityRef ?? undefined,
      _meta: (opts.meta ?? {}) as never,
    });
  } catch {
    // non-fatal — auditing must never block an admin action
  }
}

// ------------------------------------------------------------
// Storage cleanup — remove object(s) + library row + audit
// ------------------------------------------------------------
export async function deleteMediaAsset(asset: Pick<MediaAsset, "id" | "bucket" | "path">) {
  // remove every variant under the asset folder
  const { data: list } = await supabase.storage.from(asset.bucket).list(asset.path);
  if (list && list.length) {
    await supabase.storage
      .from(asset.bucket)
      .remove(list.map((f) => `${asset.path}/${f.name}`));
  }
  await supabase.from("media_assets").delete().eq("id", asset.id);
  await logMediaEvent("delete", { assetId: asset.id, meta: { path: asset.path } });
}

/** Delete a single object by full path (used when no library row exists). */
export async function deleteStorageObject(bucket: string, fullPath: string, entityRef?: string) {
  await supabase.storage.from(bucket).remove([fullPath]);
  await logMediaEvent("storage_cleanup", { entityRef, meta: { bucket, path: fullPath } });
}

// ------------------------------------------------------------
// Library querying (paginated)
// ------------------------------------------------------------
export async function searchMediaLibrary(params: {
  q?: string;
  entityType?: string;
  limit?: number;
  offset?: number;
}): Promise<MediaAsset[]> {
  const { data, error } = await supabase.rpc("media_library_search", {
    _q: params.q ?? undefined,
    _entity_type: params.entityType ?? undefined,
    _limit: params.limit ?? 40,
    _offset: params.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaAsset[];
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return `${file.name} is not an image`;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024)
    return `${file.name} exceeds ${MAX_UPLOAD_MB}MB`;
  return null;
}
