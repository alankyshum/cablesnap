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

describe("isValidProduct", () => {
  it("accepts a valid product", () => {
    expect(isValidProduct(makeProduct())).toBe(true);
  });

  it("accepts product with all macros = 0 (water)", () => {
    const water = makeProduct({
      nutriments: {
        "energy-kcal_100g": 0,
        proteins_100g: 0,
        carbohydrates_100g: 0,
        fat_100g: 0,
      },
    });
    expect(isValidProduct(water)).toBe(true);
  });

  it("rejects empty product_name", () => {
    expect(isValidProduct(makeProduct({ product_name: "" }))).toBe(false);
    expect(isValidProduct(makeProduct({ product_name: "  " }))).toBe(false);
  });

  it("rejects negative calories", () => {
    const p = makeProduct();
    p.nutriments["energy-kcal_100g"] = -10;
    expect(isValidProduct(p)).toBe(false);
  });

  it("rejects absurdly high calories (>2000 per 100g)", () => {
    const p = makeProduct();
    p.nutriments["energy-kcal_100g"] = 2001;
    expect(isValidProduct(p)).toBe(false);
  });

  it("rejects NaN in protein", () => {
    const p = makeProduct();
    p.nutriments.proteins_100g = NaN;
    expect(isValidProduct(p)).toBe(false);
  });

  it("rejects Infinity in carbs", () => {
    const p = makeProduct();
    p.nutriments.carbohydrates_100g = Infinity;
    expect(isValidProduct(p)).toBe(false);
  });

  it("rejects negative fat", () => {
    const p = makeProduct();
    p.nutriments.fat_100g = -1;
    expect(isValidProduct(p)).toBe(false);
  });

  it("rejects macros > 200 per 100g", () => {
    const p = makeProduct();
    p.nutriments.proteins_100g = 201;
    expect(isValidProduct(p)).toBe(false);
  });

  it("rejects missing nutriments", () => {
    const p = makeProduct();
    (p as Record<string, unknown>).nutriments = undefined;
    expect(isValidProduct(p)).toBe(false);
  });

  it("rejects undefined calories", () => {
    const p = makeProduct();
    p.nutriments["energy-kcal_100g"] = undefined;
    expect(isValidProduct(p)).toBe(false);
  });

  it("accepts exactly 2000 kcal (boundary)", () => {
    const p = makeProduct();
    p.nutriments["energy-kcal_100g"] = 2000;
    expect(isValidProduct(p)).toBe(true);
  });

  it("accepts exactly 200g protein (boundary)", () => {
    const p = makeProduct();
    p.nutriments.proteins_100g = 200;
    expect(isValidProduct(p)).toBe(true);
  });
});

// ── Name formatting ─────────────────────────────────────────────

describe("formatProductName", () => {
  it("combines brand and product name with em dash", () => {
    const p = makeProduct({ brands: "Chobani", product_name: "Greek Yogurt" });
    expect(formatProductName(p)).toBe("Chobani — Greek Yogurt");
  });

  it("returns product name alone when no brand", () => {
    const p = makeProduct({ brands: undefined, product_name: "Plain Oats" });
    expect(formatProductName(p)).toBe("Plain Oats");
  });

  it("returns product name when brand is empty string", () => {
    const p = makeProduct({ brands: "", product_name: "Plain Oats" });
    expect(formatProductName(p)).toBe("Plain Oats");
  });

  it("returns product name when brand is whitespace", () => {
    const p = makeProduct({ brands: "   ", product_name: "Plain Oats" });
    expect(formatProductName(p)).toBe("Plain Oats");
  });

  it("truncates to 100 chars with ellipsis", () => {
    const longName = "A".repeat(100);
    const p = makeProduct({ brands: "Brand", product_name: longName });
    const result = formatProductName(p);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith("...")).toBe(true);
  });

  it("does not truncate at exactly 100 chars", () => {
    const p = makeProduct({ brands: "B", product_name: "A".repeat(94) });
    // "B — " + 94 A's = 98 chars, fits
    const result = formatProductName(p);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith("...")).toBe(false);
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

  it("uses per-100g when serving_quantity is 0", () => {
    const p = makeProduct({
      nutriments: {
        "energy-kcal_100g": 100,
        proteins_100g: 10,
        carbohydrates_100g: 20,
        fat_100g: 5,
      },
      serving_quantity: 0,
      serving_size: "1 cup",
    });
    const food = parseProduct(p);
    expect(food.calories).toBe(100);
    expect(food.protein).toBe(10);
    expect(food.carbs).toBe(20);
    expect(food.fat).toBe(5);
    expect(food.servingLabel).toBe("100g");
    expect(food.isPerServing).toBe(false);
  });

  it("uses per-100g when serving_quantity is null/undefined", () => {
    const p = makeProduct({
      nutriments: {
        "energy-kcal_100g": 300,
        proteins_100g: 15,
        carbohydrates_100g: 30,
        fat_100g: 12,
      },
      serving_quantity: undefined,
      serving_size: "1 piece",
    });
    const food = parseProduct(p);
    expect(food.calories).toBe(300);
    expect(food.servingLabel).toBe("100g");
    expect(food.isPerServing).toBe(false);
  });

  it("uses per-100g when serving_size is empty", () => {
    const p = makeProduct({
      nutriments: {
        "energy-kcal_100g": 100,
        proteins_100g: 5,
        carbohydrates_100g: 10,
        fat_100g: 3,
      },
      serving_quantity: 50,
      serving_size: "",
    });
    const food = parseProduct(p);
    expect(food.servingLabel).toBe("100g");
    expect(food.isPerServing).toBe(false);
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

  it("rounds calories to integer, macros to 1 decimal", () => {
    const p = makeProduct({
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
    expect(food.protein).toBe(3.7); // Math.round(7.33 * 0.5 * 10) / 10
    expect(food.carbs).toBe(7.4);
    expect(food.fat).toBe(1.9); // Math.round(3.89 * 0.5 * 10) / 10
  });

  it("formats name with brand", () => {
    const p = makeProduct({ brands: "Chobani", product_name: "Yogurt" });
    const food = parseProduct(p);
    expect(food.name).toBe("Chobani — Yogurt");
  });

  it("handles missing nutriment values (defaults to 0)", () => {
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

  it("filters out invalid products", async () => {
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

  it("returns offline error on network failure", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed"));

    const result = await fetchWithTimeout("test");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("offline");
    }
  });

  it("returns unknown error on non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await fetchWithTimeout("test");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("unknown");
    }
  });

  it("handles empty products array", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count: 0, products: [] }),
    });

    const result = await fetchWithTimeout("test");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.foods).toHaveLength(0);
    }
  });

  it("returns empty foods on aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error("Aborted"), { name: "AbortError" })
    );

    const result = await fetchWithTimeout("test", controller.signal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.foods).toHaveLength(0);
    }
  });
});

// ── lookupBarcode ───────────────────────────────────────────────

describe("lookupBarcode", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns found food on valid barcode response", async () => {
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
  });

  it("returns not_found when status is 0", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 0, product: null }),
    });

    const result = await lookupBarcode("0000000000000");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("not_found");
    }
  });

  it("returns incomplete when product fails validation", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 1,
          product: {
            product_name: "Unknown Item",
            nutriments: {
              "energy-kcal_100g": -5,
              proteins_100g: 0,
              carbohydrates_100g: 0,
              fat_100g: 0,
            },
          },
        }),
    });

    const result = await lookupBarcode("1234567890123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("incomplete");
    }
  });

  it("returns offline error on network failure", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed"));

    const result = await lookupBarcode("1234567890123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("offline");
    }
  });

  it("returns unknown error on non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await lookupBarcode("1234567890123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("unknown");
    }
  });

  it("calls the correct barcode API URL", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 0, product: null }),
    });

    await lookupBarcode("7394376616037");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/product/7394376616037"),
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.any(String) }),
      })
    );
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
