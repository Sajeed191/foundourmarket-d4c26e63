import { useState } from "react";
import { Loader2, Sparkles, ShieldAlert } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeMediaAssetWithAi } from "@/lib/image-ai.functions";
import type { ImageAnalysis } from "@/lib/image-normalization";
import { cn } from "@/lib/utils";

/**
 * Manual "Analyze with AI" trigger. Deterministic Tier 1 already ran; this
 * calls the Phase B vision endpoint once per image and caches the result.
 */
export function AnalyzeWithAiButton({
  mediaAssetId,
  analysis,
  onAnalyzed,
  className,
  size = "sm",
}: {
  mediaAssetId: string;
  analysis?: ImageAnalysis | null;
  onAnalyzed?: (analysis: Partial<ImageAnalysis>) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const analyze = useServerFn(analyzeMediaAssetWithAi);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyAnalyzed = !!analysis?.product?.analyzed;
  const confidence = analysis?.product?.confidence ?? null;
  const lowConfidence = confidence !== null && confidence < 0.7;

  async function run(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await analyze({ data: { mediaAssetId, force } });
      onAnalyzed?.(res.analysis as Partial<ImageAnalysis>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <button
        type="button"
        onClick={() => run(alreadyAnalyzed)}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 font-semibold text-accent transition hover:bg-accent/20 disabled:opacity-60",
          size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        )}
        title={alreadyAnalyzed ? "Re-analyze with AI" : "Analyze with AI"}
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
        {alreadyAnalyzed ? "Re-analyze" : "Analyze with AI"}
      </button>

      {alreadyAnalyzed && confidence !== null && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px] font-mono",
            lowConfidence ? "text-amber-300" : "text-emerald-300",
          )}
        >
          {lowConfidence && <ShieldAlert className="size-3" />}
          Detection {Math.round(confidence * 100)}% confidence
        </span>
      )}
      {lowConfidence && (
        <span className="text-[10px] text-amber-300/80">
          AI is uncertain — manual review recommended.
        </span>
      )}
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </div>
  );
}
