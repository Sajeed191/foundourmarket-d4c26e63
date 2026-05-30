import type { ReactNode } from "react";
import { Check, Loader2, AlertTriangle, CircleDot, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaveState } from "@/lib/drafts";

function relativeTime(d: Date | null): string {
  if (!d) return "";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function SaveStateBadge({
  state,
  lastSavedAt,
  className,
}: {
  state: SaveState;
  lastSavedAt?: Date | null;
  className?: string;
}) {
  const map: Record<
    SaveState,
    { icon: ReactNode; label: string; tone: string }
  > = {
    idle: {
      icon: <Cloud className="h-3.5 w-3.5" />,
      label: "All changes saved",
      tone: "text-muted-foreground",
    },
    dirty: {
      icon: <CircleDot className="h-3.5 w-3.5" />,
      label: "Unsaved changes",
      tone: "text-amber-500",
    },
    saving: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      label: "Saving…",
      tone: "text-primary",
    },
    saved: {
      icon: <Check className="h-3.5 w-3.5" />,
      label: lastSavedAt ? `Saved ${relativeTime(lastSavedAt)}` : "Saved",
      tone: "text-emerald-500",
    },
    error: {
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: "Save failed — retrying",
      tone: "text-destructive",
    },
  };
  const s = map[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        s.tone,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {s.icon}
      {s.label}
    </span>
  );
}
