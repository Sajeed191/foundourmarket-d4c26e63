import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { SectionEditor, Field, Toggle } from "@/components/admin/product-editor/kit";

export const Route = createFileRoute("/admin-product/$slug/returns")({ component: ReturnsPage });

const COLS = ["return_eligible", "replacement_eligible", "return_window_days", "warranty"];

function ReturnsPage() {
  const { slug } = Route.useParams();
  return (
    <SectionEditor
      slug={slug} sectionKey="returns" title="Returns" icon={<RotateCcw className="size-4" />} cols={COLS}
      toForm={(r) => ({
        return_eligible: r.return_eligible ?? true, replacement_eligible: r.replacement_eligible ?? true,
        return_window_days: String(r.return_window_days ?? 7), warranty: r.warranty ?? "",
      })}
      toPatch={(f) => ({
        return_eligible: f.return_eligible, replacement_eligible: f.replacement_eligible,
        return_window_days: Number(f.return_window_days) || 0, warranty: f.warranty.trim() || null,
      })}
    >
      {(f, set) => (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Toggle checked={f.return_eligible} onChange={(v) => set({ return_eligible: v })} label="Returns allowed" />
            <Toggle checked={f.replacement_eligible} onChange={(v) => set({ replacement_eligible: v })} label="Replacements allowed" />
          </div>
          <Field label="Return window (days)" type="number" value={f.return_window_days} onChange={(v) => set({ return_window_days: v })} />
          <Field label="Warranty" value={f.warranty} onChange={(v) => set({ warranty: v })} />
        </div>
      )}
    </SectionEditor>
  );
}
