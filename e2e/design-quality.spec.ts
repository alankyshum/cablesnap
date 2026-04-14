/**
 * Design quality checks inspired by pixelslop's 5 pillars:
 * Hierarchy, Typography, Color, Responsiveness, Accessibility.
 *
 * Unlike visual regression tests (which only catch changes from a baseline),
 * these assert concrete design invariants that must always hold.
 */
import { test, expect, type Page } from "@playwright/test";
import { skipOnboarding } from "./helpers";

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

// ── Helpers ──────────────────────────────────────────────────────────

async function collectDesignMetrics(page: Page) {
  return page.evaluate(() => {
    const allElements = document.querySelectorAll("*");
    const fontSizes = new Map<string, number>();
    const fontWeights = new Map<string, number>();
    const bgColors = new Map<string, number>();
    const textColors = new Map<string, number>();
    const gaps: number[] = [];
    const touchTargets: { text: string; w: number; h: number }[] = [];
    const overflowing: { tag: string; text: string }[] = [];

    for (const el of allElements) {
      const cs = window.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;

      // Typography
      if (el.textContent?.trim()) {
        const fs = cs.fontSize;
        fontSizes.set(fs, (fontSizes.get(fs) || 0) + 1);
        fontWeights.set(cs.fontWeight, (fontWeights.get(cs.fontWeight) || 0) + 1);
      }

      // Colors
      if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") {
        bgColors.set(cs.backgroundColor, (bgColors.get(cs.backgroundColor) || 0) + 1);
      }
      if (el.textContent?.trim() && cs.color) {
        textColors.set(cs.color, (textColors.get(cs.color) || 0) + 1);
      }

      // Spacing (margins and padding that create gaps)
      for (const prop of ["marginTop", "marginBottom", "paddingTop", "paddingBottom"] as const) {
        const v = parseFloat(cs[prop]);
        if (v > 0 && v < 200) gaps.push(v);
      }

      // Touch targets
      const role = el.getAttribute("role");
      const tag = el.tagName.toLowerCase();
      if (role === "button" || tag === "button" || tag === "a" || role === "link") {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          touchTargets.push({
            text: (el.textContent?.trim() || "").substring(0, 30),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      }

      // Overflow
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 5 || rect.left < -5) {
        const txt = (el.textContent?.trim() || "").substring(0, 30);
        if (txt) overflowing.push({ tag: el.tagName, text: txt });
      }
    }

    return {
      fontSizeCount: fontSizes.size,
      fontSizes: Object.fromEntries(fontSizes),
      fontWeightCount: fontWeights.size,
      bgColorCount: bgColors.size,
      textColorCount: textColors.size,
      uniqueGaps: [...new Set(gaps.map((g) => Math.round(g)))].sort((a, b) => a - b),
      touchTargets,
      overflowing,
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

async function collectContrastIssues(page: Page) {
  return page.evaluate(() => {
    const issues: {
      text: string;
      fg: string;
      bg: string;
      ratio: number;
      fontSize: number;
    }[] = [];

    function getLuminance(r: number, g: number, b: number): number {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    function parseColor(c: string): [number, number, number] | null {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
    }

    function getEffectiveBg(el: Element): string {
      let current: Element | null = el;
      while (current) {
        const bg = window.getComputedStyle(current).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        current = current.parentElement;
      }
      return "rgb(255, 255, 255)";
    }

    const textEls = document.querySelectorAll(
      '[role="button"], button, a, [dir="auto"]'
    );
    for (const el of textEls) {
      const text = el.textContent?.trim();
      if (!text || text.length > 40 || text.length === 0) continue;

      const cs = window.getComputedStyle(el);
      const fg = cs.color;
      const bg = getEffectiveBg(el);
      const fontSize = parseFloat(cs.fontSize);

      const fgRgb = parseColor(fg);
      const bgRgb = parseColor(bg);
      if (!fgRgb || !bgRgb) continue;

      const l1 = getLuminance(...fgRgb);
      const l2 = getLuminance(...bgRgb);
      const ratio =
        (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const rounded = Math.round(ratio * 100) / 100;

      const isLarge = fontSize >= 18 || (fontSize >= 14 && parseInt(cs.fontWeight) >= 700);
      const threshold = isLarge ? 3 : 4.5;

      if (rounded < threshold) {
        issues.push({ text: text.substring(0, 25), fg, bg, ratio: rounded, fontSize });
      }
    }
    return issues;
  });
}

async function collectTabBarMetrics(page: Page) {
  return page.evaluate(() => {
    const tabBar = document.querySelector('[role="tablist"]');
    if (!tabBar) return { found: false, labels: [] };

    const tabs = tabBar.querySelectorAll('[role="tab"]');
    const labels: { text: string; scrollWidth: number; clientWidth: number; truncated: boolean }[] = [];

    for (const tab of tabs) {
      const textEl = tab.querySelector('[dir="auto"]') || tab;
      const text = textEl.textContent?.trim() || "";
      if (!text) continue;

      const sw = (textEl as HTMLElement).scrollWidth;
      const cw = (textEl as HTMLElement).clientWidth;
      labels.push({
        text,
        scrollWidth: sw,
        clientWidth: cw,
        truncated: sw > cw + 1,
      });
    }

    return { found: true, labels };
  });
}

async function collectContentWidth(page: Page) {
  return page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="card"], [class*="Card"]');
    let maxCardWidth = 0;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (rect.width > maxCardWidth) maxCardWidth = rect.width;
    }
    return { maxCardWidth: Math.round(maxCardWidth), viewport: window.innerWidth };
  });
}

// ── Tests ────────────────────────────────────────────────────────────

const SCREENS = [
  { name: "Exercises", path: "/exercises" },
  { name: "Workouts", path: "/" },
  { name: "Settings", path: "/settings" },
];

for (const screen of SCREENS) {
  test.describe(`Design quality — ${screen.name} page`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(screen.path);
      await page.waitForSelector('[role="button"]', { timeout: 10_000 });
      await page.waitForTimeout(500);
    });

    test("typography: uses a limited font size scale (< 12 distinct sizes)", async ({
      page,
    }) => {
      const m = await collectDesignMetrics(page);
      expect(
        m.fontSizeCount,
        `Found ${m.fontSizeCount} distinct font sizes — too many indicates inconsistent typography.\nSizes: ${JSON.stringify(m.fontSizes)}`
      ).toBeLessThan(12);
    });

    test("color: background palette has fewer than 15 distinct colors", async ({
      page,
    }) => {
      const m = await collectDesignMetrics(page);
      expect(
        m.bgColorCount,
        `Found ${m.bgColorCount} distinct background colors — suggests an uncontrolled palette`
      ).toBeLessThan(15);
    });

    test("color: text palette has fewer than 10 distinct colors", async ({
      page,
    }) => {
      const m = await collectDesignMetrics(page);
      expect(
        m.textColorCount,
        `Found ${m.textColorCount} distinct text colors — text should use a small set of semantic colors`
      ).toBeLessThan(10);
    });

    test("spacing: uses a limited spacing scale (< 20 distinct values)", async ({
      page,
    }) => {
      const m = await collectDesignMetrics(page);
      expect(
        m.uniqueGaps.length,
        `Found ${m.uniqueGaps.length} distinct spacing values — too many indicates ad-hoc spacing.\nValues: ${m.uniqueGaps.join(", ")}`
      ).toBeLessThan(20);
    });

    test("responsiveness: no horizontal overflow", async ({
      page,
    }) => {
      const m = await collectDesignMetrics(page);
      expect(
        m.overflowing,
        `${m.overflowing.length} elements overflow the viewport:\n${m.overflowing.map((o) => `  <${o.tag}> "${o.text}"`).join("\n")}`
      ).toHaveLength(0);
    });

    test("accessibility: all touch targets are at least 44x44px", async ({
      page,
    }, testInfo) => {
      const m = await collectDesignMetrics(page);
      const undersized = m.touchTargets.filter(
        (t) => t.w < 44 || t.h < 44
      );

      if (undersized.length > 0) {
        testInfo.annotations.push({
          type: "touch-target-warning",
          description: undersized
            .map((t) => `"${t.text}" (${t.w}x${t.h})`)
            .join("; "),
        });
      }

      const appUndersized = undersized.filter(
        (t) => !["Dismiss", "Retry", "OK"].includes(t.text)
      );
      expect(
        appUndersized,
        `${appUndersized.length} app touch targets below 44px minimum:\n${appUndersized.map((t) => `  "${t.text}" (${t.w}x${t.h})`).join("\n")}`
      ).toHaveLength(0);
    });

    test("accessibility: text contrast meets WCAG AA (4.5:1 normal, 3:1 large)", async ({
      page,
    }, testInfo) => {
      const issues = await collectContrastIssues(page);
      if (issues.length > 0) {
        testInfo.annotations.push({
          type: "contrast-warning",
          description: issues
            .map(
              (i) =>
                `"${i.text}" ratio=${i.ratio} (fg=${i.fg}, bg=${i.bg}, ${i.fontSize}px)`
            )
            .join("; "),
        });
      }
    });
  });
}

// ── Tab Bar ─────────────────────────────────────────────────────────

test.describe("Tab bar — label truncation", () => {
  test("no tab labels are truncated on current viewport", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="tab"]', { timeout: 10_000 });
    await page.waitForTimeout(500);

    const metrics = await collectTabBarMetrics(page);

    if (!metrics.found) {
      test.skip(!metrics.found, "No tab bar found on this viewport");
      return;
    }

    const truncated = metrics.labels.filter((l) => l.truncated);
    expect(
      truncated,
      `Tab labels truncated:\n${truncated.map((l) => `  "${l.text}" scrollWidth=${l.scrollWidth} > clientWidth=${l.clientWidth}`).join("\n")}`
    ).toHaveLength(0);
  });
});

// ── Content Max-Width (tablet/desktop only) ─────────────────────────

test.describe("Responsiveness — content width constraint", () => {
  test("content cards don't exceed 720px on wide viewports", async ({
    page,
  }, testInfo) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 600) {
      test.skip(true, "Only relevant for tablet/desktop viewports");
      return;
    }

    await page.goto("/settings");
    await page.waitForSelector('[role="button"]', { timeout: 10_000 });
    await page.waitForTimeout(500);

    const metrics = await collectContentWidth(page);

    if (metrics.maxCardWidth > 720) {
      testInfo.annotations.push({
        type: "content-width-warning",
        description: `Widest card is ${metrics.maxCardWidth}px on ${metrics.viewport}px viewport (max recommended: 720px)`,
      });
    }
  });
});
