import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreference = "system" | "dark" | "grey" | "light";
export type EffectiveTheme = "dark" | "grey" | "light";

export const THEME_STORAGE_KEY = "fom-theme";

export const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  hint: string;
}> = [
  { value: "system", label: "System", hint: "Follows your device theme" },
  { value: "dark", label: "Dark", hint: "Recommended — premium luxury look" },
  { value: "grey", label: "Grey", hint: "Modern neutral grey interface" },
  { value: "light", label: "Light", hint: "Clean professional light theme" },
];

function prefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

export function resolveTheme(pref: ThemePreference): EffectiveTheme {
  if (pref === "system") return prefersDark() ? "dark" : "light";
  return pref;
}

export function applyTheme(effective: EffectiveTheme) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.setAttribute("data-theme", effective);
  el.classList.toggle("dark", effective === "dark");
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === "system" || raw === "dark" || raw === "grey" || raw === "light") return raw;
  return "system";
}

type ThemeContextValue = {
  theme: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredPreference());
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() => resolveTheme(theme));

  // Apply the resolved theme whenever the preference changes.
  useEffect(() => {
    const effective = resolveTheme(theme);
    setEffectiveTheme(effective);
    applyTheme(effective);
  }, [theme]);

  // When in "system" mode, react live to OS theme changes.
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const effective = resolveTheme("system");
      setEffectiveTheme(effective);
      applyTheme(effective);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    }
  }, []);

  const value = useMemo(
    () => ({ theme, effectiveTheme, setTheme }),
    [theme, effectiveTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
