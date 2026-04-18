import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { searchFoods } from "../lib/foods";
import { getFavoriteFoods } from "../lib/db";
import {
  fetchWithTimeout,
  lookupBarcodeWithTimeout,
  type ParsedFood,
  type BarcodeResult,
} from "../lib/openfoodfacts";
import type { FoodEntry, BuiltinFood } from "../lib/types";

export type SearchResult =
  | { type: "local"; food: BuiltinFood }
  | { type: "online"; food: ParsedFood };

export function useFoodSearch(scanOnMount?: boolean) {
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<FoodEntry[]>([]);
  const [onlineResults, setOnlineResults] = useState<ParsedFood[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);

  // Barcode state
  const [scannerVisible, setScannerVisible] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [scannedProductName, setScannedProductName] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeAbortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, ParsedFood[]>>(new Map());

  useEffect(() => {
    getFavoriteFoods().then(setFavorites).catch(() => {});
  }, []);

  const localResults = useMemo(() => {
    if (!query.trim()) return [];
    return searchFoods(query);
  }, [query]);

  // Derive onlineError reset from query changes via ref
  const prevQueryRef = useRef(query);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = query.trim();
    const queryChanged = prevQueryRef.current !== query;
    prevQueryRef.current = query;

    if (!trimmed || trimmed.length < 2) {
      if (queryChanged) {
        // Defer state updates to avoid synchronous setState in effect
        queueMicrotask(() => {
          setOnlineResults([]);
          setOnlineError(null);
        });
      }
      return;
    }

    const cached = cacheRef.current.get(trimmed.toLowerCase());
    if (cached) {
      queueMicrotask(() => {
        setOnlineResults(cached);
        setOnlineError(null);
      });
      return;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setOnlineLoading(true);
      setOnlineError(null);
      fetchWithTimeout(trimmed, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setOnlineLoading(false);
        if (result.ok) {
          setOnlineResults(result.foods);
          const cache = cacheRef.current;
          cache.set(trimmed.toLowerCase(), result.foods);
          if (cache.size > 10) {
            const first = cache.keys().next().value;
            if (first !== undefined) cache.delete(first);
          }
        } else {
          setOnlineResults([]);
          setOnlineError(result.error === "timeout" ? "Search timed out. Try again." : "Could not reach food database.");
        }
      });
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (barcodeAbortRef.current) barcodeAbortRef.current.abort();
    };
  }, []);

  const scanMountTriggered = useRef(false);
  useEffect(() => {
    if (scanOnMount && !scanMountTriggered.current && Platform.OS !== "web") {
      scanMountTriggered.current = true;
      queueMicrotask(() => setScannerVisible(true));
    }
  }, [scanOnMount]);

  const combinedResults: SearchResult[] = useMemo(() => {
    const items: SearchResult[] = [];
    localResults.forEach((food) => items.push({ type: "local", food }));
    onlineResults.forEach((food) => items.push({ type: "online", food }));
    return items;
  }, [localResults, onlineResults]);

  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    setScannerVisible(false);
    setBarcodeError(null);
    setBarcodeLoading(true);
    setScannedProductName(null);

    if (barcodeAbortRef.current) barcodeAbortRef.current.abort();
    const controller = new AbortController();
    barcodeAbortRef.current = controller;

    const result: BarcodeResult = await lookupBarcodeWithTimeout(barcode, controller.signal);
    if (controller.signal.aborted) return;
    setBarcodeLoading(false);

    if (!result.ok) {
      setBarcodeError(result.error === "timeout" ? "Lookup timed out. Please try again." : "Could not look up barcode. Check your connection.");
      return;
    }
    if (result.status === "not_found") { setBarcodeError("Product not found. Try searching by name."); return; }
    if (result.status === "incomplete") { setBarcodeError("Product found but nutrition data is incomplete."); return; }

    setScannedProductName(result.food.name);
    setOnlineResults([result.food]);
    setQuery("");
  }, []);

  const openScanner = useCallback(() => {
    setBarcodeError(null);
    setScannerVisible(true);
  }, []);

  const closeScanner = useCallback(() => {
    setScannerVisible(false);
    if (barcodeAbortRef.current) barcodeAbortRef.current.abort();
  }, []);

  return {
    query, setQuery,
    favorites, setFavorites,
    localResults, onlineResults,
    onlineLoading, onlineError,
    combinedResults,
    scannerVisible, barcodeLoading, barcodeError, scannedProductName,
    handleBarcodeScanned, openScanner, closeScanner,
  };
}
