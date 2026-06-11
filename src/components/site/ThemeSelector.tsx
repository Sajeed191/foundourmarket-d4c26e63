import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme, THEME_OPTIONS, type ThemePreference } from "@/lib/theme";

const ICONS: Record<ThemePreference, React.ComponentType<{ className?: string }>> = {
  system: Monitor,
  dark: Moon,
  grey: Palette,
  light: Sun,
};

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
        <Palette className="size-4 text-accent" />
        <h2 className="font-display text-base font-semibold">Theme</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-4">
        {THEME_OPTIONS.map((opt) => {
          const Icon = ICONS[opt.value];
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(opt.value)}
              className={`relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                active
                  ? "border-accent bg-accent/10 shadow-[0_0_0_1px_var(--color-accent)]"
                  : "border-border bg-background hover:border-accent/40"
              }`}
            >
              {active && (
                <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-accent text-accent-foreground">
                  <Check className="size-3" />
                </span>
              )}
              <Icon className={`size-5 ${active ? "text-accent" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
