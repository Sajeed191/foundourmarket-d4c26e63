import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, THEME_OPTIONS, type ThemePreference } from "@/lib/theme";

const ICONS: Record<ThemePreference, React.ComponentType<{ className?: string }>> = {
  system: Monitor,
  dark: Moon,
  grey: Palette,
  light: Sun,
};

/**
 * Compact theme switcher for toolbars/headers (e.g. the admin console).
 * Switches instantly between System, Dark, Grey and Light, reusing the same
 * ThemeProvider that powers the full ThemeSelector — so the choice is shared
 * across the storefront and admin pages.
 */
export function ThemeMenu() {
  const { theme, effectiveTheme, setTheme } = useTheme();
  const ActiveIcon = ICONS[theme === "system" ? effectiveTheme : theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Change theme"
          className="grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground hover:border-accent/40"
        >
          <ActiveIcon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_OPTIONS.map((opt) => {
          const Icon = ICONS[opt.value];
          const active = theme === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className="gap-2"
            >
              <Icon className={`size-4 ${active ? "text-accent" : "text-muted-foreground"}`} />
              <span className="flex-1">{opt.label}</span>
              {active && <Check className="size-3.5 text-accent" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
