import { useEffect, useMemo, useState } from "react";
import { ApiError } from "./http";

export function useApiQuery<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const key = useMemo(() => JSON.stringify(deps), deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetcher()
      .then((v) => {
        if (!alive) return;
        setData(v);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e as ApiError);
        setData(null);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadToken]);

  return {
    data,
    error,
    loading,
    reload: () => setReloadToken((x) => x + 1),
  };
}

export function useDebouncedCallback<T extends (...args: never[]) => void>(fn: T, ms = 400) {
  const [t, setT] = useState<number | null>(null);
  return (...args: Parameters<T>) => {
    if (t) window.clearTimeout(t);
    const id = window.setTimeout(() => fn(...args), ms);
    setT(id);
  };
}

