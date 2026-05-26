import { AlertTriangle, Loader2, Rocket } from "lucide-react";
import { useState } from "react";

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
};

/**
 * Cinematic publish confirmation dialog.
 * Used for ANY admin action that pushes a change live to the public site.
 */
export function PublishConfirm({ open, title, description, onCancel, onConfirm }: Props) {
  const [working, setWorking] = useState(false);
  if (!open) return null;

  async function go() {
    setWorking(true);
    try { await onConfirm(); } finally { setWorking(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md grid place-items-center p-4 animate-in fade-in duration-200">
      <div className="card-premium rounded-3xl p-7 max-w-md w-full border border-accent/30 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4 mb-5">
          <div className="size-12 rounded-2xl grid place-items-center bg-accent/15 text-accent shrink-0">
            <AlertTriangle className="size-6" />
          </div>
          <div>
            <h3 className="text-lg font-display font-semibold leading-tight">
              {title ?? "Publish changes live?"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              {description ?? "This will immediately update the live site for every visitor. This action cannot be undone."}
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-4 border-t border-border">
          <button
            type="button"
            disabled={working}
            onClick={onCancel}
            className="px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest font-mono border border-border hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={working}
            onClick={go}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {working ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
            {working ? "Publishing…" : "Publish live"}
          </button>
        </div>
      </div>
    </div>
  );
}
