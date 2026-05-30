// ============================================================
// useMediaUpload — upload queue with progress, speed, ETA,
// retry, cancel, and success/failure states. Uploads keep
// running even when the admin switches tabs inside an editor
// (state lives in the hook, not the unmounted tab).
// ============================================================
import { useCallback, useRef, useState } from "react";
import {
  processAndUpload,
  validateFile,
  type MediaEntityType,
  type MediaVariants,
  type MediaAsset,
} from "@/lib/media-engine";

export type QueueStatus = "queued" | "uploading" | "success" | "error" | "cancelled";

export type QueueItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string;
  status: QueueStatus;
  progress: number; // 0..1
  loaded: number;
  speed: number; // bytes/sec
  error?: string;
  variants?: MediaVariants;
  asset?: MediaAsset | null;
};

export type UploadDone = {
  variants: MediaVariants;
  asset: MediaAsset | null;
  width: number;
  height: number;
  file: File;
};

type Options = {
  entityType?: MediaEntityType;
  entityRef?: string | null;
  recordLibrary?: boolean;
  concurrency?: number;
  onItemComplete?: (done: UploadDone) => void | Promise<void>;
};

export function useMediaUpload(opts: Options = {}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const controllers = useRef<Map<string, AbortController>>(new Map());
  const filesRef = useRef<Map<string, File>>(new Map());

  const patch = useCallback((id: string, p: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const runOne = useCallback(
    async (item: QueueItem) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      patch(item.id, { status: "uploading", progress: 0, loaded: 0, error: undefined });
      const start = Date.now();
      try {
        const res = await processAndUpload(item.file, {
          entityType: opts.entityType,
          entityRef: opts.entityRef,
          recordLibrary: opts.recordLibrary,
          signal: controller.signal,
          onProgress: ({ loaded, total }) => {
            const elapsed = (Date.now() - start) / 1000;
            patch(item.id, {
              progress: total ? loaded / total : 0,
              loaded,
              speed: elapsed > 0 ? loaded / elapsed : 0,
            });
          },
        });
        patch(item.id, {
          status: "success",
          progress: 1,
          variants: res.variants,
          asset: res.asset,
        });
        await opts.onItemComplete?.({
          variants: res.variants,
          asset: res.asset,
          width: res.width,
          height: res.height,
          file: item.file,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          patch(item.id, { status: "cancelled" });
        } else {
          patch(item.id, {
            status: "error",
            error: e instanceof Error ? e.message : "Upload failed",
          });
        }
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [opts, patch],
  );

  const drain = useCallback(
    async (items: QueueItem[]) => {
      const concurrency = opts.concurrency ?? 3;
      let cursor = 0;
      const worker = async () => {
        while (cursor < items.length) {
          const next = items[cursor++];
          await runOne(next);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    },
    [opts.concurrency, runOne],
  );

  const enqueue = useCallback(
    (files: File[] | FileList) => {
      const list = Array.from(files);
      const valid: QueueItem[] = [];
      for (const file of list) {
        const err = validateFile(file);
        const id = crypto.randomUUID();
        filesRef.current.set(id, file);
        const item: QueueItem = {
          id,
          file,
          name: file.name,
          size: file.size,
          previewUrl: URL.createObjectURL(file),
          status: err ? "error" : "queued",
          progress: 0,
          loaded: 0,
          speed: 0,
          error: err ?? undefined,
        };
        if (!err) valid.push(item);
        setQueue((q) => [...q, item]);
      }
      if (valid.length) void drain(valid);
    },
    [drain],
  );

  const cancel = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  const retry = useCallback(
    (id: string) => {
      setQueue((q) => {
        const item = q.find((it) => it.id === id);
        if (item) void runOne(item);
        return q;
      });
    },
    [runOne],
  );

  const clearFinished = useCallback(() => {
    setQueue((q) => {
      q.forEach((it) => {
        if (it.status === "success" || it.status === "cancelled") URL.revokeObjectURL(it.previewUrl);
      });
      return q.filter((it) => it.status === "uploading" || it.status === "queued" || it.status === "error");
    });
  }, []);

  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    setQueue((q) => {
      const item = q.find((it) => it.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return q.filter((it) => it.id !== id);
    });
  }, []);

  const active = queue.filter((q) => q.status === "uploading" || q.status === "queued").length;
  const remaining = active;
  const totalSpeed = queue
    .filter((q) => q.status === "uploading")
    .reduce((a, b) => a + b.speed, 0);

  return {
    queue,
    enqueue,
    cancel,
    retry,
    remove,
    clearFinished,
    busy: active > 0,
    remaining,
    totalSpeed,
  };
}
