// ============================================================
// MediaUploader — universal upload surface reused across every
// admin media tool. Supports single/multi, drag & drop, folder
// upload, paste-from-clipboard, mobile gallery & camera capture,
// with a live queue (progress, speed, remaining, retry, cancel).
// ============================================================
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  Camera,
  FolderUp,
  ImagePlus,
  X,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes, type MediaEntityType } from "@/lib/media-engine";
import { useMediaUpload, type UploadDone } from "@/hooks/use-media-upload";

export function MediaUploader({
  entityType = "library",
  entityRef = null,
  recordLibrary = true,
  onComplete,
  compact = false,
  label = "Upload images",
}: {
  entityType?: MediaEntityType;
  entityRef?: string | null;
  recordLibrary?: boolean;
  onComplete?: (done: UploadDone) => void | Promise<void>;
  compact?: boolean;
  label?: string;
}) {
  const { queue, enqueue, cancel, retry, remove, clearFinished, busy, remaining, totalSpeed } =
    useMediaUpload({ entityType, entityRef, recordLibrary, onItemComplete: onComplete });

  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  // Paste-to-upload (clipboard images)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f && f.type.startsWith("image/")) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        enqueue(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enqueue]);

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && enqueue(e.target.files)}
      />
      <input
        ref={folderRef}
        type="file"
        accept="image/*"
        multiple
        // @ts-expect-error non-standard but widely supported
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={(e) => e.target.files && enqueue(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files && enqueue(e.target.files)}
      />

      <div
        ref={zoneRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) enqueue(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-2xl border-2 border-dashed transition-all",
          dragging
            ? "border-accent bg-accent/10"
            : "border-white/15 bg-white/[0.02] hover:border-accent/40",
          compact ? "p-4" : "p-6",
        )}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
            <UploadCloud className="size-6" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              Drag & drop, or paste images
            </p>
            <p className="text-[11px] text-muted-foreground">
              WEBP/JPG/PNG · auto-optimized into 4 responsive sizes
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" /> {label}
            </Button>
            <Button size="sm" variant="outline" onClick={() => folderRef.current?.click()}>
              <FolderUp className="size-4" /> Folder
            </Button>
            <Button size="sm" variant="outline" onClick={() => cameraRef.current?.click()}>
              <Camera className="size-4" /> Camera
            </Button>
          </div>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>
              {remaining > 0
                ? `${remaining} remaining · ${formatBytes(totalSpeed)}/s`
                : "All uploads complete"}
            </span>
            <button onClick={clearFinished} className="hover:text-foreground">
              Clear done
            </button>
          </div>
          <AnimatePresence initial={false}>
            {queue.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2"
              >
                <img
                  src={item.previewUrl}
                  alt={item.name}
                  className="size-11 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-foreground">{item.name}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatBytes(item.size)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        item.status === "error"
                          ? "bg-destructive"
                          : item.status === "success"
                            ? "bg-emerald-500"
                            : "bg-accent",
                      )}
                      style={{ width: `${Math.round(item.progress * 100)}%` }}
                    />
                  </div>
                  {item.status === "error" && (
                    <p className="mt-1 truncate text-[10px] text-destructive">{item.error}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {item.status === "uploading" && (
                    <button
                      onClick={() => cancel(item.id)}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-destructive"
                      title="Cancel"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                  {item.status === "uploading" && <Loader2 className="size-4 animate-spin text-accent" />}
                  {item.status === "success" && (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  )}
                  {item.status === "error" && (
                    <>
                      <button
                        onClick={() => retry(item.id)}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-accent"
                        title="Retry"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                      <AlertTriangle className="size-4 text-destructive" />
                    </>
                  )}
                  {(item.status === "success" || item.status === "cancelled" || item.status === "error") && (
                    <button
                      onClick={() => remove(item.id)}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                      title="Remove"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      {busy && (
        <p className="text-center text-[10px] text-muted-foreground">
          Uploads continue even if you switch tabs in the editor.
        </p>
      )}
    </div>
  );
}
