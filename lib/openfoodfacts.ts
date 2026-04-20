/**
 * Open Food Facts API client for CableSnap.
 * Queries the free, open-source food database (3M+ products).
 * No API key required.
 */

import { isValidProduct, parseProduct, type ParsedFood } from "./openfoodfacts-parse";
export { isValidProduct, parseProduct, formatProductName } from "./openfoodfacts-parse";
export type { ParsedFood } from "./openfoodfacts-parse";

const BASE = "https://world.openfoodfacts.net";
const SEARCH_URL = `${BASE}/cgi/search.pl`;
const BARCODE_URL = `${BASE}/api/v2/product`;
const UA = "CableSnap/0.6.0 (https://github.com/alankyshum/cablesnap)";
const TIMEOUT = 10000;
const FIELDS = "product_name,brands,nutriments,serving_size,serving_quantity";

export type OFFProduct = {
  product_name: string;
  brands?: string;
  nutriments: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
  serving_size?: string;
  serving_quantity?: number;
};

export type OFFSearchResponse = {
  count: number;
  products: OFFProduct[];
};

export type OFFProductResponse = {
  status: 0 | 1;
  product: OFFProduct;
};

function classifyFetchError(err: unknown): SearchError {
  if (err instanceof Error && err.name === "AbortError") return "abort" as SearchError;
  if (err instanceof TypeError) return "offline";
  return "unknown";
}

// ── API fetch ───────────────────────────────────────────────────

export type SearchError = "offline" | "timeout" | "unknown";

export type SearchResult =
  | { ok: true; foods: ParsedFood[] }
  | { ok: false; error: SearchError };

export type BarcodeResult =
  | { ok: true; status: "found"; food: ParsedFood }
  | { ok: true; status: "not_found" }
  | { ok: true; status: "incomplete" }
  | { ok: false; error: SearchError };

export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal
): Promise<BarcodeResult> {
  const url = `${BARCODE_URL}/${encodeURIComponent(barcode)}?fields=${FIELDS}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA },
      signal,
    });
    if (!response.ok) return { ok: false, error: "unknown" };
    const data: OFFProductResponse = await response.json();
    if (data.status === 0 || !data.product) return { ok: true, status: "not_found" };
    if (!isValidProduct(data.product)) return { ok: true, status: "incomplete" };
    return { ok: true, status: "found", food: parseProduct(data.product) };
  } catch (err: unknown) {
    const kind = classifyFetchError(err);
    if (kind === ("abort" as SearchError)) return { ok: true, status: "not_found" };
    return { ok: false, error: kind };
  }
}

function withTimeout<T>(fn: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), TIMEOUT);
    fn.then((r) => { clearTimeout(timer); resolve(r); });
  });
}

export function lookupBarcodeWithTimeout(barcode: string, signal?: AbortSignal): Promise<BarcodeResult> {
  return withTimeout(lookupBarcode(barcode, signal), { ok: false, error: "timeout" });
}

export async function searchOnlineFoods(query: string, signal?: AbortSignal): Promise<SearchResult> {
  const url = `${SEARCH_URL}?${new URLSearchParams({
    search_terms: query, search_simple: "1", action: "process", json: "1", page_size: "20", fields: FIELDS,
  })}`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": UA }, signal });
    if (!response.ok) return { ok: false, error: "unknown" };
    const data: OFFSearchResponse = await response.json();
    return { ok: true, foods: (data.products ?? []).filter(isValidProduct).map(parseProduct) };
  } catch (err: unknown) {
    const kind = classifyFetchError(err);
    if (kind === ("abort" as SearchError)) return { ok: true, foods: [] };
    return { ok: false, error: kind };
  }
}

export function fetchWithTimeout(query: string, signal?: AbortSignal): Promise<SearchResult> {
  return withTimeout(searchOnlineFoods(query, signal), { ok: false, error: "timeout" });
}
