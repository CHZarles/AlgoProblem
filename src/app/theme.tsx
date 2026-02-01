/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePreference = "system" | "dark" | "light" | "cream";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "algoproblem.theme";

function isThemePreference(v: unknown): v is ThemePreference {
  return v === "system" || v === "dark" || v === "light" || v === "cream";
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

function resolvePreference(preference: ThemePreference): ResolvedTheme {
  if (preference === "dark") return "dark";
  if (preference === "light" || preference === "cream") return "light";
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  } catch {
    return "dark";
  }
}

function applyThemeState(preference: ThemePreference, resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("theme-dark", resolved === "dark");
  root.classList.toggle("theme-light", resolved === "light" && preference !== "cream");
  root.classList.toggle("theme-cream", preference === "cream");
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
  const [system, setSystem] = useState<ResolvedTheme>(() => resolvePreference("system"));

  useEffect(() => {
    let mounted = true;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;

    const onChange = () => {
      if (!mounted) return;
      setSystem(mq.matches ? "dark" : "light");
    };

    onChange();
    mq.addEventListener("change", onChange);
    return () => {
      mounted = false;
      mq.removeEventListener("change", onChange);
    };
  }, []);

  const resolved = useMemo(
    () => (preference === "system" ? system : preference === "dark" ? "dark" : "light"),
    [preference, system],
  );

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
