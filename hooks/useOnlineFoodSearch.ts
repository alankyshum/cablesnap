import { useEffect, useRef } from "react";
import { fetchWithTimeout, type ParsedFood } from "../lib/openfoodfacts";

const SEARCH_ERRORS: Record<string, string> = {
  timeout: "Search timed out. Try again.",
  default: "Could not reach food database. Check your connection.",
};

export function useOnlineFoodSearch(
  query: string,
  setOnlineResults: (r: ParsedFood[]) => void,
  setOnlineLoading: (l: boolean) => void,
  setOnlineError: (e: string | null) => void,
) {
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Map<string, ParsedFood[]>>(new Map());
  const prevQueryRef = useRef(query);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    const trimmed = query.trim();
    const changed = prevQueryRef.current !== query;
    prevQueryRef.current = query;
    if (!trimmed || trimmed.length < 2) {
      if (changed) queueMicrotask(() => { setOnlineResults([]); setOnlineError(null); });
      return;
    }
    const cached = cacheRef.current.get(trimmed.toLowerCase());
    if (cached) { queueMicrotask(() => { setOnlineResults(cached); setOnlineError(null); }); return; }
    debounceRef.current = setTimeout(() => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setOnlineLoading(true);
      setOnlineError(null);
      fetchWithTimeout(trimmed, ctrl.signal).then((r) => {
        if (ctrl.signal.aborted) return;
        setOnlineLoading(false);
        if (r.ok) {
          setOnlineResults(r.foods);
          const c = cacheRef.current;
          c.set(trimmed.toLowerCase(), r.foods);
          if (c.size > 10) { const f = c.keys().next().value; if (f !== undefined) c.delete(f); }
        } else {
          setOnlineResults([]);
          setOnlineError(SEARCH_ERRORS[r.error] ?? SEARCH_ERRORS.default);
        }
      });
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, setOnlineResults, setOnlineLoading, setOnlineError]);

  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { cacheRef };
}
