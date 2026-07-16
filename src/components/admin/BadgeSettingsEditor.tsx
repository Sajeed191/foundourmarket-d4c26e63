import { useEffect, useState } from "react";
import { Loader2, Save, Tag, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  type BadgeSettings,
  DEFAULT_BADGE_SETTINGS,
} from "@/lib/badges";
import { useBadgeSettings, saveBadgeSettings } from "@/lib/use-badge-settings";
import { logActivity } from "@/components/admin/AdminShell";

type NumField = {
  key: keyof BadgeSettings;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
};

type BadgeRow = {
  emoji: string;
  title: string;
  desc: string;
  enabledKey: keyof BadgeSettings;
  fields: NumField[];
};

const ROWS: BadgeRow[] = [
  {
    emoji: "⭐",
    title: "Bestseller",
    desc: "Shown when lifetime sales pass a threshold.",
    enabledKey: "bestsellerEnabled",
    fields: [{ key: "bestsellerSalesMin", label: "Min units sold", min: 1, suffix: "sold" }],
  },
  {
    emoji: "🔥",
    title: "Trending",
    desc: "Shown when views or wishlist saves spike.",
    enabledKey: "trendingEnabled",
    fields: [
      { key: "trendingViewsMin", label: "Min views", min: 1, suffix: "views" },
      { key: "trendingWishlistMin", label: "Min wishlist", min: 1, suffix: "saves" },
    ],
  },
  {
    emoji: "🔥",
    title: "Hot Deal",
    desc: "Shown when the discount is large enough.",
    enabledKey: "hotDealEnabled",
    fields: [{ key: "hotDealDiscountMin", label: "Min discount", min: 1, max: 90, suffix: "%" }],
  },
  {
    emoji: "🆕",
    title: "New Arrival",
    desc: "Shown for recently added products.",
    enabledKey: "newArrivalEnabled",
    fields: [{ key: "newArrivalDays", label: "Within last", min: 1, suffix: "days" }],
  },
];

export function BadgeSettingsEditor() {
  const live = useBadgeSettings();
  const [draft, setDraft] = useState<BadgeSettings>(live);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync once when live settings first arrive.
  useEffect(() => {
    if (!hydrated) {
      setDraft(live);
      setHydrated(true);
    }
  }, [live, hydrated]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(live);

  function setNum(key: keyof BadgeSettings, value: number) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function toggle(key: keyof BadgeSettings) {
    setDraft((d) => ({ ...d, [key]: !d[key] }));
  }

  async function save() {
    setSaving(true);
    try {
      await saveBadgeSettings(draft);
      logActivity("badge_settings_update", "badge_settings", "global");
      toast.success("Badge rules updated — live everywhere");
    } catch (e: any) {
      toast.error(e.message ?? "Could not save badge rules");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Tag className="size-4 text-muted-foreground" /> Badge rules
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Auto-generated from real product data. Changes apply instantly across the store.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDraft(DEFAULT_BADGE_SETTINGS)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold border border-border hover:bg-white/5"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      <div className="card-premium rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">Max badges shown per product</span>
        <div className="flex items-center gap-1">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => setNum("maxBadges", n)}
              className={`size-9 rounded-full text-sm font-mono ${
                draft.maxBadges === n
                  ? "bg-accent text-accent-foreground font-bold"
                  : "border border-border hover:bg-white/5"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ROWS.map((row) => {
          const enabled = draft[row.enabledKey] as boolean;
          return (
            <div
              key={row.title}
              className={`card-premium rounded-2xl p-4 border transition-opacity ${
                enabled ? "border-transparent" : "border-transparent opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <span>{row.emoji}</span> {row.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">{row.desc}</p>
                </div>
                <button
                  onClick={() => toggle(row.enabledKey)}
                  role="switch"
                  aria-checked={enabled}
                  className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
                    enabled ? "bg-accent" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
                      enabled ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {row.fields.map((field) => (
                  <label key={String(field.key)} className="block">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {field.label}
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step ?? 1}
                        disabled={!enabled}
                        value={draft[field.key] as number}
                        onChange={(e) => setNum(field.key, Number(e.target.value))}
                        className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm font-mono disabled:opacity-50"
                      />
                      {field.suffix && (
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{field.suffix}</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
