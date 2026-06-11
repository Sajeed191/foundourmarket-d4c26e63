import { useRef, useState } from "react";
import { RotateCcw, Loader2, ImagePlus, X, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const REASONS = [
  "Defective / damaged",
  "Wrong item received",
  "Not as described",
  "Item doesn't fit",
  "Arrived too late",
  "No longer needed",
  "Other",
] as const;

const MAX_PHOTOS = 4;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB per photo

type ReturnableItem = {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  product_slug: string;
  image: string | null;
};

export function ReturnRequestDialog({
  open,
  onOpenChange,
  orderId,
  userId,
  items,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  userId: string;
  items: ReturnableItem[];
  onSubmitted?: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setSelected({});
    setReason("");
    setNotes("");
    photos.length = 0;
    setPhotos([]);
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviews([]);
    setDone(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v && !submitting) reset();
    onOpenChange(v);
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const next = [...photos];
    const nextPrev = [...previews];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) {
        toast.error(`You can attach up to ${MAX_PHOTOS} photos`);
        break;
      }
      if (!f.type.startsWith("image/")) {
        toast.error("Only image files are allowed");
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is larger than 5MB`);
        continue;
      }
      next.push(f);
      nextPrev.push(URL.createObjectURL(f));
    }
    setPhotos(next);
    setPreviews(nextPrev);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePhoto = (i: number) => {
    URL.revokeObjectURL(previews[i]);
    setPhotos(photos.filter((_, idx) => idx !== i));
    setPreviews(previews.filter((_, idx) => idx !== i));
  };

  async function submit() {
    const chosen = items.filter((it) => selected[it.id]);
    if (chosen.length === 0) {
      toast.error("Select at least one item to return");
      return;
    }
    if (!reason) {
      toast.error("Please choose a return reason");
      return;
    }
    setSubmitting(true);
    try {
      // Upload optional photos to the user's private folder
      const photoUrls: string[] = [];
      for (const file of photos) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${userId}/${orderId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("return-photos")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        photoUrls.push(path);
      }

      const refund = chosen.reduce(
        (sum, it) => sum + Number(it.unit_price) * it.quantity,
        0,
      );

      const { data: ret, error } = await supabase
        .from("returns")
        .insert({
          order_id: orderId,
          user_id: userId,
          reason,
          notes: notes.trim() || null,
          refund_amount: refund,
          photo_urls: photoUrls,
        })
        .select("id")
        .single();
      if (error || !ret) throw error ?? new Error("Failed to create return");

      const rows = chosen.map((it) => ({
        return_id: ret.id,
        order_item_id: it.id,
        product_slug: it.product_slug,
        quantity: it.quantity,
      }));
      const { error: itemsErr } = await supabase.from("return_items").insert(rows);
      if (itemsErr) throw itemsErr;

      setDone(true);
      toast.success("Return request submitted");
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit return");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4 text-accent" /> Request a return
          </DialogTitle>
          <DialogDescription>
            Returns are accepted within 4 days of delivery. Tell us what's wrong and
            attach photos if helpful.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-6 text-center"
            >
              <div className="mx-auto size-12 grid place-items-center rounded-full bg-accent/10 text-accent mb-3">
                <CheckCircle2 className="size-6" />
              </div>
              <p className="text-sm font-medium">Your return request was submitted.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Track its progress under Account → Returns.
              </p>
              <button
                onClick={() => handleOpenChange(false)}
                className="mt-5 inline-flex bg-accent text-accent-foreground rounded-full px-5 py-2.5 text-xs uppercase tracking-widest font-bold"
              >
                Done
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4 max-h-[60vh] overflow-y-auto pr-1"
            >
              {/* Items */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Select items
                </p>
                <div className="space-y-2">
                  {items.map((it) => (
                    <label
                      key={it.id}
                      className="flex items-center gap-3 rounded-xl border border-border p-2.5 cursor-pointer hover:border-accent/40 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={!!selected[it.id]}
                        onChange={(e) =>
                          setSelected((p) => ({ ...p, [it.id]: e.target.checked }))
                        }
                        className="accent-[hsl(var(--accent))] size-4"
                      />
                      {it.image && (
                        <img
                          src={it.image}
                          alt=""
                          className="size-10 rounded-lg object-cover border border-border"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{it.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          Qty {it.quantity}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Reason */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Reason
                </p>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="">Select a reason…</option>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Details <span className="normal-case opacity-60">(optional)</span>
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Describe the issue…"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent transition-colors resize-none"
                />
              </div>

              {/* Photos */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Photos <span className="normal-case opacity-60">(optional)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {previews.map((src, i) => (
                    <div key={src} className="relative size-16">
                      <img
                        src={src}
                        alt=""
                        className="size-16 rounded-lg object-cover border border-border"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute -top-1.5 -right-1.5 size-5 grid place-items-center rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="size-16 grid place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors"
                    >
                      <ImagePlus className="size-5" />
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addPhotos(e.target.files)}
                />
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Up to {MAX_PHOTOS} images, 5MB each.
                </p>
              </div>

              <button
                onClick={submit}
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground rounded-full px-5 py-3 text-xs uppercase tracking-widest font-bold disabled:opacity-50 hover:brightness-110 transition"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" /> Submit return request
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
