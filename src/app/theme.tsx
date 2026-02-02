/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePreference = "dark" | "light" | "paper" | "autumn";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "algoproblem.theme";

function isThemePreference(v: unknown): v is ThemePreference {
  return v === "dark" || v === "light" || v === "paper" || v === "autumn";
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // Backward-compatible: previously allowed "system"/"cream". Fold them into a stable default.
    if (raw === "system" || raw === "cream") return "dark";
    return isThemePreference(raw) ? raw : "dark";
  } catch {
    return "dark";
  }
}

function resolvePreference(preference: ThemePreference): ResolvedTheme {
  return preference === "dark" ? "dark" : "light";
}

function applyThemeState(preference: ThemePreference, resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("theme-dark", resolved === "dark");
  root.classList.toggle("theme-light", preference === "light");
  root.classList.toggle("theme-paper", preference === "paper");
  root.classList.toggle("theme-autumn", preference === "autumn");
  root.dataset.theme = preference;
  root.dataset.resolvedTheme = resolved;
}

export function applyStoredTheme() {
  const preference = readStoredPreference();
  const resolved = resolvePreference(preference);
  applyThemeState(preference, resolved);
  return { preference, resolved };
}

type ThemeState = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (v: ThemePreference) => void;
};

const ThemeCtx = createContext<ThemeState | null>(null);

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("ThemeProvider missing");
  return v;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredPreference());
  const resolved = useMemo(() => resolvePreference(preference), [preference]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore
    }
  }, [preference]);

  useEffect(() => {
    applyThemeState(preference, resolved);
  }, [preference, resolved]);

  const value = useMemo<ThemeState>(() => ({ preference, resolved, setPreference }), [preference, resolved]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
