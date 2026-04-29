import {
  isValidProduct,
  formatProductName,
  parseProduct,
  fetchWithTimeout,
  lookupBarcode,
  lookupBarcodeWithTimeout,
  type OFFProduct,
} from "../../lib/openfoodfacts";

// ── Helpers ─────────────────────────────────────────────────────

function makeProduct(overrides: Partial<OFFProduct> = {}): OFFProduct {
  return {
    product_name: "Test Food",
    brands: "TestBrand",
    nutriments: {
      "energy-kcal_100g": 200,
      proteins_100g: 10,
      carbohydrates_100g: 25,
      fat_100g: 8,
    },
    serving_size: "1 cup (240ml)",
    serving_quantity: 240,
    ...overrides,
  };
}

// ── Validation ──────────────────────────────────────────────────
// Consolidated as parameterized cases (BLD-816 test-budget reclamation).
// Each row is one (description, product → expected validity) case.
type V = { name: string; product: OFFProduct; expected: boolean };

function nutMutate(
  field: "energy-kcal_100g" | "proteins_100g" | "carbohydrates_100g" | "fat_100g",
  value: number | undefined,
): OFFProduct {
  const p = makeProduct();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (p.nutriments as any)[field] = value as any;
  return p;
}

const validationCases: V[] = [
  { name: "valid product", product: makeProduct(), expected: true },
  {
    name: "all macros = 0 (water)",
    product: makeProduct({
      nutriments: { "energy-kcal_100g": 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
    }),
    expected: true,
  },
  { name: "empty product_name", product: makeProduct({ product_name: "" }), expected: false },
  { name: "whitespace product_name", product: makeProduct({ product_name: "  " }), expected: false },
  { name: "negative calories", product: nutMutate("energy-kcal_100g", -10), expected: false },
  { name: "calories > 2000 per 100g", product: nutMutate("energy-kcal_100g", 2001), expected: false },
  { name: "NaN protein", product: nutMutate("proteins_100g", NaN), expected: false },
  { name: "Infinity carbs", product: nutMutate("carbohydrates_100g", Infinity), expected: false },
  { name: "negative fat", product: nutMutate("fat_100g", -1), expected: false },
  { name: "macros > 200 per 100g", product: nutMutate("proteins_100g", 201), expected: false },
  {
    name: "missing nutriments",
    product: (() => {
      const p = makeProduct();
      (p as Record<string, unknown>).nutriments = undefined;
      return p;
    })(),
    expected: false,
  },
  { name: "undefined calories", product: nutMutate("energy-kcal_100g", undefined), expected: false },
  { name: "boundary 2000 kcal", product: nutMutate("energy-kcal_100g", 2000), expected: true },
  { name: "boundary 200g protein", product: nutMutate("proteins_100g", 200), expected: true },
];

describe("isValidProduct", () => {
  it.each(validationCases)("$name → $expected", ({ product, expected }) => {
    expect(isValidProduct(product)).toBe(expected);
  });
});

// ── Name formatting ─────────────────────────────────────────────

describe("formatProductName", () => {
  type N = { name: string; brands: string | undefined; product_name: string; expected: string | RegExp };

  const longName = "A".repeat(100);
  const cases: N[] = [
    { name: "brand + name with em dash", brands: "Chobani", product_name: "Greek Yogurt", expected: "Chobani — Greek Yogurt" },
    { name: "no brand (undefined)", brands: undefined, product_name: "Plain Oats", expected: "Plain Oats" },
    { name: "empty brand", brands: "", product_name: "Plain Oats", expected: "Plain Oats" },
    { name: "whitespace brand", brands: "   ", product_name: "Plain Oats", expected: "Plain Oats" },
    { name: "94-char name fits without ellipsis", brands: "B", product_name: "A".repeat(94), expected: /^B — A+$/ },
  ];

  it.each(cases)("$name", ({ brands, product_name, expected }) => {
    const out = formatProductName(makeProduct({ brands, product_name }));
    expect(out.length).toBeLessThanOrEqual(100);
    if (expected instanceof RegExp) {
      expect(out).toMatch(expected);
      expect(out.endsWith("...")).toBe(false);
    } else {
      expect(out).toBe(expected);
    }
  });

  it("truncates to 100 chars with ellipsis when over budget", () => {
    const result = formatProductName(makeProduct({ brands: "Brand", product_name: longName }));
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith("...")).toBe(true);
  });
});

// ── Per-100g vs per-serving conversion ──────────────────────────

describe("parseProduct", () => {
  it("computes per-serving values when serving_quantity > 0", () => {
    const p = makeProduct({
      nutriments: {
        "energy-kcal_100g": 100,
        proteins_100g: 10,
        carbohydrates_100g: 20,
        fat_100g: 5,
      },
      serving_quantity: 200, // 200g serving
      serving_size: "1 large bowl",
    });
    const food = parseProduct(p);
    // per serving = per_100g × (200/100) = ×2
    expect(food.calories).toBe(200);
    expect(food.protein).toBe(20);
    expect(food.carbs).toBe(40);
    expect(food.fat).toBe(10);
    expect(food.servingLabel).toBe("1 large bowl");
    expect(food.isPerServing).toBe(true);
  });

  // Three different ways serving info can be missing/empty → all fall back to per-100g.
  it.each([
    { name: "serving_quantity is 0", serving_quantity: 0, serving_size: "1 cup" },
    { name: "serving_quantity is undefined", serving_quantity: undefined, serving_size: "1 piece" },
    { name: "serving_size is empty", serving_quantity: 50, serving_size: "" },
  ])("falls back to per-100g when $name", ({ serving_quantity, serving_size }) => {
    const p = makeProduct({
      nutriments: {
        "energy-kcal_100g": 100,
        proteins_100g: 10,
        carbohydrates_100g: 20,
        fat_100g: 5,
      },
      serving_quantity,
      serving_size,
    });
    const food = parseProduct(p);
    expect(food.servingLabel).toBe("100g");
    expect(food.isPerServing).toBe(false);
    // per-100g values are passed through unchanged
    expect(food.calories).toBe(100);
  });

  it("truncates long serving_size to 30 chars with ellipsis", () => {
    const p = makeProduct({
      serving_size: "A".repeat(40),
      serving_quantity: 100,
    });
    const food = parseProduct(p);
    expect(food.servingLabel.length).toBeLessThanOrEqual(30);
    expect(food.servingLabel.endsWith("...")).toBe(true);
  });

  it("rounds calories to integer, macros to 1 decimal, and uses brand-prefixed name", () => {
    const p = makeProduct({
      brands: "Chobani",
      product_name: "Yogurt",
      nutriments: {
        "energy-kcal_100g": 133,
        proteins_100g: 7.33,
        carbohydrates_100g: 14.77,
        fat_100g: 3.89,
      },
      serving_quantity: 50,
      serving_size: "1 piece",
    });
    const food = parseProduct(p);
    // scale = 50/100 = 0.5
    expect(food.calories).toBe(67); // Math.round(133 * 0.5) = 67
    expect(food.protein).toBe(3.7);
    expect(food.carbs).toBe(7.4);
    expect(food.fat).toBe(1.9);
    expect(food.name).toBe("Chobani — Yogurt");
  });

  it("handles missing/zero nutriment values and undefined serving_quantity", () => {
    const p = makeProduct({
      nutriments: {
        "energy-kcal_100g": 0,
        proteins_100g: 0,
        carbohydrates_100g: 0,
        fat_100g: 0,
      },
      serving_quantity: undefined,
    });
    const food = parseProduct(p);
    expect(food.calories).toBe(0);
    expect(food.protein).toBe(0);
    expect(food.carbs).toBe(0);
    expect(food.fat).toBe(0);
  });
});

// ── fetchWithTimeout ────────────────────────────────────────────

describe("fetchWithTimeout", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns parsed foods on successful response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          count: 1,
          products: [
            {
              product_name: "Test",
              brands: "Brand",
              nutriments: {
                "energy-kcal_100g": 100,
                proteins_100g: 5,
                carbohydrates_100g: 20,
                fat_100g: 3,
              },
              serving_size: "1 cup",
              serving_quantity: 200,
            },
          ],
        }),
    });

    const result = await fetchWithTimeout("test");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.foods).toHaveLength(1);
      expect(result.foods[0].name).toBe("Brand — Test");
    }
  });

  it("filters out invalid products from a multi-product response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          count: 2,
          products: [
            {
              product_name: "Valid",
              nutriments: {
                "energy-kcal_100g": 100,
                proteins_100g: 5,
                carbohydrates_100g: 20,
                fat_100g: 3,
              },
            },
            {
              product_name: "",
              nutriments: {
                "energy-kcal_100g": 100,
                proteins_100g: 5,
                carbohydrates_100g: 20,
                fat_100g: 3,
              },
            },
          ],
        }),
    });

    const result = await fetchWithTimeout("test");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.foods).toHaveLength(1);
      expect(result.foods[0].name).toBe("Valid");
    }
  });

  it.each([
    { name: "offline on TypeError", reject: new TypeError("Network request failed"), expectedError: "offline" },
    {
      name: "unknown on non-ok response",
      resolve: { ok: false, status: 500 },
      expectedError: "unknown",
    },
  ])("returns $expectedError error: $name", async ({ reject, resolve, expectedError }) => {
    global.fetch = jest
      .fn()
      .mockImplementation(() => (reject ? Promise.reject(reject) : Promise.resolve(resolve)));
    const result = await fetchWithTimeout("test");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(expectedError);
  });

  it("returns empty foods for empty products array and aborted requests", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count: 0, products: [] }),
    });

    let result = await fetchWithTimeout("test");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.foods).toHaveLength(0);

    // Aborted: AbortError surfaced as ok with empty foods
    const controller = new AbortController();
    controller.abort();
    global.fetch = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    result = await fetchWithTimeout("test", controller.signal);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.foods).toHaveLength(0);
  });
});

// ── lookupBarcode ───────────────────────────────────────────────

describe("lookupBarcode", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns found food on valid barcode response and calls correct API URL", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 1,
          product: {
            product_name: "Oat Milk",
            brands: "Oatly",
            nutriments: {
              "energy-kcal_100g": 46,
              proteins_100g: 1,
              carbohydrates_100g: 6.7,
              fat_100g: 1.5,
            },
            serving_size: "250ml",
            serving_quantity: 250,
          },
        }),
    });

    const result = await lookupBarcode("7394376616037");
    expect(result.ok).toBe(true);
    if (result.ok && result.status === "found") {
      expect(result.food.name).toBe("Oatly — Oat Milk");
      expect(result.food.calories).toBe(115); // 46 * 2.5
    }
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/product/7394376616037"),
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.any(String) }),
      }),
    );
  });

  it.each([
    {
      name: "not_found when status is 0",
      resolve: { ok: true, json: () => Promise.resolve({ status: 0, product: null }) },
      ok: true,
      status: "not_found" as const,
    },
    {
      name: "incomplete when product fails validation",
      resolve: {
        ok: true,
        json: () =>
          Promise.resolve({
            status: 1,
            product: {
              product_name: "Unknown Item",
              nutriments: { "energy-kcal_100g": -5, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
            },
          }),
      },
      ok: true,
      status: "incomplete" as const,
    },
  ])("returns $status: $name", async ({ resolve, ok, status }) => {
    global.fetch = jest.fn().mockResolvedValue(resolve);
    const result = await lookupBarcode("1234567890123");
    expect(result.ok).toBe(ok);
    if (result.ok) expect(result.status).toBe(status);
  });

  it.each([
    {
      name: "offline on network failure",
      reject: new TypeError("Network request failed"),
      expectedError: "offline" as const,
    },
    {
      name: "unknown on non-ok response",
      resolve: { ok: false, status: 500 },
      expectedError: "unknown" as const,
    },
  ])("error case: $name", async ({ reject, resolve, expectedError }) => {
    global.fetch = jest
      .fn()
      .mockImplementation(() => (reject ? Promise.reject(reject) : Promise.resolve(resolve)));
    const result = await lookupBarcode("1234567890123");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(expectedError);
  });
});

// ── lookupBarcodeWithTimeout ────────────────────────────────────

describe("lookupBarcodeWithTimeout", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it("returns result on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 1,
          product: {
            product_name: "Test",
            nutriments: {
              "energy-kcal_100g": 100,
              proteins_100g: 5,
              carbohydrates_100g: 20,
              fat_100g: 3,
            },
          },
        }),
    });

    const result = await lookupBarcodeWithTimeout("1234567890123");
    expect(result.ok).toBe(true);
    if (result.ok && result.status === "found") {
      expect(result.food.name).toBe("Test");
    }
  });
});
