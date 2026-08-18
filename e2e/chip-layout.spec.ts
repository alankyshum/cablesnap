import { test, expect } from "@playwright/test";
import { skipOnboarding } from "./helpers";

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

test.describe("Chip vertical alignment", () => {
  test("all chip outer heights accommodate their inner content", async ({
    page,
  }) => {
    await page.goto("/exercises");
    await page.waitForSelector('[role="button"]', { timeout: 10_000 });
    await page.waitForTimeout(500);

    const misaligned = await page.evaluate(() => {
      const issues: {
        text: string;
        outerHeight: number;
        innerHeight: number;
      }[] = [];

      const buttons = document.querySelectorAll('[role="button"]');
      for (const el of buttons) {
        const text = el.textContent?.trim();
        if (!text || text.length > 30 || text.length === 1) continue;

        const outerHeight = el.getBoundingClientRect().height;
        if (outerHeight > 60) continue; // Skip large cards/dialogs
        const inner = el.querySelector("div");
        if (!inner) continue;
        const innerHeight = inner.getBoundingClientRect().height;

        if (innerHeight > outerHeight + 1) {
          issues.push({
            text: text.substring(0, 20),
            outerHeight: Math.round(outerHeight),
            innerHeight: Math.round(innerHeight),
          });
        }
      }
      return issues;
    });

    expect(
      misaligned,
      `Chips with inner content taller than outer container (text gets clipped/misaligned):\n${misaligned.map((c) => `  "${c.text}": outer=${c.outerHeight}px, inner=${c.innerHeight}px`).join("\n")}`
    ).toHaveLength(0);
  });

  test("chip text is vertically centered", async ({ page }) => {
    await page.goto("/exercises");
    await page.waitForSelector('[role="button"]', { timeout: 10_000 });
    await page.waitForTimeout(500);

    const offCenter = await page.evaluate(() => {
      const issues: { text: string; topGap: number; bottomGap: number }[] = [];

      const buttons = document.querySelectorAll('[role="button"]');
      for (const el of buttons) {
        const text = el.textContent?.trim();
        if (!text || text.length > 30 || text.length === 1) continue;

        const outerRect = el.getBoundingClientRect();
        if (outerRect.height > 60) continue; // Skip large cards/dialogs
        const textNodes = el.querySelectorAll('[dir="auto"]');
        for (const tn of textNodes) {
          const textRect = tn.getBoundingClientRect();
          if (textRect.height === 0) continue;

          const topGap = textRect.top - outerRect.top;
          const bottomGap = outerRect.bottom - textRect.bottom;
          const drift = Math.abs(topGap - bottomGap);

          if (drift > 4) {
            issues.push({
              text: text.substring(0, 20),
              topGap: Math.round(topGap),
              bottomGap: Math.round(bottomGap),
            });
            break;
          }
        }
      }
      return issues;
    });

    expect(
      offCenter,
      `Chips with off-center text (top/bottom gap differ by >4px):\n${offCenter.map((c) => `  "${c.text}": top=${c.topGap}px, bottom=${c.bottomGap}px`).join("\n")}`
    ).toHaveLength(0);
  });
});
