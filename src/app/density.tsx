/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Density = "compact" | "standard" | "comfortable";

const STORAGE_KEY = "algoproblem.density";

function isDensity(v: unknown): v is Density {
  return v === "compact" || v === "standard" || v === "comfortable";
}

function readStoredDensity(): Density {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isDensity(raw) ? raw : "standard";
  } catch {
    return "standard";
  }
}

function applyDensityState(density: Density) {
  const root = document.documentElement;
  root.dataset.density = density;
}

type DensityState = {
  density: Density;
  setDensity: (v: Density) => void;
};

const DensityCtx = createContext<DensityState | null>(null);

export function useDensity() {
  const v = useContext(DensityCtx);
  if (!v) throw new Error("DensityProvider missing");
  return v;
}

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensity] = useState<Density>(() => readStoredDensity());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, density);
    } catch {
      // ignore
    }
  }, [density]);

  useEffect(() => {
    applyDensityState(density);
  }, [density]);

  const value = useMemo<DensityState>(() => ({ density, setDensity }), [density]);

  return <DensityCtx.Provider value={value}>{children}</DensityCtx.Provider>;
}

