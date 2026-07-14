import { useState } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getFeedback,
  recordFeedback,
  type FeedbackVerdict,
} from "@/lib/ai-observability";
import type { ImageAnalysis } from "@/lib/image-normalization";

/**
 * Lightweight ✓ / ⚠ / ✗ control for admins to flag AI accuracy.
 * Feeds the Validation Dashboard — no direct model retraining.
 */
export function AiFeedbackControls({
  mediaAssetId,
  analysis,
  className,
}: {
  mediaAssetId: string;
  analysis?: ImageAnalysis | null;
  className?: string;
}) {
  const initial = getFeedback(mediaAssetId);
  const [verdict, setVerdict] = useState<FeedbackVerdict | null>(initial?.verdict ?? null);

  const analyzed = !!analysis?.product?.analyzed;
  if (!analyzed) return null;

  function submit(v: FeedbackVerdict) {
    setVerdict(v);
    recordFeedback({
      mediaAssetId,
      verdict: v,
      confidence: analysis?.product?.confidence ?? null,
      model: analysis?.ai?.model ?? null,
      modelVersion: analysis?.ai?.version ?? null,
      at: Date.now(),
    });
  }

  const btn = (v: FeedbackVerdict, Icon: typeof Check, label: string, tone: string) => (
    <button
      type="button"
      onClick={() => submit(v)}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] transition",
        verdict === v
          ? `${tone} border-transparent`
          : "border-white/10 text-muted-foreground hover:text-foreground",
      )}
      title={label}
    >
      <Icon className="size-3" />
      {label}
    </button>
  );

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
        AI verdict
      </span>
      {btn("correct", Check, "Correct", "bg-emerald-500/20 text-emerald-200")}
      {btn("partial", AlertTriangle, "Partial", "bg-amber-500/20 text-amber-200")}
      {btn("incorrect", X, "Incorrect", "bg-destructive/25 text-destructive-foreground")}
    </div>
  );
}
