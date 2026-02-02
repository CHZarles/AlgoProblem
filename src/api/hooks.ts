import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "./http";

type CacheEntry<T> = { at: number; data: T };
const queryCache = new Map<string, CacheEntry<unknown>>();

export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: {
    cache?: boolean;
    staleTimeMs?: number;
  },
) {
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const prevKeyRef = useRef<string | null>(null);
  const hasDataRef = useRef(false);

  const key = useMemo(() => JSON.stringify(deps), deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    const keyChanged = prevKeyRef.current !== key;
    prevKeyRef.current = key;

    const cacheEnabled = Boolean(options?.cache);
    const staleTimeMs = options?.staleTimeMs ?? 0;
    const cached = cacheEnabled ? (queryCache.get(key) as CacheEntry<T> | undefined) : undefined;
    const cacheFresh = Boolean(cached && (!staleTimeMs || Date.now() - cached.at <= staleTimeMs));

    if (keyChanged) {
      hasDataRef.current = false;
      if (cacheFresh && cached) {
        hasDataRef.current = true;
        setData(cached.data);
        setLoading(false);
        setRefreshing(false);
      } else {
        setData(null);
        setLoading(true);
        setRefreshing(false);
      }
    } else {
      // Avoid UI "flash" on background reloads when we already have data.
      setLoading(!hasDataRef.current);
      setRefreshing(hasDataRef.current);
    }

    setError(null);
    const shouldFetch = !keyChanged /* reload always refetch */ || !cacheFresh;
    if (shouldFetch) {
      fetcher()
        .then((v) => {
          if (!alive) return;
          hasDataRef.current = true;
          setData(v);
          if (cacheEnabled) queryCache.set(key, { at: Date.now(), data: v });
        })
        .catch((e) => {
          if (!alive) return;
          setError(e as ApiError);
          // Keep previous data on non-key reloads to prevent flicker.
          if (keyChanged && !cacheFresh) {
            setData(null);
            hasDataRef.current = false;
          }
        })
        .finally(() => {
          if (!alive) return;
          setLoading(false);
          setRefreshing(false);
        });
    } else {
      // Cached and fresh: no network request.
      setLoading(false);
      setRefreshing(false);
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadToken]);

  return {
    data,
    error,
    loading,
    refreshing,
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
