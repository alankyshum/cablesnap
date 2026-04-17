/**
 * Open Food Facts API client for FitForge.
 * Queries the free, open-source food database (3M+ products).
 * No API key required.
 */

const BASE_URL =
  "https://world.openfoodfacts.org/cgi/search.pl";
const USER_AGENT =
  "FitForge/0.5.0 (https://github.com/alankyshum/fitforge)";
const TIMEOUT_MS = 5000;
const PAGE_SIZE = 20;
const FIELDS =
  "product_name,brands,nutriments,serving_size,serving_quantity";

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

export type ParsedFood = {
  /** Composite key for dedup: lowercased name */
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingLabel: string;
  /** Whether this is per-serving (true) or per-100g (false) */
  isPerServing: boolean;
};

// ── Validation ──────────────────────────────────────────────────

function isFiniteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

export function isValidProduct(p: OFFProduct): boolean {
  if (!p.product_name || typeof p.product_name !== "string" || !p.product_name.trim()) {
    return false;
  }
  const n = p.nutriments;
  if (!n) return false;

  if (!isFiniteInRange(n["energy-kcal_100g"], 0, 2000)) return false;
  if (!isFiniteInRange(n.proteins_100g, 0, 200)) return false;
  if (!isFiniteInRange(n.carbohydrates_100g, 0, 200)) return false;
  if (!isFiniteInRange(n.fat_100g, 0, 200)) return false;

  return true;
}

// ── Name formatting ─────────────────────────────────────────────

export function formatProductName(p: OFFProduct): string {
  const brand = p.brands?.trim();
  const name = p.product_name.trim();
  const combined = brand ? `${brand} — ${name}` : name;
  return combined.length > 100 ? combined.slice(0, 97) + "..." : combined;
}

// ── Serving logic ───────────────────────────────────────────────

function truncateServing(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

export function parseProduct(p: OFFProduct): ParsedFood {
  const n = p.nutriments;
  const hasServing =
    typeof p.serving_quantity === "number" &&
    p.serving_quantity > 0 &&
    typeof p.serving_size === "string" &&
    p.serving_size.trim().length > 0;

  const servingScale = hasServing ? p.serving_quantity! / 100 : 1;
  const servingLabel = hasServing
    ? truncateServing(p.serving_size!.trim(), 30)
    : "100g";

  return {
    name: formatProductName(p),
    calories: Math.round((n["energy-kcal_100g"] ?? 0) * servingScale),
    protein: Math.round((n.proteins_100g ?? 0) * servingScale * 10) / 10,
    carbs: Math.round((n.carbohydrates_100g ?? 0) * servingScale * 10) / 10,
    fat: Math.round((n.fat_100g ?? 0) * servingScale * 10) / 10,
    servingLabel,
    isPerServing: hasServing,
  };
}

// ── API fetch ───────────────────────────────────────────────────

export type SearchError = "offline" | "timeout" | "unknown";

export type SearchResult =
  | { ok: true; foods: ParsedFood[] }
  | { ok: false; error: SearchError };

export async function searchOnlineFoods(
  query: string,
  signal?: AbortSignal
): Promise<SearchResult> {
  const url = `${BASE_URL}?${new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(PAGE_SIZE),
    fields: FIELDS,
  })}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal,
    });

    if (!response.ok) {
      return { ok: false, error: "unknown" };
    }

    const data: OFFSearchResponse = await response.json();
    const foods = (data.products ?? [])
      .filter(isValidProduct)
      .map(parseProduct);

    return { ok: true, foods };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      // Caller cancelled — treat as empty (not an error to display)
      return { ok: true, foods: [] };
    }
    if (err instanceof TypeError) {
      // Network error (fetch throws TypeError for network failures)
      return { ok: false, error: "offline" };
    }
    return { ok: false, error: "unknown" };
  }
}

/**
 * Creates a fetch with a timeout wrapper.
 * The caller should use AbortController for cancellation;
 * this adds an additional timeout safety net.
 */
export function fetchWithTimeout(
  query: string,
  signal?: AbortSignal
): Promise<SearchResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ ok: false, error: "timeout" });
    }, TIMEOUT_MS);

    searchOnlineFoods(query, signal).then((result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}
