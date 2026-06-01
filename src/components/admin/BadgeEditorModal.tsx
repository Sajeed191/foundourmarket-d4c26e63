import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, Save, Sparkles, Clock, Bot } from "lucide-react";
import { toast } from "sonner";
import {
  type BadgeType,
  type BadgeTypeInput,
  type AutoRule,
  type BadgeAnimation,
  BADGE_ANIMATIONS,
  BADGE_CATEGORIES,
  badgeAnimationClass,
  createBadgeType,
  updateBadgeTypeFull,
} from "@/lib/use-product-badges";

const EMOJIS = ["🔥", "⚡", "🆕", "👑", "⭐", "📈", "🚀", "⏳", "🎯", "💎", "🎁", "💰", "🚚", "⚠️", "🏆", "👍", "❤️", "✨"];

const METRICS: { value: AutoRuleMetric; label: string }[] = [
  { value: "sales", label: "Total sales" },
  { value: "age_days", label: "Age (days)" },
  { value: "stock", label: "Stock left" },
  { value: "conversion", label: "Conversion %" },
  { value: "rating", label: "Rating" },
  { value: "views", label: "Views" },
];

type AutoRuleMetric = NonNullable<AutoRule>["metric"];

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return new Date(v).toISOString();
}

const emptyInput = (): BadgeTypeInput => ({
  badgeKey: "",
  label: "",
  emoji: "🔥",
  color: "#f59e0b",
  textColor: "#0a0a0a",
  backgroundColor: "#f59e0b",
  borderColor: "",
  glowColor: "",
  iconColor: "",
  shadowStrength: 0,
  radius: 6,
  priority: 50,
  description: "",
  enabled: true,
  isDiscount: false,
  startAt: null,
  endAt: null,
  autoRule: null,
  category: "Custom",
  subtitle: "",
  fontSize: 11,
  fontWeight: 700,
  animation: "none",
});

function badgeToInput(b: BadgeType): BadgeTypeInput {
  return {
    badgeKey: b.badgeKey,
    label: b.label,
    emoji: b.emoji,
    color: b.color,
    textColor: b.textColor,
    backgroundColor: b.backgroundColor,
    borderColor: b.borderColor,
    glowColor: b.glowColor,
    iconColor: b.iconColor,
    shadowStrength: b.shadowStrength,
    radius: b.radius,
    priority: b.priority,
    description: b.description,
    enabled: b.enabled,
    isDiscount: b.isDiscount,
    startAt: b.startAt,
    endAt: b.endAt,
    autoRule: b.autoRule,
    category: b.category,
    subtitle: b.subtitle,
    fontSize: b.fontSize,
    fontWeight: b.fontWeight,
    animation: b.animation,
  };
}

function ColorField({ label, value, onChange, allowEmpty }: { label: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 rounded-lg bg-transparent border border-border cursor-pointer p-0.5"
        />
        <input
          value={value}
          placeholder={allowEmpty ? "none" : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white/5 border border-border rounded-lg px-2.5 py-2 text-xs font-mono"
        />
        {allowEmpty && value && (
          <button onClick={() => onChange("")} className="text-[10px] text-muted-foreground hover:text-foreground shrink-0">clear</button>
        )}
      </div>
    </label>
  );
}

export function BadgeEditorModal({
  badge,
  onClose,
}: {
  badge: BadgeType | "new";
  onClose: () => void;
}) {
  const isNew = badge === "new";
  const [form, setForm] = useState<BadgeTypeInput>(isNew ? emptyInput() : badgeToInput(badge));
  const [keyEdited, setKeyEdited] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew && !keyEdited) setForm((f) => ({ ...f, badgeKey: slugify(f.label) }));
  }, [form.label, isNew, keyEdited]);

  function set<K extends keyof BadgeTypeInput>(key: K, value: BadgeTypeInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const ruleOn = !!form.autoRule;
  function setRule(patch: Partial<NonNullable<AutoRule>>) {
    setForm((f) => {
      const base: NonNullable<AutoRule> = f.autoRule ?? { metric: "sales", op: ">", value: 100, enabled: true };
      return { ...f, autoRule: { ...base, ...patch } };
    });
  }

  const preview = useMemo(() => {
    const bg = form.backgroundColor || form.color;
    const shadow = form.shadowStrength
      ? `0 ${Math.round(form.shadowStrength / 12)}px ${Math.round(form.shadowStrength / 4)}px -2px ${form.glowColor || bg}`
      : undefined;
    return { bg, shadow };
  }, [form]);

  async function save() {
    if (!form.label.trim()) return toast.error("Badge name is required");
    if (!form.badgeKey.trim()) return toast.error("Badge key is required");
    setSaving(true);
    try {
      if (isNew) await createBadgeType(form);
      else await updateBadgeTypeFull(badge.id, form);
      toast.success(isNew ? "Badge created" : "Badge updated");
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save badge");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto card-premium rounded-t-3xl sm:rounded-3xl border border-white/10"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-white/10 bg-card/90 backdrop-blur-xl">
          <h2 className="text-base font-display flex items-center gap-2">
            <Sparkles className="size-4 text-accent" /> {isNew ? "Create badge" : "Edit badge"}
          </h2>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5">
            <X className="size-4" />
          </button>
        </div>

        {/* Live preview */}
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Live preview</p>
          <div className="rounded-2xl bg-black/50 p-6 grid place-items-center">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold font-mono px-2 min-h-[24px] leading-none tracking-wider"
              style={{
                backgroundColor: preview.bg,
                color: form.textColor,
                border: form.borderColor ? `1px solid ${form.borderColor}` : undefined,
                borderRadius: `${form.radius}px`,
                boxShadow: preview.shadow,
              }}
            >
              {form.emoji && <span style={form.iconColor ? { color: form.iconColor } : undefined}>{form.emoji}</span>}
              {form.label || "Badge name"}
            </span>
          </div>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Basics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Badge name</span>
              <input
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
                placeholder="Hot Deal"
                className="mt-1 w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Key (unique)</span>
              <input
                value={form.badgeKey}
                onChange={(e) => { setKeyEdited(true); set("badgeKey", slugify(e.target.value)); }}
                placeholder="hot-deal"
                className="mt-1 w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Description</span>
            <input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Shown on flash-sale products"
              className="mt-1 w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm"
            />
          </label>

          {/* Icon */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Icon</span>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <input
                value={form.emoji}
                onChange={(e) => set("emoji", e.target.value)}
                className="size-10 text-center text-lg bg-white/5 border border-border rounded-lg"
              />
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={() => set("emoji", em)}
                    className={`size-8 grid place-items-center rounded-lg text-base hover:bg-white/10 ${form.emoji === em ? "bg-accent/20 ring-1 ring-accent" : "bg-white/5"}`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ColorField label="Background" value={form.backgroundColor} onChange={(v) => { set("backgroundColor", v); set("color", v); }} />
            <ColorField label="Text color" value={form.textColor} onChange={(v) => set("textColor", v)} />
            <ColorField label="Border color" value={form.borderColor} onChange={(v) => set("borderColor", v)} allowEmpty />
            <ColorField label="Glow color" value={form.glowColor} onChange={(v) => set("glowColor", v)} allowEmpty />
            <ColorField label="Icon color" value={form.iconColor} onChange={(v) => set("iconColor", v)} allowEmpty />
          </div>

          {/* Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex justify-between">
                Shadow strength <span>{form.shadowStrength}</span>
              </span>
              <input type="range" min={0} max={100} value={form.shadowStrength} onChange={(e) => set("shadowStrength", Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex justify-between">
                Corner radius <span>{form.radius}px</span>
              </span>
              <input type="range" min={0} max={20} value={form.radius} onChange={(e) => set("radius", Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
            </label>
          </div>

          {/* Priority + toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Priority (higher first)</span>
              <input type="number" value={form.priority} onChange={(e) => set("priority", Number(e.target.value))} className="mt-1 w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm font-mono" />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => set("enabled", !form.enabled)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border ${form.enabled ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground"}`}
              >
                {form.enabled ? "Active" : "Disabled"}
              </button>
              <button
                onClick={() => set("isDiscount", !form.isDiscount)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border ${form.isDiscount ? "bg-accent/15 border-accent/40 text-accent" : "border-border text-muted-foreground"}`}
              >
                Discount style
              </button>
            </div>
          </div>

          {/* Scheduling */}
          <div className="rounded-2xl border border-white/10 p-4">
            <p className="text-xs font-medium flex items-center gap-2 mb-3"><Clock className="size-3.5 text-accent" /> Scheduling (optional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Start</span>
                <input type="datetime-local" value={toLocalInput(form.startAt)} onChange={(e) => set("startAt", fromLocalInput(e.target.value))} className="mt-1 w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-xs" />
              </label>
              <label className="block">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">End</span>
                <input type="datetime-local" value={toLocalInput(form.endAt)} onChange={(e) => set("endAt", fromLocalInput(e.target.value))} className="mt-1 w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-xs" />
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Badge auto-activates between these times. Leave blank for always-on.</p>
          </div>

          {/* Automation rule */}
          <div className="rounded-2xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium flex items-center gap-2"><Bot className="size-3.5 text-accent" /> Automation rule (optional)</p>
              <button
                onClick={() => (ruleOn ? set("autoRule", null) : setRule({ enabled: true }))}
                role="switch"
                aria-checked={ruleOn}
                className={`relative w-11 h-6 rounded-full transition-colors ${ruleOn ? "bg-accent" : "bg-white/10"}`}
              >
                <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${ruleOn ? "translate-x-[22px]" : "translate-x-0.5"}`} />
              </button>
            </div>
            {ruleOn && form.autoRule && (
              <div className="grid grid-cols-3 gap-2">
                <select value={form.autoRule.metric} onChange={(e) => setRule({ metric: e.target.value as AutoRuleMetric })} className="bg-white/5 border border-border rounded-lg px-2 py-2 text-xs">
                  {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={form.autoRule.op} onChange={(e) => setRule({ op: e.target.value as ">" | "<" | ">=" | "<=" })} className="bg-white/5 border border-border rounded-lg px-2 py-2 text-xs font-mono">
                  <option value=">">&gt;</option>
                  <option value=">=">&ge;</option>
                  <option value="<">&lt;</option>
                  <option value="<=">&le;</option>
                </select>
                <input type="number" value={form.autoRule.value} onChange={(e) => setRule({ value: Number(e.target.value) })} className="bg-white/5 border border-border rounded-lg px-2 py-2 text-xs font-mono" />
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-2">Suggests this badge for products matching the rule (e.g. sales &gt; 100 → Best Seller).</p>
          </div>
        </div>

        <div className="sticky bottom-0 flex gap-2 px-5 py-4 border-t border-white/10 bg-card/90 backdrop-blur-xl">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold border border-border hover:bg-white/5">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-4 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold disabled:opacity-40">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save badge
          </button>
        </div>
      </motion.div>
    </div>
  );
}
