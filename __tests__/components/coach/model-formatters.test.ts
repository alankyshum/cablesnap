import {
  formatCachedTimestamp,
  formatContextLength,
  formatModelPricing,
  formatTokenPrice,
} from "@/components/coach/model-formatters";

describe("model-formatters", () => {
  describe("formatTokenPrice", () => {
    it("formats standard per-token pricing into per-1M string", () => {
      expect(formatTokenPrice("0.00000015")).toBe("$0.15/1M");
      expect(formatTokenPrice("0.000001")).toBe("$1.00/1M");
      expect(formatTokenPrice("0.0000055")).toBe("$5.50/1M");
    });

    it("formats sub-cent pricing with extra decimal precision", () => {
      expect(formatTokenPrice("0.000000005")).toBe("$0.0050/1M");
    });

    it("handles zero and undefined gracefully", () => {
      expect(formatTokenPrice("0")).toBe("$0.00");
      expect(formatTokenPrice("0.0")).toBe("$0.00");
      expect(formatTokenPrice(undefined)).toBe("$0.00");
      expect(formatTokenPrice("invalid")).toBe("$0.00");
    });
  });

  describe("formatModelPricing", () => {
    it("returns 'Free' when prompt and completion are zero", () => {
      expect(formatModelPricing({ prompt: "0", completion: "0" })).toBe("Free");
      expect(formatModelPricing({ prompt: "0.0", completion: "0.0" })).toBe("Free");
    });

    it("formats prompt and completion pricing", () => {
      expect(
        formatModelPricing({
          prompt: "0.00000015",
          completion: "0.0000006",
        })
      ).toBe("Prompt: $0.15/1M · Comp: $0.60/1M");
    });

    it("handles undefined pricing gracefully", () => {
      expect(formatModelPricing(undefined)).toBe("Pricing unavailable");
    });
  });

  describe("formatContextLength", () => {
    it("formats millions of tokens", () => {
      expect(formatContextLength(1_000_000)).toBe("1M context");
      expect(formatContextLength(2_000_000)).toBe("2M context");
      expect(formatContextLength(1_500_000)).toBe("1.5M context");
    });

    it("formats thousands of tokens", () => {
      expect(formatContextLength(128_000)).toBe("128k context");
      expect(formatContextLength(200_000)).toBe("200k context");
      expect(formatContextLength(32_768)).toBe("32.8k context");
      expect(formatContextLength(32_000)).toBe("32k context");
    });

    it("formats small token counts with commas", () => {
      expect(formatContextLength(512)).toBe("512 tokens");
    });

    it("handles null and undefined context lengths", () => {
      expect(formatContextLength(null)).toBe("Unknown context");
      expect(formatContextLength(undefined)).toBe("Unknown context");
    });
  });

  describe("formatCachedTimestamp", () => {
    it("formats numeric timestamps", () => {
      const ts = new Date(2026, 7, 18, 14, 30).getTime();
      const formatted = formatCachedTimestamp(ts);
      expect(typeof formatted).toBe("string");
      expect(formatted.length).toBeGreaterThan(0);
    });

    it("handles missing timestamp", () => {
      expect(formatCachedTimestamp(0)).toBe("recently");
    });
  });
});
