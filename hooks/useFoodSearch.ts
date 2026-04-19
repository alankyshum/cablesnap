import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchFoods } from "../lib/foods";
import { getFavoriteFoods } from "../lib/db";
import { fetchWithTimeout, type ParsedFood } from "../lib/openfoodfacts";
import type { FoodEntry, BuiltinFood } from "../lib/types";
import { useBarcodeScanner } from "./useBarcodeScanner";
import { useOnlineFoodSearch } from "./useOnlineFoodSearch";

const SEARCH_ERRORS: Record<string, string> = {
  timeout: "Search timed out. Try again.",
  default: "Could not reach food database. Check your connection.",
};

export type SearchResult =
  | { type: "local"; food: BuiltinFood }
  | { type: "online"; food: ParsedFood };

export function useFoodSearch(scanOnMount?: boolean) {
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<FoodEntry[]>([]);
  const [onlineResults, setOnlineResults] = useState<ParsedFood[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onBarcodeFound = useCallback((food: ParsedFood) => {
    setOnlineResults([food]);
    setQuery("");
  }, []);

  const barcode = useBarcodeScanner(scanOnMount, onBarcodeFound);

  useEffect(() => { getFavoriteFoods().then(setFavorites).catch(() => {}); }, []);

  const localResults = useMemo(() => query.trim() ? searchFoods(query) : [], [query]);

  const { cacheRef } = useOnlineFoodSearch(query, setOnlineResults, setOnlineLoading, setOnlineError);

  const combinedResults: SearchResult[] = useMemo(() => {
    const items: SearchResult[] = [];
    localResults.forEach((food) => items.push({ type: "local", food }));
    onlineResults.forEach((food) => items.push({ type: "online", food }));
    return items;
  }, [localResults, onlineResults]);

  const retrySearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;
    cacheRef.current.delete(trimmed.toLowerCase());
    setOnlineError(null);
    setOnlineLoading(true);
    const ctrl = new AbortController();
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = ctrl;
    fetchWithTimeout(trimmed, ctrl.signal).then((r) => {
      if (ctrl.signal.aborted) return;
      setOnlineLoading(false);
      if (r.ok) { setOnlineResults(r.foods); cacheRef.current.set(trimmed.toLowerCase(), r.foods); }
      else { setOnlineResults([]); setOnlineError(SEARCH_ERRORS[r.error] ?? SEARCH_ERRORS.default); }
    });
  }, [query, cacheRef]);

  return {
    query, setQuery, favorites, setFavorites, localResults, onlineResults,
    onlineLoading, onlineError, combinedResults, ...barcode, retrySearch,
  };
}
